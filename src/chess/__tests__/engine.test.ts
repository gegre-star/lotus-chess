import {
  START_FEN,
  findMove,
  gameStatus,
  inCheck,
  legalMoves,
  makeMove,
  movesFrom,
  parseFEN,
  parseSAN,
  perft,
  playSAN,
  squareFromName as at,
  squareName,
  toFEN,
  toSAN,
} from '../engine';

describe('perft — justesse du générateur de coups', () => {
  it('donne les valeurs de référence depuis la position initiale', () => {
    const start = parseFEN(START_FEN);
    expect(perft(start, 1)).toBe(20);
    expect(perft(start, 2)).toBe(400);
    expect(perft(start, 3)).toBe(8902);
  });

  // « Kiwipete » : position piège classique (roques, prise en passant, clouages)
  it('donne les valeurs de référence sur Kiwipete', () => {
    const pos = parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
  });

  it('donne les valeurs de référence sur une finale à prises en passant', () => {
    const pos = parseFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
  });
});

describe('FEN', () => {
  it('fait un aller-retour sans perte sur la position initiale', () => {
    expect(toFEN(parseFEN(START_FEN))).toBe(START_FEN);
  });

  it('relit les droits de roque et la case de prise en passant', () => {
    const pos = parseFEN('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(pos.castling).toEqual({ K: true, Q: true, k: true, q: true });
    expect(squareName(pos.ep)).toBe('d6');
    expect(pos.turn).toBe('w');
  });
});

describe('règles particulières', () => {
  it('exécute la prise en passant et retire bien le pion capturé', () => {
    const pos = parseFEN('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const move = findMove(pos, at('e5'), at('d6'));
    expect(move?.enPassant).toBe(true);
    const after = makeMove(pos, move!);
    expect(after.board[at('d5')]).toBeNull();
    expect(after.board[at('d6')]).toBe('P');
  });

  it('déplace la tour lors du petit et du grand roque', () => {
    const pos = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');

    const short = makeMove(pos, findMove(pos, at('e1'), at('g1'))!);
    expect(short.board[at('g1')]).toBe('K');
    expect(short.board[at('f1')]).toBe('R');
    expect(short.board[at('h1')]).toBeNull();

    const long = makeMove(pos, findMove(pos, at('e1'), at('c1'))!);
    expect(long.board[at('c1')]).toBe('K');
    expect(long.board[at('d1')]).toBe('R');
    expect(long.board[at('a1')]).toBeNull();
  });

  it('interdit le roque à travers une case attaquée', () => {
    // la tour noire en f8 contrôle f1 : le roi ne peut pas traverser
    const pos = parseFEN('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(findMove(pos, at('e1'), at('g1'))).toBeUndefined();
    expect(findMove(pos, at('e1'), at('c1'))).toBeDefined();
  });

  it('perd le droit au roque quand la tour est capturée dans son coin', () => {
    const pos = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const grab = makeMove(pos, findMove(pos, at('a1'), at('a8'))!);
    expect(grab.castling.q).toBe(false);
    expect(grab.castling.k).toBe(true);
  });

  it('propose les quatre promotions et applique celle demandée', () => {
    const pos = parseFEN('8/4P3/8/8/8/8/8/K5k1 w - - 0 1');
    const promos = movesFrom(pos, at('e7')).map((m) => m.promotion);
    expect(promos.sort()).toEqual(['B', 'N', 'Q', 'R']);
    const knight = makeMove(pos, findMove(pos, at('e7'), at('e8'), 'N')!);
    expect(knight.board[at('e8')]).toBe('N');
  });

  it('interdit de bouger une pièce clouée', () => {
    // le fou b5 cloue le cavalier c6 sur le roi e8
    const pos = parseFEN('4k3/8/2n5/1B6/8/8/8/6K1 b - - 0 1');
    expect(movesFrom(pos, at('c6'))).toHaveLength(0);
  });

  it('oblige à parer un échec', () => {
    const pos = parseFEN('3Rk3/8/8/8/8/8/8/6K1 b - - 0 1');
    expect(inCheck(pos, 'b')).toBe(true);
    // toute réponse légale doit sortir le roi de l'échec
    for (const m of legalMoves(pos)) {
      expect(inCheck(makeMove(pos, m), 'b')).toBe(false);
    }
  });
});

describe('fin de partie', () => {
  it('reconnaît un échec et mat', () => {
    const pos = parseFEN('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1');
    const after = makeMove(pos, findMove(pos, at('d1'), at('d8'))!);
    expect(gameStatus(after)).toBe('mate');
  });

  it('reconnaît un pat', () => {
    const pos = parseFEN('7k/8/6Q1/8/8/8/8/6K1 b - - 0 1');
    expect(gameStatus(pos)).toBe('stalemate');
    expect(inCheck(pos, 'b')).toBe(false);
  });

  it('distingue échec simple et mat', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/3R2K1 w - - 0 1');
    const after = makeMove(pos, findMove(pos, at('d1'), at('d8'))!);
    expect(gameStatus(after)).toBe('check');
  });
});

describe('notation', () => {
  it('écrit les coups en notation française', () => {
    let pos = parseFEN(START_FEN);
    const written: string[] = [];
    for (const [from, to] of [
      ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'b5'],
    ]) {
      const mv = findMove(pos, at(from), at(to))!;
      written.push(toSAN(pos, mv));
      pos = makeMove(pos, mv);
    }
    expect(written).toEqual(['e4', 'e5', 'Cf3', 'Cc6', 'Fb5']);
  });

  it('désambiguïse deux pièces qui visent la même case', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/1N1K1N2 w - - 0 1');
    expect(toSAN(pos, findMove(pos, at('b1'), at('d2'))!)).toBe('Cbd2');
  });

  it('note le roque, la promotion et le mat', () => {
    const castle = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(toSAN(castle, findMove(castle, at('e1'), at('g1'))!)).toBe('O-O');

    const promo = parseFEN('8/4P3/8/8/8/8/8/K5k1 w - - 0 1');
    expect(toSAN(promo, findMove(promo, at('e7'), at('e8'), 'Q')!)).toBe('e8=D');

    const mate = parseFEN('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1');
    expect(toSAN(mate, findMove(mate, at('d1'), at('d8'))!)).toBe('Td8#');
  });

  it('relit la notation anglaise standard', () => {
    const pos = parseFEN(START_FEN);
    const mv = parseSAN(pos, 'Nf3');
    expect(mv && squareName(mv.from)).toBe('g1');
    expect(mv && squareName(mv.to)).toBe('f3');
  });

  it('rejoue une ouverture complète écrite en notation anglaise', () => {
    const moves = playSAN('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O');
    expect(moves).toHaveLength(9);
    expect(moves[8].castle).toBe('K');
  });
});
