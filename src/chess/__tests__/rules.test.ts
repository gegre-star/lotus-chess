import {
  parseFEN,
  toFEN,
  makeMove,
  findMove,
  legalMoves,
  gameStatus,
  insufficientMaterial,
  positionKey,
  squareFromName as at,
  type Position,
} from '../engine';

/**
 * Non-régression sur les règles qui décident de l'issue d'une partie.
 *
 * Ces cas sont ceux où une erreur ne se voit pas : la partie continue alors
 * qu'elle est terminée, ou s'arrête alors qu'elle continue. Les positions sont
 * décrites en clair pour rester relisibles sans échiquier.
 */

const play = (pos: Position, from: string, to: string): Position => {
  const move = findMove(pos, at(from), at(to));
  if (!move) throw new Error(`${from}${to} illégal`);
  return makeMove(pos, move);
};

describe('pendule des cinquante coups', () => {
  it('déclare la nulle à cent demi-coups sans prise ni poussée', () => {
    expect(gameStatus(parseFEN('8/8/4k3/8/8/4K3/8/4R3 w - - 100 60'))).toBe('draw-fifty');
  });

  it('ne la déclare pas un demi-coup trop tôt', () => {
    expect(gameStatus(parseFEN('8/8/4k3/8/8/4K3/8/4R3 w - - 99 60'))).toBe('ok');
  });

  it('laisse le mat primer sur la pendule', () => {
    expect(gameStatus(parseFEN('R5k1/5ppp/8/8/8/8/8/6K1 b - - 100 60'))).toBe('mate');
  });

  it('remet la pendule à zéro sur une poussée de pion', () => {
    // le roi blanc est en e1, sinon il bloque lui-même la poussée
    const pos = parseFEN('8/8/4k3/8/8/8/4P3/4K3 w - - 42 60');
    expect(play(pos, 'e2', 'e4').halfmove).toBe(0);
  });

  it('remet la pendule à zéro sur une prise', () => {
    const pos = parseFEN('8/8/4k3/8/8/4K3/8/3rR3 w - - 42 60');
    expect(play(pos, 'e1', 'd1').halfmove).toBe(0);
  });

  it("l'incrémente sur un coup ordinaire et compte les coups entiers", () => {
    const pos = parseFEN('8/8/4k3/8/8/4K3/8/4R3 b - - 42 60');
    const next = play(pos, 'e6', 'd6');
    expect(next.halfmove).toBe(43);
    expect(next.fullmove).toBe(61);
  });
});

describe('matériel insuffisant', () => {
  const dead = [
    ['roi contre roi', '8/8/4k3/8/8/4K3/8/8 w - - 0 1'],
    ['roi et fou contre roi', '8/8/4k3/8/8/4K3/8/5B2 w - - 0 1'],
    ['roi et cavalier contre roi', '8/8/4k3/8/8/4K3/8/5N2 w - - 0 1'],
    ['fous de même couleur de case', '5b2/8/4k3/8/8/4K3/8/2B5 w - - 0 1'],
  ] as const;

  const alive = [
    ['un pion suffit', '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1'],
    ['une tour suffit', '8/8/4k3/8/8/4K3/8/4R3 w - - 0 1'],
    ['deux cavaliers ne sont pas une position morte', '8/8/4k3/8/8/4K3/8/4NN2 w - - 0 1'],
    ['fous de couleurs de case différentes', '5b2/8/4k3/8/8/4K3/8/1B6 w - - 0 1'],
  ] as const;

  dead.forEach(([nom, fen]) => {
    it(`déclare la nulle : ${nom}`, () => {
      expect(insufficientMaterial(parseFEN(fen))).toBe(true);
      expect(gameStatus(parseFEN(fen))).toBe('draw-material');
    });
  });

  alive.forEach(([nom, fen]) => {
    it(`laisse la partie continuer : ${nom}`, () => {
      expect(insufficientMaterial(parseFEN(fen))).toBe(false);
      expect(gameStatus(parseFEN(fen))).not.toBe('draw-material');
    });
  });
});

describe('triple répétition', () => {
  it('déclare la nulle quand la position revient une troisième fois', () => {
    // les deux rois font l'aller-retour : la position initiale revient deux fois
    let pos = parseFEN('8/8/4k3/8/8/4K3/8/R7 w - - 10 40');
    const history = [positionKey(pos)];
    const boucle: [string, string][] = [
      ['a1', 'b1'], ['e6', 'd6'], ['b1', 'a1'], ['d6', 'e6'],
      ['a1', 'b1'], ['e6', 'd6'], ['b1', 'a1'], ['d6', 'e6'],
    ];
    boucle.forEach(([from, to]) => {
      pos = play(pos, from, to);
      history.push(positionKey(pos));
    });
    expect(history.filter((h) => h === history[0])).toHaveLength(3);
    expect(gameStatus(pos, history)).toBe('draw-repetition');
  });

  it('ne confond pas deux positions au trait différent', () => {
    const blanc = parseFEN('8/8/4k3/8/8/4K3/8/R7 w - - 10 40');
    const noir = parseFEN('8/8/4k3/8/8/4K3/8/R7 b - - 10 40');
    expect(positionKey(blanc)).not.toBe(positionKey(noir));
  });

  it('ignore les pendules dans la signature', () => {
    const a = parseFEN('8/8/4k3/8/8/4K3/8/R7 w - - 10 40');
    const b = parseFEN('8/8/4k3/8/8/4K3/8/R7 w - - 30 55');
    expect(positionKey(a)).toBe(positionKey(b));
  });
});

describe('mats et pats de référence', () => {
  const cas = [
    ['mat du couloir', 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', 'mate'],
    ['mat du berger', 'r1bqkbnr/pppp1Qpp/2n5/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', 'mate'],
    ['pat classique du roi en a8', 'k7/8/1Q6/8/8/8/8/7K b - - 0 1', 'stalemate'],
    ['échec simple, la partie continue', '4k3/8/8/8/8/8/8/4K2R b K - 0 1', 'ok'],
  ] as const;

  cas.forEach(([nom, fen, attendu]) => {
    it(`${nom} → ${attendu}`, () => {
      expect(gameStatus(parseFEN(fen))).toBe(attendu);
    });
  });

  it('un roi en échec ne peut jouer que des coups qui parent', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    const apres = play(pos, 'h1', 'h8');
    expect(gameStatus(apres)).toBe('check');
    // toutes les réponses sortent le roi de l'échec
    legalMoves(apres).forEach((m) => {
      expect(gameStatus(makeMove(apres, m))).not.toBe('check');
    });
  });
});

describe('FEN', () => {
  it('conserve les pendules lors de l’aller-retour', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 7 42';
    expect(toFEN(parseFEN(fen))).toBe(fen);
  });
});
