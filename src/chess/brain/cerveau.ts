/**
 * Le cerveau des adversaires.
 *
 * Deux choses distinguent un adversaire qui a l'air de réfléchir d'un
 * adversaire qui joue au hasard.
 *
 * **Il se trompe comme un humain.** Un débutant ne tire pas ses coups au sort :
 * il joue des coups plausibles, développe ses pièces, prend ce qui traîne — et
 * de temps en temps ne voit pas la reprise. L'ancien réglage, une probabilité
 * de jouer un coup uniformément aléatoire, produisait l'inverse : un
 * adversaire sensé neuf fois sur dix et absurde la dixième, avec un cavalier
 * qui repartait d'où il venait. Ici la faiblesse se règle par trois leviers,
 * qui ne produisent que des coups défendables :
 *   - la **profondeur** et la **quiescence** : ce qu'il voit ;
 *   - la **température** : parmi les coups raisonnables, à quel point il
 *     s'écarte du meilleur (choix pondéré, pas uniforme) ;
 *   - la **distraction** : la probabilité de jouer « sans regarder », en ne
 *     voyant qu'un coup et sans les reprises — la vraie bévue de débutant.
 *
 * **Il ne tourne pas en rond.** Revenir sur le coup qu'on vient de jouer est
 * pénalisé, comme l'est la répétition d'une position.
 */
import type { Move, Position } from '../engine';
import { legalMoves, squareName } from '../engine';
import { Chercheur, MAT, MAT_LIMITE, type Limites } from './recherche';
import { F_PRISE, Plateau, coupsLegaux, deCase, drapDe, promoDe, versCase } from './plateau';

export interface Niveau {
  /** Profondeur maximale de recherche, en demi-coups. */
  profondeur: number;
  /** Temps de réflexion maximal, en millisecondes. */
  tempsMs: number;
  /** Profondeur de la quiescence ; 0 = ne voit pas les reprises. */
  qmax: number;
  /**
   * Écart toléré au meilleur coup, en centièmes de pion. 0 : toujours le
   * meilleur. Plus haut : choisit parmi des coups de plus en plus inégaux.
   */
  temperature: number;
  /** Probabilité de jouer un coup sans regarder au-delà d'un demi-coup. */
  distraction: number;
  /** Aversion pour la nulle, en centièmes de pion. */
  mepris?: number;
}

export interface Contexte {
  /** Positions déjà jouées, dans l'ordre, celle du trait exclue. */
  historique?: Position[];
  /** Coups déjà joués dans la partie, dans l'ordre. */
  coups?: Move[];
  /** Source d'aléa, injectable pour des tests reproductibles. */
  hasard?: () => number;
}

/** Écart toléré, en centièmes de pion, pour accepter un coup aussi bon que le meilleur. */
export const MARGE_JUGEMENT = 30;

export interface Jugement {
  /** Le coup est-il au moins aussi bon que le meilleur, à la marge près ? */
  bon: boolean;
  /** Meilleur coup de la position, en UCI. */
  meilleur: string | null;
  /** Scores du point de vue de celui qui joue, en centièmes de pion. */
  scoreMeilleur: number;
  scoreJoue: number;
  perte: number;
}

export interface Analyse {
  /** Meilleur coup en notation UCI, ou `null` si la partie est finie. */
  meilleur: string | null;
  /** Évaluation en centièmes de pion pour le camp au trait ; `null` si mat annoncé. */
  cp: number | null;
  /** Coups avant le mat, positif si le camp au trait mate ; `null` sinon. */
  mat: number | null;
  profondeur: number;
  pv: string[];
}

/** Retour sur le coup qu'on vient de jouer : le va-et-vient qu'on veut éviter. */
const PENALITE_RETOUR = 45;
/** Rejouer la même pièce deux fois de suite pendant l'ouverture. */
const PENALITE_MEME_PIECE = 14;
const COUPS_OUVERTURE = 12;

export class Cerveau {
  private readonly chercheur = new Chercheur(17);
  private readonly plateau = new Plateau();

  /** À appeler quand une nouvelle partie commence. */
  nouvellePartie(): void {
    this.chercheur.oublier();
  }

  private charger(pos: Position, ctx: Contexte): void {
    this.plateau.charger(pos);
    if (ctx.historique && ctx.historique.length > 0) this.plateau.precedees(ctx.historique);
  }

  private uci(m: number): string {
    const promo = promoDe(m);
    return `${squareName(deCase(m))}${squareName(versCase(m))}${promo ? 'nbrq'[promo - 2] : ''}`;
  }

  /** Le coup entier correspondant, retrouvé parmi les coups légaux de `engine.ts`. */
  private versMove(pos: Position, m: number): Move | null {
    const promo = promoDe(m);
    return (
      legalMoves(pos).find(
        (x) =>
          x.from === deCase(m) &&
          x.to === versCase(m) &&
          (promo === 0 ? !x.promotion : x.promotion === 'NBRQ'[promo - 2]),
      ) ?? null
    );
  }

  /**
   * Pénalité de « tourner en rond » : coups qui défont le précédent, ou qui
   * rejouent la même pièce pendant l'ouverture.
   */
  private penalite(m: number, ctx: Contexte, pos: Position): number {
    const coups = ctx.coups;
    if (!coups || coups.length < 2) return 0;
    const dernier = coups[coups.length - 2]; // le dernier coup de ce camp
    if (!dernier) return 0;
    const roque = drapDe(m) & 4;
    const prise = drapDe(m) & F_PRISE;
    if (roque || prise) return 0;
    if (deCase(m) === dernier.to && versCase(m) === dernier.from) return PENALITE_RETOUR;
    if (deCase(m) === dernier.to && pos.fullmove <= COUPS_OUVERTURE) return PENALITE_MEME_PIECE;
    return 0;
  }

  /** Le coup que jouerait cet adversaire dans cette position. */
  penser(pos: Position, niveau: Niveau, ctx: Contexte = {}): Move | null {
    const hasard = ctx.hasard ?? Math.random;
    this.charger(pos, ctx);
    const racine = legalMoves(pos);
    if (racine.length === 0) return null;
    if (racine.length === 1) return racine[0];

    // la distraction : un demi-coup de recul, et aucune reprise en vue
    const distrait = niveau.distraction > 0 && hasard() < niveau.distraction;
    const lim: Limites = distrait
      ? { profondeur: 1, qmax: 0, mepris: niveau.mepris }
      : {
          profondeur: niveau.profondeur,
          // le temps se partage entre l'approfondissement et l'examen des coups
          tempsMs: niveau.tempsMs > 0 ? Math.round(niveau.tempsMs * 0.55) : 0,
          qmax: niveau.qmax,
          mepris: niveau.mepris,
        };

    const fenetre = Math.max(40, niveau.temperature * 3);
    const notes = this.chercheur.scorer(this.plateau, lim, fenetre);
    if (notes.length === 0) return racine[0];

    const ajustees = notes.map((n) => ({
      coup: n.coup,
      score: n.score - this.penalite(n.coup, ctx, pos),
    }));
    const meilleur = ajustees.reduce((a, b) => (b.score > a.score ? b : a));

    // un mat en vue se joue, sans hésitation ni « humanité »
    if (meilleur.score >= MAT_LIMITE || niveau.temperature <= 0) {
      return this.versMove(pos, meilleur.coup);
    }

    // choix pondéré : un coup 1 température moins bon a 37 % de chances de moins
    const poids = ajustees.map((n) => Math.exp((n.score - meilleur.score) / niveau.temperature));
    const total = poids.reduce((a, b) => a + b, 0);
    let tirage = hasard() * total;
    for (let i = 0; i < ajustees.length; i += 1) {
      tirage -= poids[i];
      if (tirage <= 0) return this.versMove(pos, ajustees[i].coup);
    }
    return this.versMove(pos, meilleur.coup);
  }

  /**
   * Ce coup est-il aussi bon que le meilleur de la position ?
   *
   * Sert à juger un coup d'élève (problèmes, exercices). Le calcul est borné
   * en **nœuds** et non en temps : le verdict doit être le même sur un iPhone
   * lent et sur un ordinateur rapide, sinon un problème serait réussi ou raté
   * selon la machine.
   */
  jugerCoup(
    pos: Position,
    coup: Move,
    opts: { profondeur?: number; noeuds?: number } = {},
  ): Jugement {
    this.chercheur.oublier();
    this.plateau.charger(pos);
    const lim: Limites = {
      profondeur: opts.profondeur ?? 7,
      noeuds: opts.noeuds ?? 350_000,
      qmax: 8,
    };
    const meilleur = this.chercheur.chercher(this.plateau, lim);
    if (!meilleur) return { bon: true, meilleur: null, scoreMeilleur: 0, scoreJoue: 0, perte: 0 };
    const entier = coupsLegaux(this.plateau).find(
      (m) =>
        deCase(m) === coup.from &&
        versCase(m) === coup.to &&
        (promoDe(m) === 0 ? !coup.promotion : 'NBRQ'[promoDe(m) - 2] === coup.promotion),
    );
    if (entier === undefined) return { bon: false, meilleur: this.uci(meilleur.coup), scoreMeilleur: meilleur.score, scoreJoue: -MAT, perte: 2 * MAT };
    const joue = entier === meilleur.coup ? meilleur.score : this.chercheur.scorerCoup(this.plateau, entier, lim);
    // sur un mat on exige le plus rapide : un mat plus lent est un autre coup
    const tolerance = meilleur.score >= MAT_LIMITE ? 0 : MARGE_JUGEMENT;
    return {
      bon: joue >= meilleur.score - tolerance,
      meilleur: this.uci(meilleur.coup),
      scoreMeilleur: meilleur.score,
      scoreJoue: joue,
      perte: Math.max(0, meilleur.score - joue),
    };
  }

  /** Analyse à pleine force : meilleur coup, évaluation et variante. */
  analyser(pos: Position, opts: { profondeur?: number; tempsMs?: number; noeuds?: number } = {}, ctx: Contexte = {}): Analyse {
    this.charger(pos, ctx);
    const res = this.chercheur.chercher(this.plateau, {
      profondeur: opts.profondeur ?? 8,
      tempsMs: opts.tempsMs,
      noeuds: opts.noeuds,
      qmax: 8,
    });
    if (!res) return { meilleur: null, cp: null, mat: 0, profondeur: 0, pv: [] };
    const s = res.score;
    let cp: number | null = s;
    let mat: number | null = null;
    if (Math.abs(s) >= MAT_LIMITE) {
      const plies = MAT - Math.abs(s);
      mat = Math.sign(s) * Math.ceil(plies / 2);
      cp = null;
    }
    return {
      meilleur: this.uci(res.coup),
      cp,
      mat,
      profondeur: res.profondeur,
      pv: res.pv.map((m) => this.uci(m)),
    };
  }
}
