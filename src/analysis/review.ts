/**
 * Revue de partie, coup par coup, avec le moteur disponible.
 *
 * Reprend l'idée de `reviewGame` dans `ai.ts` mais délègue l'évaluation à un
 * `AnalysisEngine` : sur le web, c'est Stockfish qui note les coups, ce qui
 * change la qualité du verdict sans changer l'affichage.
 *
 * Chaque coup demande deux évaluations — la position avant, puis la position
 * après. Sur une partie longue cela fait beaucoup d'appels, d'où la
 * profondeur volontairement modeste par défaut.
 */
import { makeMove, toFEN, type Color, type Move, type Position } from '../chess/engine';
import { colorOf } from '../chess/engine';
import { noterCoup, type Feedback } from '../chess/coaching';
import { whitePov, type AnalysisEngine } from './types';

export interface CoupRevu extends Feedback {
  san: string;
  /** Numéro du demi-coup dans la partie, à partir de 1. */
  ply: number;
}

export interface OptionsRevue {
  depth?: number;
  /** Appelé après chaque coup noté, pour afficher l'avancement. */
  onProgress?: (fait: number, total: number) => void;
}

/**
 * Note les coups d'un seul camp.
 *
 * Le score rendu par le moteur est ramené du point de vue du joueur : sans
 * cela, un bon coup des noirs passerait pour une catastrophe.
 */
export async function revoirPartie(
  engine: AnalysisEngine,
  depart: Position,
  moves: Move[],
  sans: string[],
  camp: Color,
  options: OptionsRevue = {},
): Promise<CoupRevu[]> {
  const depth = options.depth ?? 10;
  const out: CoupRevu[] = [];
  // les coups du camp alternent : le premier est celui du camp au trait
  const total = moves.filter((_, i) => (depart.turn === camp ? i % 2 === 0 : i % 2 === 1)).length;
  let pos = depart;

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (colorOf(pos.board[move.from]) === camp) {
      const avant = await engine.analyse(toFEN(pos), { depth });
      const apres = await engine.analyse(toFEN(makeMove(pos, move)), { depth });
      // les deux scores sont ramenés au point de vue du joueur qui vient de
      // jouer : le second est celui de l'adversaire, il faut l'inverser
      const meilleur = signeJoueur(whitePov(avant, pos.turn), camp);
      const joue = signeJoueur(whitePov(apres, pos.turn === 'w' ? 'b' : 'w'), camp);
      out.push({
        ...noterCoup({ pos, move, meilleur, joue }),
        san: sans[i] ?? '',
        ply: i + 1,
      });
      options.onProgress?.(out.length, total);
    }
    pos = makeMove(pos, move);
  }
  return out;
}

/** Ramène un score « point de vue des blancs » au point de vue d'un camp. */
const signeJoueur = (scoreBlancs: number, camp: Color): number =>
  camp === 'w' ? scoreBlancs : -scoreBlancs;
