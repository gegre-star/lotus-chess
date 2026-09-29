/**
 * Comparaison entre le coup d'un élève et celui d'un maître.
 *
 * Le but n'est pas de dire « juste » ou « faux ». Trouver le coup de Morphy
 * est une réussite, mais jouer autre chose n'est pas forcément une erreur :
 * il arrive qu'un coup différent soit aussi bon, voire meilleur — les maîtres
 * du XIXe siècle n'avaient pas de moteur. Le retour distingue donc trois
 * choses : le coup est-il celui de la partie, est-il bon dans l'absolu, et
 * comment se situe-t-il face à celui du maître.
 */
import { makeMove, toFEN, type Move, type Position } from '../chess/engine';
import { noterCoup, type Feedback } from '../chess/coaching';
import { whitePov, type AnalysisEngine } from './types';
import { toUci } from './local';

export interface Comparaison {
  /** Le coup joué est exactement celui de la partie. */
  identique: boolean;
  /** Retour sur le coup de l'élève, comme en analyse de partie. */
  feedback: Feedback;
  /** Coup de l'élève, en UCI. */
  joue: string;
  /** Coup réellement joué dans la partie, en UCI. */
  maitre: string;
  /** Évaluation après le coup de l'élève, du point de vue de l'élève. */
  evalJoue: number;
  /** Évaluation après le coup du maître, même point de vue. */
  evalMaitre: number;
}

/** Score ramené du point de vue du camp qui vient de jouer. */
const duJoueur = (score: number, camp: 'w' | 'b'): number => (camp === 'w' ? score : -score);

export async function comparerAuMaitre(
  engine: AnalysisEngine,
  pos: Position,
  essai: Move,
  maitre: Move,
  depth = 10,
): Promise<Comparaison> {
  const camp = pos.turn;
  // pleine force : un moteur bridé rendrait un score qui ne décrit pas sa
  // propre analyse (voir stockfish.web.ts)
  const avant = await engine.analyse(toFEN(pos), { depth });
  const apresEssai = await engine.analyse(toFEN(makeMove(pos, essai)), { depth });
  const apresMaitre = await engine.analyse(toFEN(makeMove(pos, maitre)), { depth });

  const adverse = camp === 'w' ? 'b' : 'w';
  const meilleur = duJoueur(whitePov(avant, camp), camp);
  const evalJoue = duJoueur(whitePov(apresEssai, adverse), camp);
  const evalMaitre = duJoueur(whitePov(apresMaitre, adverse), camp);

  return {
    identique: toUci(essai) === toUci(maitre),
    feedback: noterCoup({ pos, move: essai, meilleur, joue: evalJoue }),
    joue: toUci(essai),
    maitre: toUci(maitre),
    evalJoue,
    evalMaitre,
  };
}

/**
 * Écart, en centipions, à partir duquel on ose dire que le coup de l'élève
 * bat celui du maître.
 *
 * Un moteur à profondeur 10 se trompe de plusieurs dizaines de centipions
 * entre deux coups voisins : +30 est du bruit, et annoncer à un élève qu'il a
 * « battu Morphy » sur cette base serait faux une fois sur deux. À 100, l'écart
 * dépasse l'incertitude de la mesure.
 */
export const ECART_MEILLEUR_QUE_LE_MAITRE = 100;

/** Phrase de conclusion, selon que l'élève a trouvé, égalé ou manqué. */
export function commenter(c: Comparaison, nomMaitre: string): string {
  if (c.identique) return `C’est exactement le coup de ${nomMaitre}.`;
  const ecart = c.evalJoue - c.evalMaitre;
  // « selon le moteur » : le verdict est une évaluation, pas une vérité
  if (ecart >= ECART_MEILLEUR_QUE_LE_MAITRE) {
    return `Ton coup est différent — et, selon le moteur, meilleur que celui de ${nomMaitre} !`;
  }
  if (ecart > -30) return `Ton coup n’est pas celui de la partie, mais il vaut autant.`;
  return `${nomMaitre} a trouvé mieux. Regarde la flèche verte.`;
}
