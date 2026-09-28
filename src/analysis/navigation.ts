/**
 * Navigation dans une revue de partie : la logique de l'écran, sans l'écran.
 *
 * L'état tient en deux nombres. `index` est la position affichée : 0 pour le
 * départ, N pour la position finale ; le coup commenté est celui qui se joue
 * *depuis* cette position (`coups[index]`), ce qui permet de tracer sur le
 * même échiquier le coup joué et le meilleur coup, tous deux valables dans la
 * position d'avant. `suite` vaut `null` tant qu'on parcourt la partie, et le
 * nombre de coups déjà déroulés de la meilleure variante quand on l'explore.
 *
 * Tout est fonction pure : un test suffit à vérifier qu'« erreur suivante »
 * saute bien les bons coups, sans monter aucun composant.
 */
import { makeMove, toSAN, type Color, type Move, type Position } from '../chess/engine';
import type { Verdict } from '../chess/coaching';
import { coupDepuisUci } from './uci';

export interface EtatRevue {
  /** Position affichée, de 0 (départ) à N (finale). */
  index: number;
  /** `null` : on parcourt la partie ; sinon, nombre de coups de la variante déroulés. */
  suite: number | null;
}

/** Ce que la navigation sait d'un demi-coup. */
export interface CoupNavigable {
  camp: Color;
  verdict: Verdict;
}

/** Contexte constant d'une revue, nécessaire pour décider des déplacements. */
export interface ContexteNavigation {
  coups: readonly CoupNavigable[];
  /** Camp de l'élève : « erreur suivante » ne s'arrête que sur les siennes. */
  joueur: Color;
  /** Nombre de coups jouables de la variante affichée (0 s'il n'y en a pas). */
  longueurSuite: number;
}

export type ActionRevue =
  | { type: 'aller'; index: number }
  | { type: 'suivant' }
  | { type: 'precedent' }
  | { type: 'erreurSuivante' }
  | { type: 'erreurPrecedente' }
  | { type: 'ouvrirSuite' }
  | { type: 'fermerSuite' };

export const ETAT_INITIAL: EtatRevue = { index: 0, suite: null };

const borner = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

/** Un coup qu'on veut revoir : une erreur ou une gaffe (l'imprécision se lit, elle ne s'étudie pas). */
export const estFaute = (verdict: Verdict): boolean => verdict === 'erreur' || verdict === 'gaffe';

/**
 * Indice de la prochaine (`sens` = 1) ou précédente (`sens` = −1) faute du
 * joueur, strictement après (ou avant) `depuis`, ou `null` s'il n'y en a plus.
 * Ne reboucle pas : arrivé à la dernière erreur, le bouton doit s'éteindre,
 * pas ramener au début sans prévenir.
 */
export function fauteVoisine(
  coups: readonly CoupNavigable[],
  depuis: number,
  joueur: Color,
  sens: 1 | -1 = 1,
): number | null {
  for (let i = depuis + sens; i >= 0 && i < coups.length; i += sens) {
    if (coups[i].camp === joueur && estFaute(coups[i].verdict)) return i;
  }
  return null;
}

/** Applique une action à l'état de la revue. Rend toujours un état valide. */
export function naviguer(etat: EtatRevue, action: ActionRevue, ctx: ContexteNavigation): EtatRevue {
  const dernier = ctx.coups.length; // la position finale porte l'indice N
  const versPartie = (index: number): EtatRevue => ({ index: borner(index, 0, dernier), suite: null });

  switch (action.type) {
    case 'aller':
      return versPartie(action.index);
    case 'suivant':
      // dans la variante, ◀ ▶ la parcourent ; ils ne quittent pas la partie
      if (etat.suite !== null) return { ...etat, suite: borner(etat.suite + 1, 0, ctx.longueurSuite) };
      return versPartie(etat.index + 1);
    case 'precedent':
      if (etat.suite !== null) return { ...etat, suite: borner(etat.suite - 1, 0, ctx.longueurSuite) };
      return versPartie(etat.index - 1);
    case 'erreurSuivante': {
      const i = fauteVoisine(ctx.coups, etat.index, ctx.joueur, 1);
      return i === null ? etat : versPartie(i);
    }
    case 'erreurPrecedente': {
      const i = fauteVoisine(ctx.coups, etat.index, ctx.joueur, -1);
      return i === null ? etat : versPartie(i);
    }
    case 'ouvrirSuite':
      // pas de variante à dérouler sur la position finale, ni si le moteur n'en a pas donné
      if (etat.index >= dernier || ctx.longueurSuite === 0) return etat;
      return { ...etat, suite: 0 };
    case 'fermerSuite':
      return { ...etat, suite: null };
  }
}

/** Une variante jouée sur l'échiquier : positions, coups et notation. */
export interface VarianteJouee {
  /** `positions[k]` : la position après `k` coups ; `positions[0]` est le départ. */
  positions: Position[];
  coups: Move[];
  /** Notation algébrique de chaque coup. */
  sans: string[];
}

/**
 * Joue une variante UCI depuis une position.
 *
 * S'arrête au premier coup illégal plutôt que de lever : la fin d'une
 * variante de moteur peut être tronquée ou périmée, et les coups déjà valides
 * restent utiles à montrer.
 */
export function jouerVariante(depart: Position, pv: readonly string[]): VarianteJouee {
  const positions = [depart];
  const coups: Move[] = [];
  const sans: string[] = [];
  let pos = depart;
  for (const uci of pv) {
    const move = coupDepuisUci(pos, uci);
    if (!move) break;
    sans.push(toSAN(pos, move));
    pos = makeMove(pos, move);
    positions.push(pos);
    coups.push(move);
  }
  return { positions, coups, sans };
}

/**
 * Numérotation d'un demi-coup dans une ligne : « 12. » devant un coup blanc,
 * « 12… » devant un coup noir joué en premier. `pos` est la position avant le coup.
 */
export const numeroter = (pos: Position): string =>
  `${pos.fullmove}${pos.turn === 'w' ? '.' : '…'}`;
