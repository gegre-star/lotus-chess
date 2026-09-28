/**
 * Sprint de problèmes : le plus de problèmes possible en trois minutes.
 *
 * Le trophée « Sprinteur » et `finishSprint` existaient sans qu'aucun écran
 * puisse les atteindre : le trophée était impossible à gagner. La logique du
 * sprint est ici, pure, pour être testée sans écran ni minuterie.
 */
import type { Puzzle } from './content';

export const DUREE_SPRINT_MS = 180_000;
/** Temps retiré à chaque coup faux : de quoi décourager de tout essayer. */
export const PENALITE_MS = 5_000;

export interface EtatSprint {
  /** Horodatage de fin. Reculé à chaque erreur. */
  fin: number;
  score: number;
  erreurs: number;
  /** Ordre des problèmes ; on boucle quand la file est épuisée. */
  file: Puzzle[];
  courant: number;
}

/**
 * Problèmes utilisables en sprint : ceux qui se résolvent en **un seul coup**.
 * Un problème à plusieurs coups suppose une réponse de l'adversaire et
 * plusieurs minutes de réflexion : il n'a rien à faire dans une course.
 */
export const problemesDeSprint = (tous: Puzzle[]): Puzzle[] => tous.filter((p) => p.line.length === 1);

/** Mélange déterministe (Fisher-Yates) : `hasard` est injectable pour les tests. */
export function melanger<T>(liste: T[], hasard: () => number = Math.random): T[] {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(hasard() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function demarrerSprint(
  tous: Puzzle[],
  maintenant: number,
  hasard: () => number = Math.random,
): EtatSprint {
  return {
    fin: maintenant + DUREE_SPRINT_MS,
    score: 0,
    erreurs: 0,
    file: melanger(problemesDeSprint(tous), hasard),
    courant: 0,
  };
}

export const problemeCourant = (s: EtatSprint): Puzzle => s.file[s.courant % s.file.length];

export const tempsRestant = (s: EtatSprint, maintenant: number): number =>
  Math.max(0, s.fin - maintenant);

export const estTermine = (s: EtatSprint, maintenant: number): boolean => tempsRestant(s, maintenant) <= 0;

/** Un coup juste : un point, problème suivant. */
export const reussir = (s: EtatSprint): EtatSprint => ({ ...s, score: s.score + 1, courant: s.courant + 1 });

/** Un coup faux : on perd du temps, et on reste sur le même problème. */
export const rater = (s: EtatSprint): EtatSprint => ({
  ...s,
  erreurs: s.erreurs + 1,
  fin: s.fin - PENALITE_MS,
});
