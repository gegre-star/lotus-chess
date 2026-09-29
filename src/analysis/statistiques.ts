/**
 * Chiffres d'une revue de partie : précision, résumé par catégorie, courbe.
 *
 * Fonctions pures, séparées du moteur et de l'écran : c'est ici que se
 * trompent les signes et les unités, et un test unitaire les attrape sans
 * lancer d'analyse. Elles ne reçoivent que ce dont elles ont besoin — le camp,
 * le verdict, la perte de probabilité de gain — pour ne dépendre ni du moteur
 * ni du type complet d'un coup revu.
 */
import type { Color } from '../chess/engine';
import { SEUIL_MAT, SEUILS, probaGain, type Verdict } from '../chess/coaching';

/** Ce qu'il faut savoir d'un demi-coup pour le compter. */
export interface CoupCompte {
  camp: Color;
  verdict: Verdict;
  /** Probabilité de gain perdue par le camp qui a joué, en points (≥ 0). */
  perteGain: number;
}

/** Les cinq catégories, du meilleur au pire : l'ordre d'affichage du tableau. */
export const CATEGORIES: Verdict[] = ['brillant', 'bon', 'imprecision', 'erreur', 'gaffe'];

/**
 * Précision d'un coup, de 0 à 100, à partir de la probabilité de gain perdue.
 *
 * C'est la formule de lichess, ajustée sur des parties réelles : aucune perte
 * donne 100 (103,1668 − 3,1669 : la formule retombe sur 100), 5 points
 * perdus environ 80, 10 points environ 64, 20 points environ 40, et la courbe reste positive jusqu'aux pertes énormes,
 * d'où la borne inférieure à 0.
 */
export function precisionCoup(perteGain: number): number {
  const brute = 103.1668 * Math.exp(-0.04354 * Math.max(0, perteGain)) - 3.1669;
  return Math.min(100, Math.max(0, brute));
}

/**
 * Précision d'un joueur : moyenne de celle de ses coups.
 *
 * `null` quand il n'a joué aucun coup — afficher « 0 % » d'un joueur qui n'a
 * rien joué le ferait passer pour le pire de la partie.
 */
export function precisionJoueur(coups: readonly CoupCompte[], camp: Color): number | null {
  const siens = coups.filter((c) => c.camp === camp);
  if (siens.length === 0) return null;
  const somme = siens.reduce((acc, c) => acc + precisionCoup(c.perteGain), 0);
  return somme / siens.length;
}

export type ResumeCategories = Record<Verdict, number>;

const resumeVide = (): ResumeCategories => ({
  brillant: 0,
  bon: 0,
  imprecision: 0,
  erreur: 0,
  gaffe: 0,
});

/** Nombre de coups de chaque catégorie, pour chaque camp. */
export function resumerCoups(coups: readonly CoupCompte[]): Record<Color, ResumeCategories> {
  const resume = { w: resumeVide(), b: resumeVide() };
  coups.forEach((c) => {
    resume[c.camp][c.verdict] += 1;
  });
  return resume;
}

/** Écrêtage de la courbe : au-delà de ±10 pions, l'écran ne distingue plus rien. */
export const COURBE_MAX = 1000;

/** Ramène un score (centipions, point de vue des blancs, mats compris) à l'intervalle affichable. */
export const ecreter = (scoreBlancs: number): number =>
  Math.max(-COURBE_MAX, Math.min(COURBE_MAX, scoreBlancs));

/**
 * Courbe d'évaluation : une valeur par position, du point de vue des blancs,
 * écrêtée à ±`COURBE_MAX`. Un mat vaut la borne, faute de mieux.
 */
export const courbeDEval = (scoresBlancs: readonly number[]): number[] => scoresBlancs.map(ecreter);

/**
 * Le coup critique : celui qui a coûté le plus de probabilité de gain, tous
 * camps confondus — le moment où la partie a basculé. `null` quand personne
 * n'a fait au moins une erreur : dans une partie propre il n'y a pas de
 * moment critique à montrer, et en inventer un serait faux.
 *
 * Rend l'indice du demi-coup dans `coups`, le premier en cas d'égalité.
 */
export function coupCritique(coups: readonly CoupCompte[]): number | null {
  // « erreur » commence au-dessus du seuil de l'imprécision
  const plancher = SEUILS[1][0];
  let meilleur: number | null = null;
  let pire = plancher;
  coups.forEach((c, i) => {
    if (c.perteGain > pire) {
      pire = c.perteGain;
      meilleur = i;
    }
  });
  return meilleur;
}

/** Ordonnée d'un point de la courbe, de 0 (haut : les blancs gagnent) à 1 (bas). */
export const hauteurRelative = (scoreBlancs: number): number => 1 - probaGain(scoreBlancs) / 100;

/**
 * Évaluation lisible : « +0,3 », « −1,2 », « M3 » pour un mat en 3.
 * Le mat se reconnaît au seuil `SEUIL_MAT` ; l'échelle des mats (100 000 moins
 * la distance) est celle de `whitePov`.
 */
export function libelleEval(scoreBlancs: number): string {
  if (Math.abs(scoreBlancs) >= SEUIL_MAT) {
    const distance = Math.max(0, 100000 - Math.abs(scoreBlancs));
    if (distance === 0) return scoreBlancs > 0 ? '1-0' : '0-1';
    return `${scoreBlancs > 0 ? '' : '−'}M${distance}`;
  }
  const pions = Math.abs(scoreBlancs) / 100;
  const texte = pions.toFixed(1).replace('.', ',');
  if (pions < 0.05) return '0,0';
  return `${scoreBlancs > 0 ? '+' : '−'}${texte}`;
}

/** Nom d'une catégorie au pluriel, pour le tableau du résumé. */
export const NOM_CATEGORIE: Record<Verdict, string> = {
  brillant: 'Brillants',
  bon: 'Bons coups',
  imprecision: 'Imprécisions',
  erreur: 'Erreurs',
  gaffe: 'Gaffes',
};
