/**
 * Recherche — ce qui fait « réfléchir » l'adversaire.
 *
 * Le moteur d'origine tenait en vingt lignes : minimax à profondeur fixe, sans
 * ordre de coups, sans mémoire, et surtout sans quiescence. Il regardait deux
 * ou trois coups devant lui puis mesurait la position au beau milieu d'un
 * échange — « je prends la dame » sans voir la reprise. À profondeur faible,
 * tous les coups tranquilles se valaient à quelques points près, le choix
 * final se faisait au hasard, et l'adversaire semblait ne rien avoir en tête.
 *
 * Ce module fait ce que fait tout moteur sérieux :
 * - approfondissement itératif, borné par le temps ou le nombre de nœuds ;
 * - élagage alpha-bêta en fenêtre nulle (PVS) ;
 * - table de transposition (une position vue deux fois n'est calculée qu'une) ;
 * - quiescence : on ne mesure une position que lorsque les prises sont finies ;
 * - ordre des coups : coup de la table, prises (la plus grosse victime avec la
 *   plus petite pièce d'abord), coups « tueurs », historique ;
 * - coup nul et réductions des coups tardifs ;
 * - détection des répétitions et des nulles, avec un léger refus de la nulle.
 */
import { aDesPieces, evaluer, VAL_MJ } from './evaluation';
import {
  F_EP,
  F_PRISE,
  MAX_COUPS,
  MAX_PLY,
  P,
  Plateau,
  coupsLegaux,
  deCase,
  drapDe,
  promoDe,
  versCase,
} from './plateau';

export const MAT = 30000;
export const MAT_LIMITE = MAT - 200;
const INF = 32000;

export interface Limites {
  /** Profondeur maximale de l'approfondissement itératif. */
  profondeur: number;
  /** Plafond de temps, en millisecondes. */
  tempsMs?: number;
  /** Plafond de nœuds : le seul réglage déterministe, pour les tests. */
  noeuds?: number;
  /**
   * Profondeur maximale de la quiescence. 0 la supprime : le moteur mesure
   * alors la position en pleine bataille, comme un débutant qui ne voit pas la
   * reprise.
   */
  qmax?: number;
  /** Aversion pour la nulle, en centièmes de pion (positif = l'évite). */
  mepris?: number;
}

export interface Resultat {
  coup: number;
  /** Score du point de vue du camp au trait, en centièmes de pion. */
  score: number;
  profondeur: number;
  noeuds: number;
  pv: number[];
}

const TT_EXACT = 0;
const TT_BAS = 1; // le score est un minorant (coupure bêta)
const TT_HAUT = 2; // le score est un majorant

/** Table de transposition : clés de 32 bits vérifiées par un second mot. */
class Table {
  readonly masque: number;
  readonly cle: Int32Array;
  readonly score: Int16Array;
  readonly prof: Int8Array;
  readonly type: Int8Array;
  readonly coup: Int32Array;

  constructor(bits: number) {
    const taille = 1 << bits;
    this.masque = taille - 1;
    this.cle = new Int32Array(taille);
    this.score = new Int16Array(taille);
    this.prof = new Int8Array(taille).fill(-1);
    this.type = new Int8Array(taille);
    this.coup = new Int32Array(taille);
  }

  vider(): void {
    this.prof.fill(-1);
  }
}

const VALEUR_TRI = [0, 100, 320, 335, 500, 950, 20000];

export class Chercheur {
  private readonly table: Table;
  private readonly tueurs = new Int32Array(MAX_PLY * 2);
  private readonly histoire = new Int32Array(2 * 64 * 64);
  private p!: Plateau;
  private noeuds = 0;
  private debut = 0;
  private tempsMs = 0;
  private noeudsMax = 0;
  private arret = false;
  private qmax = 8;
  private mepris = 0;
  private campRacine = 0;

  constructor(bitsTable = 18) {
    this.table = new Table(bitsTable);
  }

  /** Efface ce que le moteur a appris : à faire entre deux parties. */
  oublier(): void {
    this.table.vider();
    this.tueurs.fill(0);
    this.histoire.fill(0);
  }

  private verifierLimites(): void {
    if (this.noeudsMax > 0 && this.noeuds >= this.noeudsMax) this.arret = true;
    else if (this.tempsMs > 0 && Date.now() - this.debut >= this.tempsMs) this.arret = true;
  }

  /** Score d'une nulle, du point de vue du camp au trait du nœud. */
  private nulle(): number {
    return this.p.trait === this.campRacine ? -this.mepris : this.mepris;
  }

  // ------------------------------------------------------------- ordre

  private noter(ply: number, n: number, coupTable: number): void {
    const p = this.p;
    const base = ply * MAX_COUPS;
    const camp = p.trait;
    const cs = p.cases;
    for (let i = 0; i < n; i += 1) {
      const m = p.pile[base + i];
      let note: number;
      if (m === coupTable) {
        note = 4_000_000;
      } else {
        const fl = drapDe(m);
        const promo = promoDe(m);
        if (fl & F_PRISE) {
          const victime = fl & F_EP ? P : cs[versCase(m)] & 7;
          const attaquant = cs[deCase(m)] & 7;
          note = 2_000_000 + VALEUR_TRI[victime] * 10 - VALEUR_TRI[attaquant];
        } else if (promo) {
          note = 1_900_000 + promo;
        } else if (m === this.tueurs[ply * 2]) {
          note = 1_000_000;
        } else if (m === this.tueurs[ply * 2 + 1]) {
          note = 999_000;
        } else {
          note = this.histoire[(camp * 64 + deCase(m)) * 64 + versCase(m)];
        }
      }
      p.notes[base + i] = note;
    }
  }

  /** Amène au rang `i` le coup de meilleure note (tri par sélection). */
  private choisir(ply: number, i: number, n: number): number {
    const p = this.p;
    const base = ply * MAX_COUPS;
    let meilleur = i;
    let note = p.notes[base + i];
    for (let j = i + 1; j < n; j += 1) {
      if (p.notes[base + j] > note) {
        note = p.notes[base + j];
        meilleur = j;
      }
    }
    if (meilleur !== i) {
      const m = p.pile[base + i];
      p.pile[base + i] = p.pile[base + meilleur];
      p.pile[base + meilleur] = m;
      const v = p.notes[base + i];
      p.notes[base + i] = p.notes[base + meilleur];
      p.notes[base + meilleur] = v;
    }
    return p.pile[base + i];
  }

  // -------------------------------------------------------- quiescence

  private quiescence(alpha: number, beta: number, ply: number, q: number): number {
    if ((++this.noeuds & 2047) === 0) this.verifierLimites();
    if (this.arret) return 0;
    const p = this.p;
    if (ply >= MAX_PLY - 2) return evaluer(p);

    const enEchec = p.enEchec(p.trait);
    let stand = -INF;
    if (!enEchec) {
      stand = evaluer(p);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (q >= this.qmax) return stand;
    } else if (q >= this.qmax + 4) {
      // une suite d'échecs ne doit pas creuser sans fin
      return evaluer(p);
    }

    const n = p.generer(ply, !enEchec);
    this.noter(ply, n, 0);
    let legaux = 0;
    let meilleur = stand;
    const camp = p.trait;
    for (let i = 0; i < n; i += 1) {
      const m = this.choisir(ply, i, n);
      // élagage : une prise qui, même gagnante, ne rattrape pas alpha
      if (!enEchec && !promoDe(m)) {
        const fl = drapDe(m);
        const victime = fl & F_EP ? P : p.cases[versCase(m)] & 7;
        if (stand + VAL_MJ[victime] + 200 < alpha) continue;
      }
      p.faire(m);
      if (p.enEchec(camp)) {
        p.defaire();
        continue;
      }
      legaux += 1;
      const score = -this.quiescence(-beta, -alpha, ply + 1, q + 1);
      p.defaire();
      if (this.arret) return 0;
      if (score > meilleur) {
        meilleur = score;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) return score;
        }
      }
    }
    if (enEchec && legaux === 0) return -MAT + ply;
    return meilleur;
  }

  // ---------------------------------------------------------- recherche

  private negamax(prof: number, alpha: number, beta: number, ply: number, nulOk: boolean): number {
    if ((++this.noeuds & 2047) === 0) this.verifierLimites();
    if (this.arret) return 0;
    const p = this.p;
    const estPV = beta - alpha > 1;

    if (ply > 0) {
      if (p.repetee() || (p.demi >= 100 && !p.enEchec(p.trait))) return this.nulle();
      if (ply >= MAX_PLY - 2) return evaluer(p);
      // un mat plus proche est déjà connu : inutile de chercher plus loin
      if (alpha < -MAT + ply) alpha = -MAT + ply;
      if (beta > MAT - ply - 1) beta = MAT - ply - 1;
      if (alpha >= beta) return alpha;
    }

    const enEchec = p.enEchec(p.trait);
    if (enEchec) prof += 1;
    if (prof <= 0) {
      if (this.qmax <= 0) return evaluer(p);
      return this.quiescence(alpha, beta, ply, 0);
    }

    // table de transposition
    const t = this.table;
    const idx = p.lo & t.masque;
    let coupTable = 0;
    if (t.prof[idx] >= 0 && t.cle[idx] === p.hi) {
      coupTable = t.coup[idx];
      if (t.prof[idx] >= prof && ply > 0) {
        let s = t.score[idx];
        if (s >= MAT_LIMITE) s -= ply;
        else if (s <= -MAT_LIMITE) s += ply;
        const type = t.type[idx];
        if (type === TT_EXACT && !estPV) return s;
        if (type === TT_BAS && s >= beta) return s;
        if (type === TT_HAUT && s <= alpha) return s;
      }
    }

    // coup nul : si passer son tour suffit à battre bêta, la position est trop bonne
    if (nulOk && !estPV && !enEchec && prof >= 3 && aDesPieces(p, p.trait)) {
      p.faireNul();
      const r = prof > 6 ? 3 : 2;
      const s = -this.negamax(prof - 1 - r, -beta, -beta + 1, ply + 1, false);
      p.defaireNul();
      if (this.arret) return 0;
      if (s >= beta) return s >= MAT_LIMITE ? beta : s;
    }

    const n = p.generer(ply, false);
    this.noter(ply, n, coupTable);
    const camp = p.trait;
    const alphaInitial = alpha;
    let meilleur = -INF;
    let meilleurCoup = 0;
    let legaux = 0;

    for (let i = 0; i < n; i += 1) {
      const m = this.choisir(ply, i, n);
      p.faire(m);
      if (p.enEchec(camp)) {
        p.defaire();
        continue;
      }
      legaux += 1;
      const calme = !(drapDe(m) & F_PRISE) && !promoDe(m);
      let score: number;
      if (legaux === 1) {
        score = -this.negamax(prof - 1, -beta, -alpha, ply + 1, true);
      } else {
        // coups tardifs et tranquilles : on les regarde moins profondément
        let red = 0;
        if (calme && !enEchec && prof >= 3 && legaux > 4) red = legaux > 10 && prof >= 6 ? 2 : 1;
        score = -this.negamax(prof - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && red > 0) {
          score = -this.negamax(prof - 1, -alpha - 1, -alpha, ply + 1, true);
        }
        if (score > alpha && score < beta) {
          score = -this.negamax(prof - 1, -beta, -alpha, ply + 1, true);
        }
      }
      p.defaire();
      if (this.arret) return 0;

      if (score > meilleur) {
        meilleur = score;
        meilleurCoup = m;
        if (score > alpha) {
          alpha = score;
          if (alpha >= beta) {
            if (calme) {
              if (this.tueurs[ply * 2] !== m) {
                this.tueurs[ply * 2 + 1] = this.tueurs[ply * 2];
                this.tueurs[ply * 2] = m;
              }
              this.histoire[(camp * 64 + deCase(m)) * 64 + versCase(m)] += prof * prof;
            }
            break;
          }
        }
      }
    }

    if (legaux === 0) return enEchec ? -MAT + ply : this.nulle();

    // mémoriser
    let stocke = meilleur;
    if (stocke >= MAT_LIMITE) stocke += ply;
    else if (stocke <= -MAT_LIMITE) stocke -= ply;
    if (t.prof[idx] < 0 || t.cle[idx] !== p.hi || prof >= t.prof[idx] - 2) {
      t.cle[idx] = p.hi;
      t.score[idx] = stocke;
      t.prof[idx] = prof;
      t.type[idx] = meilleur <= alphaInitial ? TT_HAUT : meilleur >= beta ? TT_BAS : TT_EXACT;
      t.coup[idx] = meilleurCoup;
    }
    return meilleur;
  }

  // -------------------------------------------------------------- racine

  private preparer(p: Plateau, lim: Limites): void {
    this.p = p;
    this.noeuds = 0;
    this.debut = Date.now();
    this.tempsMs = lim.tempsMs ?? 0;
    this.noeudsMax = lim.noeuds ?? 0;
    this.arret = false;
    this.qmax = lim.qmax ?? 8;
    this.mepris = lim.mepris ?? 0;
    this.campRacine = p.trait;
    this.tueurs.fill(0);
    // l'historique se dilue d'une recherche à l'autre plutôt que de s'effacer
    for (let i = 0; i < this.histoire.length; i += 1) this.histoire[i] >>= 2;
  }

  /** La suite de coups que la table de transposition croit la meilleure. */
  private extrairePV(longueur: number): number[] {
    const p = this.p;
    const pv: number[] = [];
    const t = this.table;
    let fait = 0;
    for (; fait < longueur; fait += 1) {
      const idx = p.lo & t.masque;
      if (t.prof[idx] < 0 || t.cle[idx] !== p.hi || t.coup[idx] === 0) break;
      const m = t.coup[idx];
      const camp = p.trait;
      // la table peut contenir une collision : on ne joue que du légal
      const legal = coupsLegaux(p, MAX_PLY - 1).includes(m);
      if (!legal) break;
      p.faire(m);
      if (p.enEchec(camp)) {
        p.defaire();
        break;
      }
      pv.push(m);
    }
    for (let i = 0; i < fait && i < pv.length; i += 1) p.defaire();
    return pv;
  }

  /**
   * Cherche le meilleur coup par approfondissement itératif.
   *
   * La profondeur 1 est toujours menée à terme, quelle que soit la limite :
   * on n'a jamais le droit de ne rien répondre.
   */
  chercher(p: Plateau, lim: Limites): Resultat | null {
    this.preparer(p, lim);
    const racine = coupsLegaux(p, 0);
    if (racine.length === 0) return null;

    let meilleurCoup = racine[0];
    let meilleurScore = 0;
    let profFaite = 0;

    for (let prof = 1; prof <= lim.profondeur; prof += 1) {
      // le meilleur coup de l'itération précédente se joue en premier
      const ordre = racine.slice();
      const i0 = ordre.indexOf(meilleurCoup);
      if (i0 > 0) {
        ordre.splice(i0, 1);
        ordre.unshift(meilleurCoup);
      }
      let alpha = -INF;
      let meilleurIter = 0;
      let scoreIter = -INF;
      const limiteAvant = this.tempsMs;
      if (prof === 1) this.tempsMs = 0; // la profondeur 1 n'est jamais interrompue
      const noeudsAvant = this.noeudsMax;
      if (prof === 1) this.noeudsMax = 0;

      for (let i = 0; i < ordre.length; i += 1) {
        const m = ordre[i];
        p.faire(m);
        let score: number;
        if (i === 0) {
          score = -this.negamax(prof - 1, -INF, -alpha, 1, true);
        } else {
          score = -this.negamax(prof - 1, -alpha - 1, -alpha, 1, true);
          if (score > alpha && !this.arret) score = -this.negamax(prof - 1, -INF, -alpha, 1, true);
        }
        p.defaire();
        if (this.arret) break;
        if (score > scoreIter) {
          scoreIter = score;
          meilleurIter = m;
          if (score > alpha) alpha = score;
        }
      }
      this.tempsMs = limiteAvant;
      this.noeudsMax = noeudsAvant;

      // une itération interrompue vaut ce qu'elle a trouvé si elle a fini le premier coup
      if (meilleurIter !== 0) {
        meilleurCoup = meilleurIter;
        meilleurScore = scoreIter;
      }
      if (!this.arret) profFaite = prof;
      if (this.arret) break;
      // un mat trouvé ne s'améliorera pas avec plus de profondeur
      if (Math.abs(meilleurScore) >= MAT_LIMITE && prof >= 2) break;
      if (this.tempsMs > 0 && Date.now() - this.debut >= this.tempsMs * 0.6) break;
    }

    const pv = [meilleurCoup, ...this.pvApres(meilleurCoup, 12)];
    return { coup: meilleurCoup, score: meilleurScore, profondeur: profFaite, noeuds: this.noeuds, pv };
  }

  private pvApres(m: number, longueur: number): number[] {
    this.p.faire(m);
    const suite = this.extrairePV(longueur);
    this.p.defaire();
    return suite;
  }

  /** Score exact d'un coup donné, en fenêtre complète, du point de vue de celui qui le joue. */
  scorerCoup(p: Plateau, m: number, lim: Limites): number {
    this.preparer(p, lim);
    p.faire(m);
    const score = -this.negamax(Math.max(0, lim.profondeur - 1), -INF, INF, 1, true);
    p.defaire();
    return score;
  }

  /**
   * Score de chaque coup de la racine, dans une fenêtre autour du meilleur.
   *
   * C'est ce qui permet de jouer « comme un humain » : au lieu de prendre
   * toujours le meilleur coup ou un coup tiré au hasard, on choisit parmi les
   * coups raisonnables, en pondérant par leur score. Les coups hors de la
   * fenêtre ne sont pas calculés exactement — on sait seulement qu'ils sont
   * moins bons — ce qui évite de chercher chaque coup à fond.
   */
  scorer(p: Plateau, lim: Limites, fenetre: number): { coup: number; score: number }[] {
    this.preparer(p, lim);
    const racine = coupsLegaux(p, 0);
    if (racine.length === 0) return [];
    // un premier passage trie les coups : le meilleur d'abord raccourcit tout le reste
    const premier = this.chercher(p, { ...lim, profondeur: Math.max(1, lim.profondeur - 1) });
    this.preparer(p, lim);
    const ordre = racine.slice();
    if (premier) {
      const i0 = ordre.indexOf(premier.coup);
      if (i0 > 0) {
        ordre.splice(i0, 1);
        ordre.unshift(premier.coup);
      }
    }
    const notes: { coup: number; score: number }[] = [];
    let meilleur = -INF;
    for (let i = 0; i < ordre.length; i += 1) {
      const m = ordre[i];
      const alpha = i === 0 ? -INF : meilleur - fenetre - 1;
      p.faire(m);
      const score = -this.negamax(Math.max(0, lim.profondeur - 1), -INF, -alpha, 1, true);
      p.defaire();
      if (this.arret) break;
      // en deçà de la fenêtre, le score n'est qu'un majorant : on l'écarte
      if (i === 0 || score > alpha) notes.push({ coup: m, score });
      if (score > meilleur) meilleur = score;
    }
    return notes.filter((n) => n.score >= meilleur - fenetre);
  }
}
