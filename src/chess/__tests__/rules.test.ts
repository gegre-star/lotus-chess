import {
  castleByRook,
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

describe('roque désigné par la tour', () => {
  /**
   * Beaucoup de joueurs roquent en touchant leur tour plutôt que la case
   * d'arrivée du roi. Sans ce geste, le roque semble interdit alors qu'il est
   * légal — c'est ce que le test de bout en bout dans le navigateur a montré.
   */
  const pret = () => parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');

  it('reconnaît le petit roque par la tour h1', () => {
    const m = castleByRook(pret(), at('e1'), at('h1'));
    expect(m?.castle).toBe('K');
    expect(m?.to).toBe(at('g1'));
  });

  it('reconnaît le grand roque par la tour a1', () => {
    const m = castleByRook(pret(), at('e1'), at('a1'));
    expect(m?.castle).toBe('Q');
    expect(m?.to).toBe(at('c1'));
  });

  it('fonctionne pour les noirs', () => {
    const pos = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    expect(castleByRook(pos, at('e8'), at('h8'))?.castle).toBe('K');
    expect(castleByRook(pos, at('e8'), at('a8'))?.castle).toBe('Q');
  });

  it('refuse quand le roque n’est plus légal', () => {
    // roi en échec : le roque est interdit
    const enEchec = parseFEN('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
    expect(castleByRook(enEchec, at('e1'), at('h1'))).toBeUndefined();
    // droits perdus
    const sansDroits = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1');
    expect(castleByRook(sansDroits, at('e1'), at('h1'))).toBeUndefined();
    // case occupée entre le roi et la tour
    const bloque = parseFEN('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1');
    expect(castleByRook(bloque, at('e1'), at('h1'))).toBeUndefined();
  });

  it('ignore une tour adverse ou une pièce qui n’en est pas une', () => {
    const pos = pret();
    expect(castleByRook(pos, at('e1'), at('a8'))).toBeUndefined();
    expect(castleByRook(pos, at('e1'), at('e1'))).toBeUndefined();
    expect(castleByRook(pos, at('e1'), at('d4'))).toBeUndefined();
  });
});

describe('parades disponibles sous échec', () => {
  /**
   * Position réellement rencontrée en partie, signalée comme « échec et mat »
   * alors qu'elle ne l'était pas : il restait un unique coup, difficile à
   * trouver. C'est ce que l'aide à l'échec sert à montrer.
   */
  const fen = '2k5/rp5p/2bR2p1/p1R2pn1/2B5/1P6/2P2PPP/4r1K1 w - - 0 28';

  it('n’est pas un mat', () => {
    expect(gameStatus(parseFEN(fen))).toBe('check');
  });

  it('n’offre qu’un seul coup, et c’est un blocage du fou', () => {
    const pos = parseFEN(fen);
    const coups = legalMoves(pos);
    expect(coups).toHaveLength(1);
    expect(coups[0].from).toBe(at('c4'));
    expect(coups[0].to).toBe(at('f1'));
  });

  it('désigne une seule pièce capable de parer', () => {
    const pos = parseFEN(fen);
    const parades = new Set(legalMoves(pos).map((m) => m.from));
    expect(parades.size).toBe(1);
    expect(parades.has(at('c4'))).toBe(true);
  });

  it('compte les pièces, pas les coups', () => {
    // échec de la tour e8 : le roi peut fuir, et la tour a2 peut bloquer en e2.
    // Deux pièces différentes, alors qu'un roi seul offrirait plusieurs coups
    // sans que cela fasse plus d'une pièce à montrer.
    const pos = parseFEN('4r2k/8/8/8/8/8/R7/4K3 w - - 0 1');
    const parades = new Set(legalMoves(pos).map((m) => m.from));
    expect(parades).toEqual(new Set([at('e1'), at('a2')]));
  });
});
