/**
 * Quand un problème est-il résolu ?
 *
 * La question vivait dans l'écran, donc ne se vérifiait qu'en jouant. Or c'est
 * la règle la plus délicate de l'application : trop stricte, elle refuse une
 * solution correcte ; trop laxiste, elle félicite l'élève pour un gain qu'il
 * n'a pas, ou lui vole la fin de sa combinaison.
 */
import { material, stableMaterial } from './ai';
import { gameStatus, type Position } from './engine';
import type { Puzzle } from './content';

/**
 * Marge acceptée sur l'objectif, en centièmes de pion.
 *
 * Elle laisse passer une solution différente mais aussi bonne, sans laisser
 * passer une combinaison abandonnée en route.
 */
export const MARGE = 30;

/**
 * L'objectif du problème est-il atteint dans cette position ?
 *
 * Deux conditions, et il faut les deux.
 *
 * 1. **Le matériel est réellement pris.** On compte les pièces présentes sur
 *    l'échiquier, pas l'évaluation du moteur : celle-ci mêle des bonus de
 *    position — un cavalier revenu au centre valait jusqu'à un pion de plus —
 *    et suffisait à déclarer un problème résolu sans rien avoir gagné.
 * 2. **L'adversaire ne peut pas le reprendre.** Sinon « +9 » s'affiche une
 *    demi-seconde avant qu'on ne rende la dame.
 *
 * Ce qu'on ne fait surtout pas, c'est chercher le gain *à venir*. Mesurer le
 * matériel après épuisement des prises — la quiescence — paraît plus juste et
 * ne l'est pas : sur une fourchette, elle voit la tour tomber au coup suivant
 * et annonce « Résolu ! » avant que l'élève ne l'ait prise. Elle ne sert donc
 * qu'à répondre à la question 2, du point de vue de l'adversaire.
 */
export function objectifAtteint(puzzle: Puzzle, start: Position, position: Position): boolean {
  if (gameStatus(position) === 'mate') return true;
  if (puzzle.mate) return false;
  const pris = material(position) - material(start);
  const reprenable = stableMaterial(position) < material(position) - MARGE;
  return pris >= puzzle.gain * 100 - MARGE && !reprenable;
}
