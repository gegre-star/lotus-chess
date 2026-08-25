/**
 * Moteur de repli, utilisé sur iOS et Android.
 *
 * Hermes n'exécute ni WebAssembly ni Web Worker : Stockfish y est hors de
 * portée. Le minimax de `src/chess/ai.ts` prend le relais et rend le même
 * objet `Analysis`, pour que les écrans n'aient pas à distinguer les cas.
 */
import { bestValue, moveValue, MATE_SCORE } from '../chess/ai';
import { legalMoves, makeMove, parseFEN, squareName, type Move, type Position } from '../chess/engine';
import type { Analysis, AnalyseOptions, AnalysisEngine } from './types';

/** Écrit un coup au format UCI, comme le ferait Stockfish. */
export const toUci = (move: Move): string =>
  squareName(move.from) + squareName(move.to) + (move.promotion?.toLowerCase() ?? '');

/**
 * Traduit un score de minimax en champs `cp` / `mate`.
 *
 * `ai.ts` marque un mat par `MATE_SCORE + k`, où `k` est la profondeur qui
 * restait à explorer quand le mat a été trouvé. Le nombre de demi-coups qui
 * y mènent vaut donc `depth - k`, et le nombre de coups annoncé la moitié,
 * arrondie au supérieur.
 */
export function scoreToAnalysis(value: number, depth: number): Pick<Analysis, 'cp' | 'mate'> {
  if (Math.abs(value) >= MATE_SCORE) {
    const remaining = Math.abs(value) - MATE_SCORE;
    const plies = Math.max(1, depth - remaining);
    return { cp: null, mate: Math.sign(value) * Math.ceil(plies / 2) };
  }
  return { cp: Math.round(value), mate: null };
}

/** Variante principale, reconstruite coup par coup avec le même minimax. */
function principalVariation(pos: Position, depth: number, length: number): string[] {
  const pv: string[] = [];
  let current = pos;
  for (let i = 0; i < length; i += 1) {
    const moves = legalMoves(current);
    if (moves.length === 0) break;
    let best = moves[0];
    let bestScore = -Infinity;
    moves.forEach((m) => {
      const v = moveValue(current, m, depth);
      if (v > bestScore) {
        bestScore = v;
        best = m;
      }
    });
    pv.push(toUci(best));
    current = makeMove(current, best);
  }
  return pv;
}

export function createLocalEngine(): AnalysisEngine {
  return {
    name: 'local',
    async analyse(fen: string, options: AnalyseOptions = {}): Promise<Analysis> {
      const depth = options.depth ?? 3;
      const pos = parseFEN(fen);
      const moves = legalMoves(pos);
      if (moves.length === 0) {
        return { best: null, cp: null, mate: null, depth, pv: [], engine: 'local' };
      }
      const value = bestValue(pos, depth);
      // la variante est plus courte que la profondeur : au-delà, le minimax
      // superficiel raconterait n'importe quoi
      const pv = principalVariation(pos, depth, Math.min(depth, 4));
      return {
        best: pv[0] ?? toUci(moves[0]),
        ...scoreToAnalysis(value, depth),
        depth,
        pv,
        engine: 'local',
      };
    },
    dispose() {
      // rien à libérer : tout est synchrone et en mémoire
    },
  };
}
