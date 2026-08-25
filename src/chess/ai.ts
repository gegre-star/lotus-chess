/**
 * Évaluation et recherche.
 *
 * Minimax avec élagage alpha-bêta. Volontairement modeste : le but est
 * d'être un partenaire d'entraînement crédible sur téléphone, pas un moteur
 * de compétition. Les profondeurs vont de 1 (débutant) à 3 (fort).
 */
import {
  type Color,
  type Move,
  type PieceType,
  type Position,
  colorOf,
  gameStatus,
  isWhite,
  legalMoves,
  makeMove,
} from './engine';

export const PIECE_VALUE: Record<PieceType, number> = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 0,
};

/** Au-delà de ce score, la position est un mat forcé. */
export const MATE_SCORE = 90000;

// Bonus de position : on encourage les pions à avancer au centre
// et les cavaliers à quitter le bord.
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, -20, -20, 10, 10, 5,
  5, -5, -10, 0, 0, -10, -5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, 5, 10, 25, 25, 10, 5, 5,
  10, 10, 20, 30, 30, 20, 10, 10,
  50, 50, 50, 50, 50, 50, 50, 50,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

/** Score de la position, en centièmes de pion, du point de vue des blancs. */
export function evaluate(pos: Position): number {
  let score = 0;
  for (let s = 0; s < 64; s += 1) {
    const piece = pos.board[s];
    if (!piece) continue;
    const type = piece.toUpperCase() as PieceType;
    const white = isWhite(piece);
    let value = PIECE_VALUE[type];
    // la table est écrite du point de vue des blancs : on la retourne pour les noirs
    const index = white ? s : 63 - s;
    if (type === 'P') value += PAWN_TABLE[index];
    else if (type === 'N') value += KNIGHT_TABLE[index];
    score += white ? value : -value;
  }
  return score;
}

/** Examiner d'abord les grosses captures fait tomber bien plus de branches. */
function orderMoves(moves: Move[]): Move[] {
  const gain = (m: Move) =>
    m.captured ? PIECE_VALUE[m.captured.toUpperCase() as PieceType] : 0;
  return moves.slice().sort((a, b) => gain(b) - gain(a));
}

export function search(pos: Position, depth: number, alpha: number, beta: number): number {
  const status = gameStatus(pos);
  // le score de mat décroît avec la distance : un mat rapide vaut mieux qu'un mat lent
  if (status === 'mate') return pos.turn === 'w' ? -MATE_SCORE - depth : MATE_SCORE + depth;
  // pat et nulles de règle valent zéro : sans cela une position morte serait
  // évaluée au matériel, et le moteur croirait gagner une partie déjà nulle
  if (status === 'stalemate' || status.startsWith('draw')) return 0;
  if (depth === 0) return evaluate(pos);

  const moves = orderMoves(legalMoves(pos));
  if (pos.turn === 'w') {
    let best = -Infinity;
    let a = alpha;
    for (const m of moves) {
      best = Math.max(best, search(makeMove(pos, m), depth - 1, a, beta));
      a = Math.max(a, best);
      if (beta <= a) break;
    }
    return best;
  }
  let best = Infinity;
  let b = beta;
  for (const m of moves) {
    best = Math.min(best, search(makeMove(pos, m), depth - 1, alpha, b));
    b = Math.min(b, best);
    if (b <= alpha) break;
  }
  return best;
}

/** Valeur d'un coup, toujours du point de vue de celui qui le joue. */
export function moveValue(pos: Position, move: Move, depth: number): number {
  const raw = search(makeMove(pos, move), depth - 1, -Infinity, Infinity);
  return pos.turn === 'w' ? raw : -raw;
}

/** Valeur du meilleur coup disponible, du point de vue du camp au trait. */
export function bestValue(pos: Position, depth: number): number {
  let best = -Infinity;
  for (const m of legalMoves(pos)) best = Math.max(best, moveValue(pos, m, depth));
  return best;
}

/**
 * Tolérance admise pour accepter un coup d'élève.
 *
 * Les scores de mat encodent la rapidité : un mat plus lent vaut un peu moins.
 * Sur un mat on exige donc le plus rapide (aucune tolérance) ; sur un gain de
 * matériel on accepte un écart d'un tiers de pion, pour ne pas refuser une
 * solution différente mais tout aussi bonne.
 */
export const tolerance = (best: number): number => (best >= MATE_SCORE ? 0 : 30);

/** Le coup de l'élève est-il aussi bon que le meilleur disponible ? */
export function isGoodMove(pos: Position, move: Move, depth = 3): boolean {
  const best = bestValue(pos, depth);
  return moveValue(pos, move, depth) >= best - tolerance(best);
}

export interface BotStrength {
  depth: number;
  /** Probabilité de jouer un coup au hasard. */
  gaffe: number;
}

/**
 * Coup choisi par l'ordinateur.
 *
 * `random` est injectable pour rendre les tests déterministes.
 */
export function chooseMove(
  pos: Position,
  strength: BotStrength,
  random: () => number = Math.random,
): Move | null {
  const moves = legalMoves(pos);
  if (moves.length === 0) return null;
  if (strength.gaffe > 0 && random() < strength.gaffe) {
    return moves[Math.floor(random() * moves.length)];
  }
  const scored = orderMoves(moves).map((m) => ({ m, v: moveValue(pos, m, strength.depth) }));
  scored.sort((a, b) => b.v - a.v);
  // on pioche parmi les coups équivalents pour varier les parties
  const top = scored[0].v;
  const ties = scored.filter((s) => Math.abs(s.v - top) <= 15);
  return ties[Math.floor(random() * ties.length)].m;
}

/**
 * Case d'une pièce du camp au trait qui peut être capturée avec profit.
 * Sert à faire dire au coach « attention, ta pièce est en prise ».
 */
export function hangingSquare(pos: Position): number {
  for (const m of legalMoves(pos)) {
    if (!m.captured) continue;
    const victim = PIECE_VALUE[m.captured.toUpperCase() as PieceType];
    if (victim === 0) continue;
    const attacker = PIECE_VALUE[(pos.board[m.from] as string).toUpperCase() as PieceType];
    const after = makeMove(pos, m);
    const defended = legalMoves(after).some((x) => x.to === m.to);
    if (!defended || victim > attacker) return m.to;
  }
  return -1;
}

export type MoveQuality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

const QUALITY_STEPS: [number, MoveQuality][] = [
  [10, 'best'],
  [60, 'good'],
  [140, 'inaccuracy'],
  [320, 'mistake'],
  [Infinity, 'blunder'],
];

export interface ReviewedMove {
  san: string;
  quality: MoveQuality;
  /** Matériel perdu par rapport au meilleur coup, en pions. */
  loss: number;
}

/** Note chaque coup d'un camp en le comparant au meilleur coup disponible. */
export function reviewGame(
  start: Position,
  moves: Move[],
  sans: string[],
  side: Color,
  depth = 3,
): ReviewedMove[] {
  const out: ReviewedMove[] = [];
  let pos = start;
  moves.forEach((move, i) => {
    if (colorOf(pos.board[move.from]) === side) {
      const loss = Math.max(0, bestValue(pos, depth) - moveValue(pos, move, depth));
      const quality = QUALITY_STEPS.find(([limit]) => loss <= limit)![1];
      out.push({ san: sans[i], quality, loss: Math.round(loss) / 100 });
    }
    pos = makeMove(pos, move);
  });
  return out;
}

/** Nouveau classement Elo après une partie. `score` vaut 1, 0.5 ou 0. */
export function updateElo(mine: number, theirs: number, score: number): number {
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.max(100, Math.round(mine + 32 * (score - expected)));
}
