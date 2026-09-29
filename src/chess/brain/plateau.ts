/**
 * Plateau de recherche — la représentation qui rend le moteur assez rapide.
 *
 * `engine.ts` est fait pour être lu : cases lettrées, positions immuables
 * recopiées à chaque coup. C'est parfait pour les règles et l'interface, et
 * trop lent pour chercher — chaque nœud y coûte une copie du plateau et un
 * filtre de légalité par génération complète.
 *
 * Ici, tout est fait pour aller vite : cases en `Int8Array`, coups empilés en
 * entiers, `faire` / `defaire` qui modifient le plateau sur place, hachage de
 * Zobrist tenu à jour à chaque coup. La justesse n'est pas prise sur parole :
 * `perft` et une comparaison position par position avec `engine.ts` la
 * vérifient (voir `__tests__/plateau.test.ts`).
 *
 * Codes de pièces : 1 pion, 2 cavalier, 3 fou, 4 tour, 5 dame, 6 roi ; +8 pour
 * les noirs. 0 = case vide. Cases : 0 = a1, 63 = h8, comme dans `engine.ts`.
 */
import type { Move, Piece, Position } from '../engine';

export const P = 1;
export const N = 2;
export const B = 3;
export const R = 4;
export const Q = 5;
export const K = 6;
export const BLANC = 0;
export const NOIR = 1;

export const MAX_COUPS = 256;
export const MAX_PLY = 96;
const MAX_HIST = 1024;

/** Drapeaux d'un coup. */
export const F_PRISE = 1;
export const F_EP = 2;
export const F_ROQUE = 4;
export const F_DOUBLE = 8;

export const coup = (de: number, vers: number, promo = 0, drap = 0): number =>
  de | (vers << 6) | (promo << 12) | (drap << 15);
export const deCase = (m: number): number => m & 63;
export const versCase = (m: number): number => (m >> 6) & 63;
export const promoDe = (m: number): number => (m >> 12) & 7;
export const drapDe = (m: number): number => (m >> 15) & 15;

export const typeDe = (piece: number): number => piece & 7;
export const campDe = (piece: number): number => piece >> 3;

// ---------------------------------------------------------------- tables

const KNIGHT_D: readonly (readonly [number, number])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_D: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
/** 0-3 : lignes droites (N, S, E, O) ; 4-7 : diagonales (NE, NO, SE, SO). */
const DIRS: readonly (readonly [number, number])[] = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1],
];

export const CAVALIER: number[][] = [];
export const ROI: number[][] = [];
export const PION_ATT: number[][][] = [[], []];
export const RAYONS: number[][][] = DIRS.map(() => []);

for (let s = 0; s < 64; s += 1) {
  const f = s & 7;
  const r = s >> 3;
  const dans = (a: number, b: number) => a >= 0 && a < 8 && b >= 0 && b < 8;
  CAVALIER[s] = KNIGHT_D.filter(([a, b]) => dans(f + a, r + b)).map(([a, b]) => (r + b) * 8 + f + a);
  ROI[s] = KING_D.filter(([a, b]) => dans(f + a, r + b)).map(([a, b]) => (r + b) * 8 + f + a);
  PION_ATT[BLANC][s] = [-1, 1].filter((a) => dans(f + a, r + 1)).map((a) => (r + 1) * 8 + f + a);
  PION_ATT[NOIR][s] = [-1, 1].filter((a) => dans(f + a, r - 1)).map((a) => (r - 1) * 8 + f + a);
  DIRS.forEach(([a, b], d) => {
    const ray: number[] = [];
    let x = f + a;
    let y = r + b;
    while (dans(x, y)) {
      ray.push(y * 8 + x);
      x += a;
      y += b;
    }
    RAYONS[d][s] = ray;
  });
}

/** Droits de roque conservés après qu'un coup a touché cette case. */
const DROITS = new Int8Array(64).fill(15);
DROITS[0] = 15 & ~2; // tour a1 : plus de grand roque blanc
DROITS[7] = 15 & ~1; // tour h1
DROITS[4] = 15 & ~3; // roi e1
DROITS[56] = 15 & ~8; // tour a8
DROITS[63] = 15 & ~4; // tour h8
DROITS[60] = 15 & ~12; // roi e8

// Zobrist : deux mots de 32 bits par clé, tirés d'un générateur fixe — le
// hachage doit être identique d'une exécution à l'autre pour que les tests
// se rejouent.
let graine = 0x9e3779b9;
const alea32 = (): number => {
  graine ^= graine << 13;
  graine ^= graine >>> 17;
  graine ^= graine << 5;
  return graine | 0;
};
const Z_PIECE_HI = new Int32Array(16 * 64);
const Z_PIECE_LO = new Int32Array(16 * 64);
for (let i = 0; i < Z_PIECE_HI.length; i += 1) {
  Z_PIECE_HI[i] = alea32();
  Z_PIECE_LO[i] = alea32();
}
const Z_TRAIT_HI = alea32();
const Z_TRAIT_LO = alea32();
const Z_ROQUE_HI = new Int32Array(16);
const Z_ROQUE_LO = new Int32Array(16);
const Z_EP_HI = new Int32Array(8);
const Z_EP_LO = new Int32Array(8);
for (let i = 0; i < 16; i += 1) {
  Z_ROQUE_HI[i] = alea32();
  Z_ROQUE_LO[i] = alea32();
}
for (let i = 0; i < 8; i += 1) {
  Z_EP_HI[i] = alea32();
  Z_EP_LO[i] = alea32();
}

const LETTRES = 'PNBRQK';
const codeDe = (lettre: Piece): number => {
  const t = LETTRES.indexOf(lettre.toUpperCase()) + 1;
  return lettre === lettre.toUpperCase() ? t : t + 8;
};
const lettreDe = (code: number): Piece => {
  const l = LETTRES[(code & 7) - 1];
  return (code >> 3 ? l.toLowerCase() : l) as Piece;
};

// ---------------------------------------------------------------- plateau

export class Plateau {
  readonly cases = new Int8Array(64);
  trait = BLANC;
  /** Bits : 1 petit roque blanc, 2 grand blanc, 4 petit noir, 8 grand noir. */
  roque = 0;
  ep = -1;
  demi = 0;
  hi = 0;
  lo = 0;
  readonly rois = [4, 60];

  /** Historique des hachages, position courante comprise (`hHi[n]`). */
  n = 0;
  readonly hHi = new Int32Array(MAX_HIST);
  readonly hLo = new Int32Array(MAX_HIST);

  // pile de retour, indexée par `nu`
  private nu = 0;
  private readonly uCoup = new Int32Array(MAX_HIST);
  private readonly uPrise = new Int8Array(MAX_HIST);
  private readonly uRoque = new Int8Array(MAX_HIST);
  private readonly uEp = new Int8Array(MAX_HIST);
  private readonly uDemi = new Int16Array(MAX_HIST);

  /** Coups générés, `MAX_COUPS` par profondeur. */
  readonly pile = new Int32Array(MAX_PLY * MAX_COUPS);
  readonly notes = new Int32Array(MAX_PLY * MAX_COUPS);

  /** Charge une position de `engine.ts`. Efface l'historique. */
  charger(pos: Position): void {
    this.cases.fill(0);
    for (let s = 0; s < 64; s += 1) {
      const piece = pos.board[s];
      this.cases[s] = piece ? codeDe(piece) : 0;
    }
    this.trait = pos.turn === 'w' ? BLANC : NOIR;
    this.roque = (pos.castling.K ? 1 : 0) | (pos.castling.Q ? 2 : 0) | (pos.castling.k ? 4 : 0) | (pos.castling.q ? 8 : 0);
    this.ep = pos.ep;
    this.demi = pos.halfmove;
    this.rois[BLANC] = this.cases.indexOf(K);
    this.rois[NOIR] = this.cases.indexOf(K + 8);
    this.nu = 0;
    this.n = 0;
    this.recalculerHachage();
    this.hHi[0] = this.hi;
    this.hLo[0] = this.lo;
  }

  /**
   * Ajoute au passé des positions déjà jouées, dans l'ordre, pour que la
   * recherche voie les répétitions de la vraie partie. À appeler après
   * `charger`, avec les positions **précédant** la position courante.
   */
  precedees(positions: Position[]): void {
    const courant = { hi: this.hi, lo: this.lo };
    const copie = new Plateau();
    this.n = 0;
    for (const pos of positions) {
      copie.charger(pos);
      this.hHi[this.n] = copie.hi;
      this.hLo[this.n] = copie.lo;
      this.n += 1;
    }
    this.hHi[this.n] = courant.hi;
    this.hLo[this.n] = courant.lo;
  }

  /** Reconvertit la position en lettres, pour comparer avec `engine.ts`. */
  versLettres(): (Piece | null)[] {
    return Array.from(this.cases, (c) => (c ? lettreDe(c) : null));
  }

  private recalculerHachage(): void {
    let hi = 0;
    let lo = 0;
    for (let s = 0; s < 64; s += 1) {
      const c = this.cases[s];
      if (c) {
        hi ^= Z_PIECE_HI[c * 64 + s];
        lo ^= Z_PIECE_LO[c * 64 + s];
      }
    }
    if (this.trait === NOIR) {
      hi ^= Z_TRAIT_HI;
      lo ^= Z_TRAIT_LO;
    }
    hi ^= Z_ROQUE_HI[this.roque];
    lo ^= Z_ROQUE_LO[this.roque];
    const e = this.cleEp();
    if (e >= 0) {
      hi ^= Z_EP_HI[e];
      lo ^= Z_EP_LO[e];
    }
    this.hi = hi;
    this.lo = lo;
  }

  /**
   * Colonne de la prise en passant, **si elle est réellement possible**.
   *
   * La règle de répétition de la FIDE ne compte la case en passant que si un
   * pion peut effectivement prendre : sinon deux positions identiques passent
   * pour différentes, et une répétition n'est jamais vue.
   */
  private cleEp(): number {
    if (this.ep < 0) return -1;
    const f = this.ep & 7;
    const mien = P | (this.trait << 3);
    const base = this.trait === BLANC ? this.ep - 8 : this.ep + 8;
    if (f > 0 && this.cases[base - 1] === mien) return f;
    if (f < 7 && this.cases[base + 1] === mien) return f;
    return -1;
  }

  /** La case `s` est-elle attaquée par le camp `par` ? */
  attaquee(s: number, par: number): boolean {
    const cs = this.cases;
    const decal = par << 3;
    const pions = PION_ATT[par ^ 1][s];
    for (let i = 0; i < pions.length; i += 1) if (cs[pions[i]] === (P | decal)) return true;
    const cav = CAVALIER[s];
    for (let i = 0; i < cav.length; i += 1) if (cs[cav[i]] === (N | decal)) return true;
    const roi = ROI[s];
    for (let i = 0; i < roi.length; i += 1) if (cs[roi[i]] === (K | decal)) return true;
    for (let d = 0; d < 8; d += 1) {
      const ray = RAYONS[d][s];
      const droit = d < 4;
      for (let i = 0; i < ray.length; i += 1) {
        const c = cs[ray[i]];
        if (c === 0) continue;
        if ((c >> 3) === par) {
          const t = c & 7;
          if (t === Q || (droit ? t === R : t === B)) return true;
        }
        break;
      }
    }
    return false;
  }

  enEchec(camp: number): boolean {
    return this.attaquee(this.rois[camp], camp ^ 1);
  }

  /**
   * Génère les coups pseudo-légaux du camp au trait dans `pile`, à partir de
   * `ply * MAX_COUPS`. Rend leur nombre. Avec `prises`, seulement les prises
   * et les promotions en dame — ce qu'examine la quiescence.
   */
  generer(ply: number, prises: boolean): number {
    const cs = this.cases;
    const camp = this.trait;
    const decal = camp << 3;
    const pile = this.pile;
    const base = ply * MAX_COUPS;
    let n = base;
    const ennemi = camp ^ 1;

    for (let s = 0; s < 64; s += 1) {
      const c = cs[s];
      if (c === 0 || (c >> 3) !== camp) continue;
      const t = c & 7;

      if (t === P) {
        const avance = camp === BLANC ? 8 : -8;
        const rangDepart = camp === BLANC ? 1 : 6;
        const rangPromo = camp === BLANC ? 7 : 0;
        const rang = s >> 3;
        const f = s & 7;
        const devant = s + avance;
        if (cs[devant] === 0) {
          if ((devant >> 3) === rangPromo) {
            pile[n++] = coup(s, devant, Q);
            if (!prises) {
              pile[n++] = coup(s, devant, R);
              pile[n++] = coup(s, devant, B);
              pile[n++] = coup(s, devant, N);
            }
          } else if (!prises) {
            pile[n++] = coup(s, devant);
            if (rang === rangDepart && cs[devant + avance] === 0) {
              pile[n++] = coup(s, devant + avance, 0, F_DOUBLE);
            }
          }
        }
        const cibles = PION_ATT[camp][s];
        for (let i = 0; i < cibles.length; i += 1) {
          const to = cibles[i];
          const victime = cs[to];
          if (victime !== 0 && (victime >> 3) === ennemi) {
            if ((to >> 3) === rangPromo) {
              pile[n++] = coup(s, to, Q, F_PRISE);
              if (!prises) {
                pile[n++] = coup(s, to, R, F_PRISE);
                pile[n++] = coup(s, to, B, F_PRISE);
                pile[n++] = coup(s, to, N, F_PRISE);
              }
            } else {
              pile[n++] = coup(s, to, 0, F_PRISE);
            }
          } else if (to === this.ep && victime === 0) {
            pile[n++] = coup(s, to, 0, F_PRISE | F_EP);
          }
        }
        void f;
      } else if (t === N || t === K) {
        const cibles = t === N ? CAVALIER[s] : ROI[s];
        for (let i = 0; i < cibles.length; i += 1) {
          const to = cibles[i];
          const v = cs[to];
          if (v === 0) {
            if (!prises) pile[n++] = coup(s, to);
          } else if ((v >> 3) === ennemi) {
            pile[n++] = coup(s, to, 0, F_PRISE);
          }
        }
        if (t === K && !prises) {
          const rang0 = camp === BLANC ? 0 : 56;
          if (s === rang0 + 4 && !this.attaquee(s, ennemi)) {
            const petit = camp === BLANC ? 1 : 4;
            const grand = camp === BLANC ? 2 : 8;
            if (
              (this.roque & petit) &&
              cs[rang0 + 5] === 0 && cs[rang0 + 6] === 0 &&
              cs[rang0 + 7] === (R | decal) &&
              !this.attaquee(rang0 + 5, ennemi) && !this.attaquee(rang0 + 6, ennemi)
            ) {
              pile[n++] = coup(s, rang0 + 6, 0, F_ROQUE);
            }
            if (
              (this.roque & grand) &&
              cs[rang0 + 3] === 0 && cs[rang0 + 2] === 0 && cs[rang0 + 1] === 0 &&
              cs[rang0] === (R | decal) &&
              !this.attaquee(rang0 + 3, ennemi) && !this.attaquee(rang0 + 2, ennemi)
            ) {
              pile[n++] = coup(s, rang0 + 2, 0, F_ROQUE);
            }
          }
        }
      } else {
        const d0 = t === B ? 4 : 0;
        const d1 = t === R ? 4 : 8;
        for (let d = d0; d < d1; d += 1) {
          const ray = RAYONS[d][s];
          for (let i = 0; i < ray.length; i += 1) {
            const to = ray[i];
            const v = cs[to];
            if (v === 0) {
              if (!prises) pile[n++] = coup(s, to);
            } else {
              if ((v >> 3) === ennemi) pile[n++] = coup(s, to, 0, F_PRISE);
              break;
            }
          }
        }
      }
    }
    return n - base;
  }

  /** Joue un coup pseudo-légal, sur place. `defaire` le retire. */
  faire(m: number): void {
    const de = m & 63;
    const a = (m >> 6) & 63;
    const pr = (m >> 12) & 7;
    const fl = (m >> 15) & 15;
    const cs = this.cases;
    const camp = this.trait;
    const piece = cs[de];
    const k = this.nu++;
    this.uCoup[k] = m;
    this.uRoque[k] = this.roque;
    this.uEp[k] = this.ep;
    this.uDemi[k] = this.demi;

    let hi = this.hi;
    let lo = this.lo;
    const ancien = this.cleEp();
    if (ancien >= 0) {
      hi ^= Z_EP_HI[ancien];
      lo ^= Z_EP_LO[ancien];
    }

    let prise = cs[a];
    if (fl & F_EP) {
      const victime = camp === BLANC ? a - 8 : a + 8;
      prise = cs[victime];
      cs[victime] = 0;
      hi ^= Z_PIECE_HI[prise * 64 + victime];
      lo ^= Z_PIECE_LO[prise * 64 + victime];
    } else if (prise !== 0) {
      hi ^= Z_PIECE_HI[prise * 64 + a];
      lo ^= Z_PIECE_LO[prise * 64 + a];
    }
    this.uPrise[k] = prise;

    hi ^= Z_PIECE_HI[piece * 64 + de];
    lo ^= Z_PIECE_LO[piece * 64 + de];
    cs[de] = 0;
    const arrivee = pr ? pr | (camp << 3) : piece;
    cs[a] = arrivee;
    hi ^= Z_PIECE_HI[arrivee * 64 + a];
    lo ^= Z_PIECE_LO[arrivee * 64 + a];

    if (fl & F_ROQUE) {
      const [tourDe, tourA] = a > de ? [de + 3, de + 1] : [de - 4, de - 1];
      const tour = cs[tourDe];
      cs[tourDe] = 0;
      cs[tourA] = tour;
      hi ^= Z_PIECE_HI[tour * 64 + tourDe] ^ Z_PIECE_HI[tour * 64 + tourA];
      lo ^= Z_PIECE_LO[tour * 64 + tourDe] ^ Z_PIECE_LO[tour * 64 + tourA];
    }
    if ((piece & 7) === K) this.rois[camp] = a;

    const roqueAvant = this.roque;
    this.roque = roqueAvant & DROITS[de] & DROITS[a];
    if (this.roque !== roqueAvant) {
      hi ^= Z_ROQUE_HI[roqueAvant] ^ Z_ROQUE_HI[this.roque];
      lo ^= Z_ROQUE_LO[roqueAvant] ^ Z_ROQUE_LO[this.roque];
    }

    this.ep = fl & F_DOUBLE ? (de + a) >> 1 : -1;
    this.demi = (piece & 7) === P || prise !== 0 ? 0 : this.demi + 1;
    this.trait = camp ^ 1;
    hi ^= Z_TRAIT_HI;
    lo ^= Z_TRAIT_LO;
    const nouveau = this.cleEp();
    if (nouveau >= 0) {
      hi ^= Z_EP_HI[nouveau];
      lo ^= Z_EP_LO[nouveau];
    }
    this.hi = hi;
    this.lo = lo;
    this.n += 1;
    this.hHi[this.n] = hi;
    this.hLo[this.n] = lo;
  }

  defaire(): void {
    const k = --this.nu;
    const m = this.uCoup[k];
    const de = m & 63;
    const a = (m >> 6) & 63;
    const pr = (m >> 12) & 7;
    const fl = (m >> 15) & 15;
    const cs = this.cases;
    const camp = this.trait ^ 1;
    this.trait = camp;

    const arrivee = cs[a];
    cs[de] = pr ? P | (camp << 3) : arrivee;
    const prise = this.uPrise[k];
    if (fl & F_EP) {
      cs[a] = 0;
      cs[camp === BLANC ? a - 8 : a + 8] = prise;
    } else {
      cs[a] = prise;
    }
    if (fl & F_ROQUE) {
      const [tourDe, tourA] = a > de ? [de + 3, de + 1] : [de - 4, de - 1];
      cs[tourDe] = cs[tourA];
      cs[tourA] = 0;
    }
    if ((cs[de] & 7) === K) this.rois[camp] = de;

    this.roque = this.uRoque[k];
    this.ep = this.uEp[k];
    this.demi = this.uDemi[k];
    this.n -= 1;
    this.hi = this.hHi[this.n];
    this.lo = this.hLo[this.n];
  }

  /** Passe son tour (élagage par coup nul). */
  faireNul(): void {
    const k = this.nu++;
    this.uEp[k] = this.ep;
    this.uDemi[k] = this.demi;
    this.uCoup[k] = 0;
    let hi = this.hi ^ Z_TRAIT_HI;
    let lo = this.lo ^ Z_TRAIT_LO;
    const ancien = this.cleEp();
    if (ancien >= 0) {
      hi ^= Z_EP_HI[ancien];
      lo ^= Z_EP_LO[ancien];
    }
    this.ep = -1;
    this.trait ^= 1;
    this.demi += 1;
    this.hi = hi;
    this.lo = lo;
    this.n += 1;
    this.hHi[this.n] = hi;
    this.hLo[this.n] = lo;
  }

  defaireNul(): void {
    const k = --this.nu;
    this.trait ^= 1;
    this.ep = this.uEp[k];
    this.demi = this.uDemi[k];
    this.n -= 1;
    this.hi = this.hHi[this.n];
    this.lo = this.hLo[this.n];
  }

  /**
   * Cette position s'est-elle déjà produite, avec le même camp au trait ?
   * On ne remonte que jusqu'à la dernière prise ou poussée de pion : au-delà,
   * une répétition est impossible.
   */
  repetee(): boolean {
    const limite = Math.max(0, this.n - this.demi);
    for (let i = this.n - 2; i >= limite; i -= 2) {
      if (this.hHi[i] === this.hi && this.hLo[i] === this.lo) return true;
    }
    return false;
  }

  /** Convertit un coup entier en `Move` de `engine.ts`. */
  versMove(m: number): Move {
    const de = m & 63;
    const a = (m >> 6) & 63;
    const pr = (m >> 12) & 7;
    const fl = (m >> 15) & 15;
    const cs = this.cases;
    const sortie: Move = { from: de, to: a };
    if (fl & F_PRISE) {
      sortie.captured = fl & F_EP
        ? (this.trait === BLANC ? 'p' : 'P')
        : lettreDe(cs[a]);
    } else {
      sortie.captured = null;
    }
    if (pr) sortie.promotion = LETTRES[pr - 1] as Move['promotion'];
    if (fl & F_ROQUE) sortie.castle = a > de ? 'K' : 'Q';
    if (fl & F_EP) sortie.enPassant = true;
    if (fl & F_DOUBLE) sortie.doublePush = true;
    return sortie;
  }
}

/** Les coups légaux du plateau courant, sous forme d'entiers. */
export function coupsLegaux(p: Plateau, ply = 0): number[] {
  const n = p.generer(ply, false);
  const base = ply * MAX_COUPS;
  const camp = p.trait;
  const sortie: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const m = p.pile[base + i];
    p.faire(m);
    if (!p.enEchec(camp)) sortie.push(m);
    p.defaire();
  }
  return sortie;
}

/** Nombre de feuilles à `profondeur` demi-coups : la mesure de justesse. */
export function perft(p: Plateau, profondeur: number, ply = 0): number {
  if (profondeur === 0) return 1;
  const n = p.generer(ply, false);
  const base = ply * MAX_COUPS;
  const camp = p.trait;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const m = p.pile[base + i];
    p.faire(m);
    if (!p.enEchec(camp)) total += profondeur === 1 ? 1 : perft(p, profondeur - 1, ply + 1);
    p.defaire();
  }
  return total;
}
