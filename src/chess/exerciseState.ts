/**
 * Machine d'état d'un exercice.
 *
 * Isolée du composant pour être testable telle quelle : c'est ici que vivent
 * les règles du parcours — quand un indice devient disponible, ce qu'on
 * affiche après une erreur, quand l'exercice est réussi.
 *
 * Règle centrale : **aucun indice avant une première erreur**. Un indice
 * proposé d'emblée transforme l'exercice en lecture ; proposé après un échec,
 * il devient l'explication dont l'élève a besoin à cet instant précis.
 */
import type { Exercise, Hint } from './exercises';
import type { Feedback } from './coaching';

export interface EtatExercice {
  /** Nombre de propositions fausses depuis le début. */
  erreurs: number;
  /** Indices déjà demandés : 0 aucun, 3 la solution. */
  indicesVus: 0 | 1 | 2 | 3;
  resolu: boolean;
  /** Dernier retour affiché, ou `null` avant la première tentative. */
  feedback: Feedback | null;
  /** Coup proposé en dernier, au format UCI. */
  dernier: string | null;
  /** Vrai si le dernier coup était bon mais hors sujet. */
  horsSujet: boolean;
}

export const etatInitial = (): EtatExercice => ({
  erreurs: 0,
  indicesVus: 0,
  resolu: false,
  feedback: null,
  dernier: null,
  horsSujet: false,
});

export type ActionExercice =
  | { type: 'proposer'; uci: string; feedback: Feedback | null }
  | { type: 'indice' }
  | { type: 'reveler' }
  | { type: 'recommencer' };

/** Un indice est-il disponible ? Il en faut une erreur, et il en reste. */
export const indiceDisponible = (etat: EtatExercice): boolean =>
  etat.erreurs > 0 && !etat.resolu && etat.indicesVus < 3;

/** L'indice à afficher, ou `null` si aucun n'a encore été demandé. */
export const indiceCourant = (ex: Exercise, etat: EtatExercice): Hint | null =>
  etat.indicesVus === 0 ? null : ex.indices[etat.indicesVus - 1];

/** Cases à surligner avec l'indice courant. */
export const casesIndice = (ex: Exercise, etat: EtatExercice): string[] =>
  indiceCourant(ex, etat)?.cases ?? [];

export function reduire(ex: Exercise, etat: EtatExercice, action: ActionExercice): EtatExercice {
  switch (action.type) {
    case 'proposer': {
      if (etat.resolu) return etat;
      const juste = ex.attendus.includes(action.uci);
      const horsSujet = !juste && (ex.toleres ?? []).includes(action.uci);
      return {
        ...etat,
        dernier: action.uci,
        feedback: action.feedback,
        resolu: juste,
        horsSujet,
        // un bon coup hors sujet n'est pas une faute : il ne débloque pas
        // d'indice et ne compte pas contre l'élève
        erreurs: juste || horsSujet ? etat.erreurs : etat.erreurs + 1,
      };
    }
    case 'indice':
      if (!indiceDisponible(etat)) return etat;
      return { ...etat, indicesVus: (etat.indicesVus + 1) as EtatExercice['indicesVus'] };
    case 'reveler':
      if (etat.resolu) return etat;
      return { ...etat, indicesVus: 3 };
    case 'recommencer':
      return etatInitial();
    default:
      return etat;
  }
}

/** Points gagnés : plein tarif sans indice, dégressif ensuite, jamais nul. */
export const pointsGagnes = (etat: EtatExercice): number => {
  if (!etat.resolu) return 0;
  return [20, 12, 8, 4][etat.indicesVus];
};
