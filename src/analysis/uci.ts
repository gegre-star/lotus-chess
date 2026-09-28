/**
 * Lecture des lignes du protocole UCI.
 *
 * Séparé du transport (Worker, process) pour être testable sans navigateur :
 * c'est là que se nichent les erreurs de signe et d'unité, pas dans l'envoi
 * des messages.
 */
import { legalMoves, squareFromName, type Move, type Position } from '../chess/engine';
import type { Analysis, UciMove } from './types';

/** État accumulé au fil des lignes `info`, figé par `bestmove`. */
export interface UciAccumulator {
  cp: number | null;
  mate: number | null;
  depth: number;
  pv: UciMove[];
}

export const emptyAccumulator = (): UciAccumulator => ({
  cp: null,
  mate: null,
  depth: 0,
  pv: [],
});

/**
 * Intègre une ligne `info`. Les lignes sans score (`info string`, `currmove`,
 * `upperbound`/`lowerbound`) sont ignorées : elles décriraient une évaluation
 * partielle qui fausserait la note affichée à l'élève.
 */
export function readInfo(acc: UciAccumulator, line: string): UciAccumulator {
  if (!line.startsWith('info ')) return acc;
  if (line.includes(' upperbound ') || line.includes(' lowerbound ')) return acc;
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  if (!score) return acc;
  const depth = /\bdepth (\d+)/.exec(line);
  const pv = /\bpv (.+)$/.exec(line);
  const value = Number(score[2]);
  return {
    cp: score[1] === 'cp' ? value : null,
    mate: score[1] === 'mate' ? value : null,
    depth: depth ? Number(depth[1]) : acc.depth,
    pv: pv ? pv[1].trim().split(/\s+/) : acc.pv,
  };
}

/** Extrait le coup d'une ligne `bestmove`, ou `null` s'il n'y en a pas. */
export function readBestMove(line: string): UciMove | null {
  const m = /^bestmove\s+(\S+)/.exec(line);
  if (!m) return null;
  // Stockfish répond `bestmove (none)` sur une position déjà terminée
  return m[1] === '(none)' || m[1] === '0000' ? null : m[1];
}

/** Assemble le résultat final à partir de l'accumulateur et du `bestmove`. */
export const toAnalysis = (
  acc: UciAccumulator,
  best: UciMove | null,
  engine: Analysis['engine'] = 'stockfish',
): Analysis => ({
  best,
  cp: acc.cp,
  mate: acc.mate,
  depth: acc.depth,
  pv: acc.pv,
  engine,
});

/**
 * Retrouve le coup légal qui correspond à un coup UCI (`e2e4`, `e7e8q`).
 *
 * `null` si le texte n'est pas un coup UCI ou si le coup est illégal dans cette
 * position : une variante de moteur peut être périmée (position changée entre
 * temps), et le rejeter vaut mieux que jouer un coup absurde sur l'échiquier.
 * Le roque s'écrit, comme chez Stockfish, par la case d'arrivée du roi.
 */
export function coupDepuisUci(pos: Position, uci: UciMove): Move | null {
  if (!/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci)) return null;
  const from = squareFromName(uci.slice(0, 2));
  const to = squareFromName(uci.slice(2, 4));
  const promo = uci.length > 4 ? uci[4].toUpperCase() : undefined;
  return (
    legalMoves(pos).find(
      (m) => m.from === from && m.to === to && (promo ? m.promotion === promo : !m.promotion),
    ) ?? null
  );
}
