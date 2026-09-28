/**
 * Moteur d'échecs — règles complètes, sans dépendance.
 *
 * Représentation : un tableau de 64 cases, index 0 = a1, 63 = h8.
 * Les pièces sont des lettres FEN ('K' blanc, 'k' noir…), `null` pour une case vide.
 *
 * La justesse est vérifiée par `perft` dans les tests (positions de référence).
 */

export type Piece = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type Color = 'w' | 'b';
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

export interface CastlingRights {
  K: boolean;
  Q: boolean;
  k: boolean;
  q: boolean;
}

export interface Position {
  board: (Piece | null)[];
  turn: Color;
  castling: CastlingRights;
  /** Case de prise en passant, ou -1. */
  ep: number;
  /** Demi-coups depuis la dernière prise ou poussée de pion (règle des 50 coups). */
  halfmove: number;
  /** Numéro du coup, incrémenté après chaque coup des noirs. */
  fullmove: number;
}

export interface Move {
  from: number;
  to: number;
  captured?: Piece | null;
  promotion?: PieceType;
  castle?: 'K' | 'Q';
  enPassant?: boolean;
  doublePush?: boolean;
}

export type GameStatus =
  | 'ok'
  | 'check'
  | 'mate'
  | 'stalemate'
  /** Nulle par la règle des 50 coups. */
  | 'draw-fifty'
  /** Nulle par matériel insuffisant pour mater. */
  | 'draw-material'
  /** Nulle par triple répétition de la position. */
  | 'draw-repetition';

export const FILES = 'abcdefgh';
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const sq = (file: number, rank: number): number => rank * 8 + file;
export const fileOf = (s: number): number => s % 8;
export const rankOf = (s: number): number => Math.floor(s / 8);
export const squareName = (s: number): string => `${FILES[fileOf(s)]}${rankOf(s) + 1}`;
export const squareFromName = (name: string): number =>
  sq(FILES.indexOf(name[0]), parseInt(name[1], 10) - 1);

const onBoard = (file: number, rank: number): boolean =>
  file >= 0 && file < 8 && rank >= 0 && rank < 8;

export const isWhite = (p: Piece): boolean => p === p.toUpperCase();
export const colorOf = (p: Piece | null): Color | null => (p ? (isWhite(p) ? 'w' : 'b') : null);
const typeOf = (p: Piece): PieceType => p.toUpperCase() as PieceType;

/**
 * Lit un FEN, en refusant ce qui ne décrit pas une position d'échecs.
 *
 * Toutes les positions de l'application viennent du code, mais un FEN
 * défectueux ne produisait aucune erreur : une rangée trop longue écrivait
 * hors du tableau, un caractère inconnu devenait une case bloquée, un roi
 * absent faisait afficher une partie en cours. Le moteur, lui, n'a de sens
 * que sur des positions légales — mieux vaut échouer tout de suite, avec un
 * message qui dit ce qui cloche.
 *
 * Les droits de roque sans le roi ou la tour à leur place sont retirés plutôt
 * que refusés : c'est ce que font les autres logiciels, et sinon le moteur
 * proposerait un roque impossible.
 */
export function parseFEN(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [placement, turn = 'w', castling = '-', ep = '-', halfmove, fullmove] = parts;
  if (!placement) throw new Error('FEN invalide : chaîne vide');
  if (turn !== 'w' && turn !== 'b') throw new Error(`FEN invalide : trait « ${turn} »`);

  const rows = placement.split('/');
  if (rows.length !== 8) {
    throw new Error(`FEN invalide : 8 rangées attendues, ${rows.length} trouvées`);
  }
  const board: (Piece | null)[] = new Array(64).fill(null);
  const kings = { K: 0, k: 0 };
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else if ('PNBRQKpnbrqk'.includes(ch)) {
        if (file > 7) throw new Error(`FEN invalide : rangée ${rank + 1} trop longue`);
        if ((ch === 'P' || ch === 'p') && (rank === 0 || rank === 7)) {
          throw new Error(`FEN invalide : pion sur la rangée ${rank + 1}`);
        }
        if (ch === 'K' || ch === 'k') kings[ch] += 1;
        board[sq(file, rank)] = ch as Piece;
        file += 1;
      } else {
        throw new Error(`FEN invalide : caractère « ${ch} »`);
      }
    }
    if (file !== 8) throw new Error(`FEN invalide : la rangée ${rank + 1} compte ${file} cases`);
  });
  if (kings.K !== 1 || kings.k !== 1) {
    throw new Error(`FEN invalide : il faut un roi par camp (${kings.K} blanc, ${kings.k} noir)`);
  }
  if (!/^(-|[KQkq]+)$/.test(castling)) throw new Error(`FEN invalide : roques « ${castling} »`);
  if (ep !== '-' && !/^[a-h][36]$/.test(ep)) throw new Error(`FEN invalide : prise en passant « ${ep} »`);

  const a = (name: string, piece: Piece) => board[squareFromName(name)] === piece;
  return {
    board,
    turn,
    castling: {
      K: castling.includes('K') && a('e1', 'K') && a('h1', 'R'),
      Q: castling.includes('Q') && a('e1', 'K') && a('a1', 'R'),
      k: castling.includes('k') && a('e8', 'k') && a('h8', 'r'),
      q: castling.includes('q') && a('e8', 'k') && a('a8', 'r'),
    },
    ep: ep !== '-' ? squareFromName(ep) : -1,
    halfmove: Number(halfmove ?? 0) || 0,
    fullmove: Number(fullmove ?? 1) || 1,
  };
}

export function toFEN(pos: Position): string {
  let placement = '';
  for (let rank = 7; rank >= 0; rank -= 1) {
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const p = pos.board[sq(file, rank)];
      if (!p) {
        empty += 1;
      } else {
        if (empty) {
          placement += empty;
          empty = 0;
        }
        placement += p;
      }
    }
    if (empty) placement += empty;
    if (rank > 0) placement += '/';
  }
  const c = pos.castling;
  const rights = `${c.K ? 'K' : ''}${c.Q ? 'Q' : ''}${c.k ? 'k' : ''}${c.q ? 'q' : ''}` || '-';
  const ep = pos.ep >= 0 ? squareName(pos.ep) : '-';
  return `${placement} ${pos.turn} ${rights} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

const clone = (p: Position): Position => ({
  board: p.board.slice(),
  turn: p.turn,
  castling: { ...p.castling },
  ep: p.ep,
  halfmove: p.halfmove,
  fullmove: p.fullmove,
});

const KNIGHT_OFFSETS: readonly [number, number][] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_OFFSETS: readonly [number, number][] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const BISHOP_DIRS: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const QUEEN_DIRS: readonly [number, number][] = [...BISHOP_DIRS, ...ROOK_DIRS];

export const findKing = (pos: Position, color: Color): number =>
  pos.board.indexOf(color === 'w' ? 'K' : 'k');

/** La case `target` est-elle attaquée par le camp `by` ? */
export function isAttacked(pos: Position, target: number, by: Color): boolean {
  const tf = fileOf(target);
  const tr = rankOf(target);

  // pions : ils attaquent en avançant, donc on regarde la rangée d'où ils viendraient
  const pawnRank = by === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (onBoard(f, pawnRank)) {
      const p = pos.board[sq(f, pawnRank)];
      if (p && colorOf(p) === by && typeOf(p) === 'P') return true;
    }
  }
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = tf + df;
    const r = tr + dr;
    if (onBoard(f, r)) {
      const p = pos.board[sq(f, r)];
      if (p && colorOf(p) === by && typeOf(p) === 'N') return true;
    }
  }
  for (const [df, dr] of KING_OFFSETS) {
    const f = tf + df;
    const r = tr + dr;
    if (onBoard(f, r)) {
      const p = pos.board[sq(f, r)];
      if (p && colorOf(p) === by && typeOf(p) === 'K') return true;
    }
  }
  const slide = (dirs: readonly [number, number][], types: PieceType[]): boolean => {
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (onBoard(f, r)) {
        const p = pos.board[sq(f, r)];
        if (p) {
          if (colorOf(p) === by && types.includes(typeOf(p))) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }
    return false;
  };
  if (slide(BISHOP_DIRS, ['B', 'Q'])) return true;
  if (slide(ROOK_DIRS, ['R', 'Q'])) return true;
  return false;
}

/**
 * Cases d'où le camp `by` attaque `target`.
 *
 * `isAttacked` répond « oui ou non » ; ici on veut *qui*, pour pouvoir dire à
 * l'élève « ce pion est défendu par le pion d3 » plutôt que de refuser son
 * coup sans rien expliquer. Un refus qu'on ne peut pas vérifier sur
 * l'échiquier se vit comme un bug de l'application.
 */
export function attackers(pos: Position, target: number, by: Color): number[] {
  const out: number[] = [];
  const tf = fileOf(target);
  const tr = rankOf(target);

  const pawnRank = by === 'w' ? tr - 1 : tr + 1;
  for (const df of [-1, 1]) {
    const f = tf + df;
    if (!onBoard(f, pawnRank)) continue;
    const s = sq(f, pawnRank);
    const p = pos.board[s];
    if (p && colorOf(p) === by && typeOf(p) === 'P') out.push(s);
  }
  for (const [offsets, type] of [
    [KNIGHT_OFFSETS, 'N'],
    [KING_OFFSETS, 'K'],
  ] as [readonly [number, number][], PieceType][]) {
    for (const [df, dr] of offsets) {
      const f = tf + df;
      const r = tr + dr;
      if (!onBoard(f, r)) continue;
      const s = sq(f, r);
      const p = pos.board[s];
      if (p && colorOf(p) === by && typeOf(p) === type) out.push(s);
    }
  }
  const slide = (dirs: readonly [number, number][], types: PieceType[]) => {
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (onBoard(f, r)) {
        const s = sq(f, r);
        const p = pos.board[s];
        if (p) {
          if (colorOf(p) === by && types.includes(typeOf(p))) out.push(s);
          break;
        }
        f += df;
        r += dr;
      }
    }
  };
  slide(BISHOP_DIRS, ['B', 'Q']);
  slide(ROOK_DIRS, ['R', 'Q']);
  return out.sort((a, b) => a - b);
}

export function inCheck(pos: Position, color: Color): boolean {
  const king = findKing(pos, color);
  if (king < 0) return false;
  return isAttacked(pos, king, color === 'w' ? 'b' : 'w');
}

/** Coups pseudo-légaux : la règle du roi en échec n'est pas encore appliquée. */
function pseudoMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const me = pos.turn;

  for (let s = 0; s < 64; s += 1) {
    const piece = pos.board[s];
    if (!piece || colorOf(piece) !== me) continue;
    const type = typeOf(piece);
    const file = fileOf(s);
    const rank = rankOf(s);

    if (type === 'P') {
      const dir = me === 'w' ? 1 : -1;
      const startRank = me === 'w' ? 1 : 6;
      const promoRank = me === 'w' ? 7 : 0;
      const ahead = rank + dir;
      if (onBoard(file, ahead) && !pos.board[sq(file, ahead)]) {
        const to = sq(file, ahead);
        if (ahead === promoRank) {
          (['Q', 'R', 'B', 'N'] as PieceType[]).forEach((promotion) =>
            moves.push({ from: s, to, promotion, captured: null }),
          );
        } else {
          moves.push({ from: s, to, captured: null });
          if (rank === startRank && !pos.board[sq(file, rank + 2 * dir)]) {
            moves.push({ from: s, to: sq(file, rank + 2 * dir), captured: null, doublePush: true });
          }
        }
      }
      for (const df of [-1, 1]) {
        const cf = file + df;
        const cr = rank + dir;
        if (!onBoard(cf, cr)) continue;
        const to = sq(cf, cr);
        const target = pos.board[to];
        if (target && colorOf(target) !== me) {
          if (cr === promoRank) {
            (['Q', 'R', 'B', 'N'] as PieceType[]).forEach((promotion) =>
              moves.push({ from: s, to, promotion, captured: target }),
            );
          } else {
            moves.push({ from: s, to, captured: target });
          }
        } else if (to === pos.ep) {
          moves.push({ from: s, to, captured: me === 'w' ? 'p' : 'P', enPassant: true });
        }
      }
    } else if (type === 'N' || type === 'K') {
      const offsets = type === 'N' ? KNIGHT_OFFSETS : KING_OFFSETS;
      for (const [df, dr] of offsets) {
        const f = file + df;
        const r = rank + dr;
        if (!onBoard(f, r)) continue;
        const to = sq(f, r);
        const target = pos.board[to];
        if (!target || colorOf(target) !== me) moves.push({ from: s, to, captured: target ?? null });
      }
      if (type === 'K') {
        const homeRank = me === 'w' ? 0 : 7;
        const opponent: Color = me === 'w' ? 'b' : 'w';
        if (s === sq(4, homeRank)) {
          const kingSide = me === 'w' ? pos.castling.K : pos.castling.k;
          const queenSide = me === 'w' ? pos.castling.Q : pos.castling.q;
          const free = (f: number) => !pos.board[sq(f, homeRank)];
          const safe = (f: number) => !isAttacked(pos, sq(f, homeRank), opponent);
          if (kingSide && free(5) && free(6) && safe(4) && safe(5) && safe(6)) {
            moves.push({ from: s, to: sq(6, homeRank), captured: null, castle: 'K' });
          }
          if (queenSide && free(3) && free(2) && free(1) && safe(4) && safe(3) && safe(2)) {
            moves.push({ from: s, to: sq(2, homeRank), captured: null, castle: 'Q' });
          }
        }
      }
    } else {
      const dirs = type === 'B' ? BISHOP_DIRS : type === 'R' ? ROOK_DIRS : QUEEN_DIRS;
      for (const [df, dr] of dirs) {
        let f = file + df;
        let r = rank + dr;
        while (onBoard(f, r)) {
          const to = sq(f, r);
          const target = pos.board[to];
          if (!target) {
            moves.push({ from: s, to, captured: null });
          } else {
            if (colorOf(target) !== me) moves.push({ from: s, to, captured: target });
            break;
          }
          f += df;
          r += dr;
        }
      }
    }
  }
  return moves;
}

export function makeMove(pos: Position, move: Move): Position {
  const next = clone(pos);
  const board = next.board;
  const piece = board[move.from];
  if (!piece) throw new Error(`Aucune pièce en ${squareName(move.from)}`);
  const me = colorOf(piece) as Color;
  const type = typeOf(piece);

  next.ep = -1;

  if (move.enPassant) {
    board[sq(fileOf(move.to), rankOf(move.to) + (me === 'w' ? -1 : 1))] = null;
  }
  board[move.to] = move.promotion
    ? ((me === 'w' ? move.promotion : move.promotion.toLowerCase()) as Piece)
    : piece;
  board[move.from] = null;

  if (move.castle) {
    const r = rankOf(move.from);
    if (move.castle === 'K') {
      board[sq(5, r)] = board[sq(7, r)];
      board[sq(7, r)] = null;
    } else {
      board[sq(3, r)] = board[sq(0, r)];
      board[sq(0, r)] = null;
    }
  }
  if (move.doublePush) {
    next.ep = sq(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
  }
  if (type === 'K') {
    if (me === 'w') {
      next.castling.K = false;
      next.castling.Q = false;
    } else {
      next.castling.k = false;
      next.castling.q = false;
    }
  }
  // une tour qui quitte son coin — ou qui s'y fait capturer — annule le roque
  const clearRight = (s: number) => {
    if (s === sq(0, 0)) next.castling.Q = false;
    if (s === sq(7, 0)) next.castling.K = false;
    if (s === sq(0, 7)) next.castling.q = false;
    if (s === sq(7, 7)) next.castling.k = false;
  };
  clearRight(move.from);
  clearRight(move.to);

  // la pendule des 50 coups repart à zéro sur toute prise ou tout coup de pion
  next.halfmove = type === 'P' || move.captured || move.enPassant ? 0 : pos.halfmove + 1;
  if (me === 'b') next.fullmove = pos.fullmove + 1;

  next.turn = me === 'w' ? 'b' : 'w';
  return next;
}

export function legalMoves(pos: Position): Move[] {
  const me = pos.turn;
  return pseudoMoves(pos).filter((m) => !inCheck(makeMove(pos, m), me));
}

export const movesFrom = (pos: Position, from: number): Move[] =>
  legalMoves(pos).filter((m) => m.from === from);

/**
 * Coups d'une pièce avant application de la règle du roi en échec.
 *
 * Sert à distinguer deux refus que l'élève vit de la même façon : la pièce ne
 * va pas là (rien à expliquer), ou elle irait mais laisserait le roi en échec
 * (et là il faut le dire).
 */
export const pseudoMovesFrom = (pos: Position, from: number): Move[] =>
  pseudoMoves(pos).filter((m) => m.from === from);

/**
 * Roque désigné en touchant sa propre tour plutôt que la case d'arrivée du roi.
 *
 * Beaucoup d'applications d'échecs acceptent les deux gestes, et c'est celui
 * que font spontanément les joueurs qui pensent « je roque avec cette
 * tour-là ». Sans cela, le toucher ne produit rien et le roque paraît
 * interdit alors qu'il est parfaitement légal.
 */
export function castleByRook(
  pos: Position,
  kingSquare: number,
  rookSquare: number,
): Move | undefined {
  const king = pos.board[kingSquare];
  const rook = pos.board[rookSquare];
  if (!king || !rook) return undefined;
  if (typeOf(king) !== 'K' || typeOf(rook) !== 'R') return undefined;
  if (colorOf(king) !== colorOf(rook)) return undefined;
  // la tour du petit roque est celle de la colonne h, celle du grand roque en a
  const file = fileOf(rookSquare);
  const side: 'K' | 'Q' | null = file === 7 ? 'K' : file === 0 ? 'Q' : null;
  if (!side) return undefined;
  if (rankOf(rookSquare) !== rankOf(kingSquare)) return undefined;
  return movesFrom(pos, kingSquare).find((m) => m.castle === side);
}

export function findMove(
  pos: Position,
  from: number,
  to: number,
  promotion?: PieceType,
): Move | undefined {
  return legalMoves(pos).find(
    (m) => m.from === from && m.to === to && (!promotion || m.promotion === promotion),
  );
}

/**
 * Le matériel restant permet-il encore de mater ?
 *
 * Position morte au sens de la FIDE : aucune suite de coups légaux ne peut
 * mener au mat. C'est le cas de roi contre roi, de roi et une pièce mineure
 * contre roi, et de toute position où il ne reste que des **fous, tous sur
 * des cases de même couleur**, quel que soit leur camp — y compris plusieurs
 * fous d'un même joueur, ce qu'on ne rencontre qu'après une sous-promotion.
 * Deux cavaliers contre un roi nu ne sont pas une position morte : le mat
 * existe, à condition que le défenseur l'aide.
 */
export function insufficientMaterial(pos: Position): boolean {
  let cavaliers = 0;
  let fous = 0;
  let couleur = -1;
  let deuxCouleurs = false;
  for (let s = 0; s < 64; s += 1) {
    const p = pos.board[s];
    if (!p) continue;
    const type = typeOf(p);
    if (type === 'K') continue;
    // un pion, une tour ou une dame suffisent toujours à mater
    if (type === 'P' || type === 'R' || type === 'Q') return false;
    if (type === 'N') {
      cavaliers += 1;
    } else {
      fous += 1;
      const c = (fileOf(s) + rankOf(s)) % 2;
      if (couleur >= 0 && c !== couleur) deuxCouleurs = true;
      couleur = c;
    }
  }
  if (cavaliers + fous <= 1) return true;
  return cavaliers === 0 && !deuxCouleurs;
}

/**
 * Signature d'une position pour la règle de répétition.
 *
 * Deux positions se répètent si les pièces, le trait, les droits de roque et
 * les coups possibles coïncident — les pendules n'entrent pas en compte, d'où
 * la troncature des deux derniers champs du FEN.
 *
 * La case en passant, elle, n'entre en compte que si une prise en passant est
 * **réellement possible**. `makeMove` la renseigne après tout double pas,
 * même quand aucun pion adverse ne peut prendre ; la garder telle quelle
 * faisait passer deux positions identiques pour différentes, et une triple
 * répétition n'était détectée qu'un coup trop tard — ou jamais, si l'on
 * déviait entre-temps. `chess.js` applique la même règle.
 */
export const positionKey = (pos: Position): string => {
  const [placement, trait, roques, ep] = toFEN(pos).split(' ');
  const epUtile = pos.ep >= 0 && legalMoves(pos).some((m) => m.enPassant);
  return `${placement} ${trait} ${roques} ${epUtile ? ep : '-'}`;
};

/**
 * Statut de la position.
 *
 * `history` contient les signatures des positions déjà rencontrées dans la
 * partie, celle-ci comprise, et sert à détecter la triple répétition. Le mat
 * et le pat priment sur les nulles de pendule : une partie qui se termine par
 * un mat au 50e coup reste un mat.
 */
export function gameStatus(pos: Position, history: string[] = []): GameStatus {
  const moves = legalMoves(pos);
  const check = inCheck(pos, pos.turn);
  if (moves.length === 0) return check ? 'mate' : 'stalemate';
  if (insufficientMaterial(pos)) return 'draw-material';
  if (pos.halfmove >= 100) return 'draw-fifty';
  if (history.length > 0) {
    const key = positionKey(pos);
    if (history.filter((h) => h === key).length >= 3) return 'draw-repetition';
  }
  return check ? 'check' : 'ok';
}

/** Notation algébrique française : R D T F C (roi, dame, tour, fou, cavalier). */
const FRENCH: Record<PieceType, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C', P: '' };

export function toSAN(before: Position, move: Move, after?: Position): string {
  const resulting = after ?? makeMove(before, move);
  // on lit l'échec directement : un statut de nulle (matériel, 50 coups)
  // masquerait le « + » alors que le coup donne bien échec
  const suffix = inCheck(resulting, resulting.turn)
    ? legalMoves(resulting).length === 0
      ? '#'
      : '+'
    : '';

  if (move.castle) return `${move.castle === 'K' ? 'O-O' : 'O-O-O'}${suffix}`;

  const piece = before.board[move.from] as Piece;
  const type = typeOf(piece);
  const captures = Boolean(move.captured) || Boolean(move.enPassant);

  if (type === 'P') {
    const from = captures ? `${FILES[fileOf(move.from)]}x` : '';
    const promo = move.promotion ? `=${FRENCH[move.promotion]}` : '';
    return `${from}${squareName(move.to)}${promo}${suffix}`;
  }

  // désambiguïsation quand deux pièces identiques atteignent la même case
  const rivals = legalMoves(before).filter(
    (m) => m.to === move.to && m.from !== move.from && before.board[m.from] === piece,
  );
  let disambiguation = '';
  if (rivals.length > 0) {
    // colonne si elle suffit, sinon rangée, sinon la case entière : trois
    // dames en a1, a5 et e1 vers e5 exigent « Da1xe5 », ni « Dae5 » ni « D1e5 »
    const memeColonne = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
    const memeRangee = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
    if (!memeColonne) disambiguation = FILES[fileOf(move.from)];
    else if (!memeRangee) disambiguation = String(rankOf(move.from) + 1);
    else disambiguation = squareName(move.from);
  }
  return `${FRENCH[type]}${disambiguation}${captures ? 'x' : ''}${squareName(move.to)}${suffix}`;
}

/** Lecture de la notation anglaise standard (PGN), pour importer des parties. */
export function parseSAN(pos: Position, san: string): Move | undefined {
  const clean = san.replace(/[+#!?]/g, '');
  if (clean.startsWith('O-O-O')) return legalMoves(pos).find((m) => m.castle === 'Q');
  if (clean.startsWith('O-O')) return legalMoves(pos).find((m) => m.castle === 'K');

  const promoMatch = /=([QRBN])$/.exec(clean);
  const promotion = promoMatch ? (promoMatch[1] as PieceType) : undefined;
  const body = clean.replace(/=[QRBN]$/, '');

  const m = /^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])$/.exec(body);
  if (!m) return undefined;
  const [, letter, fromFile, fromRank, target] = m;
  const type = (letter ?? 'P') as PieceType;
  const to = squareFromName(target);

  return legalMoves(pos).find((mv) => {
    const piece = pos.board[mv.from];
    return (
      mv.to === to &&
      piece !== null &&
      typeOf(piece) === type &&
      (!fromFile || FILES[fileOf(mv.from)] === fromFile) &&
      (!fromRank || rankOf(mv.from) + 1 === Number(fromRank)) &&
      (!promotion || mv.promotion === promotion)
    );
  });
}

/** Rejoue une suite de coups en notation anglaise depuis la position initiale. */
export function playSAN(sanLine: string, from: Position = parseFEN(START_FEN)): Move[] {
  let pos = from;
  const moves: Move[] = [];
  for (const token of sanLine.trim().split(/\s+/)) {
    const mv = parseSAN(pos, token);
    if (!mv) break;
    moves.push(mv);
    pos = makeMove(pos, mv);
  }
  return moves;
}

/** Compte les feuilles de l'arbre de coups — l'étalon de justesse d'un moteur. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of legalMoves(pos)) nodes += perft(makeMove(pos, m), depth - 1);
  return nodes;
}
