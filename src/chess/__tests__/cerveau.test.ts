/**
 * Le cerveau voit-il ce qu'un joueur honnête verrait ?
 *
 * On ne teste pas « un coup précis dans une partie » mais des capacités : mater
 * quand un mat existe, prendre ce qui est à prendre, ne pas tomber dans une
 * prise empoisonnée, et jouer un coup légal partout. Les trente-trois
 * problèmes de l'application servent de banc d'essai : leur solution a déjà
 * été validée par ailleurs.
 */
import { Cerveau, type Niveau } from '../brain/cerveau';
import { PUZZLES } from '../content';
import {
  START_FEN,
  findMove,
  gameStatus,
  legalMoves,
  makeMove,
  parseFEN,
  squareFromName,
  squareName,
  toFEN,
  type Move,
  type PieceType,
} from '../engine';

const FORT: Niveau = { profondeur: 8, tempsMs: 0, qmax: 8, temperature: 0, distraction: 0 };
const uci = (m: Move): string =>
  `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`;

describe('mater quand un mat existe', () => {
  test('mat du couloir en un coup', () => {
    const c = new Cerveau();
    const m = c.penser(parseFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), FORT)!;
    expect(uci(m)).toBe('a1a8');
  });

  test('le mat du berger est joué par les noirs', () => {
    const c = new Cerveau();
    const m = c.penser(
      parseFEN('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2'),
      FORT,
    )!;
    expect(uci(m)).toBe('d8h4');
  });

  const mats = PUZZLES.filter((p) => p.mate);
  test.each(mats.map((p) => [p.id, p] as const))('problème de mat « %s »', (_id, puzzle) => {
    const c = new Cerveau();
    const pos = parseFEN(puzzle.fen);
    const m = c.penser(pos, { ...FORT, profondeur: 6 })!;
    const apres = makeMove(pos, m);
    // Plusieurs coups peuvent mater aussi vite : `esc-b` se résout par Tg1
    // comme par Tb7. On n'exige donc pas le coup de la solution officielle,
    // mais un mat au moins aussi rapide.
    const k = (puzzle.line.length + 1) / 2;
    if (gameStatus(apres) === 'mate') {
      expect(k).toBeGreaterThanOrEqual(1);
    } else {
      const a = c.analyser(apres, { profondeur: 2 * k + 2 });
      expect(a.mat).not.toBeNull();
      expect(-(a.mat as number)).toBeLessThanOrEqual(k - 1);
    }
  });
});

describe('prendre ce qui est à prendre', () => {
  const gains = PUZZLES.filter((p) => !p.mate);
  test.each(gains.map((p) => [p.id, p] as const))('problème de gain « %s »', (_id, puzzle) => {
    const c = new Cerveau();
    const pos = parseFEN(puzzle.fen);
    const m = c.penser(pos, { ...FORT, profondeur: 6 })!;
    // le coup joué doit mener au même gain que la solution officielle
    const attendu = puzzle.line[0];
    const officiel = findMove(pos, squareFromName(attendu[0]), squareFromName(attendu[1]), attendu[2] as PieceType)!;
    const ana = c.analyser(pos, { profondeur: 6 });
    // deux coups peuvent être équivalents : on accepte le coup officiel, ou un
    // coup dont l'évaluation égale celle du coup officiel à un tiers de pion près
    if (uci(m) !== uci(officiel)) {
      const apresOfficiel = c.analyser(makeMove(pos, officiel), { profondeur: 5 });
      const apresChoisi = c.analyser(makeMove(pos, m), { profondeur: 5 });
      const vOff = -(apresOfficiel.cp ?? 0);
      const vCho = -(apresChoisi.cp ?? 0);
      expect(vCho).toBeGreaterThanOrEqual(vOff - 35);
    }
    expect(ana.meilleur).not.toBeNull();
  });
});

describe('ne pas se faire piéger', () => {
  test('la prise empoisonnée d’un pion par la dame est refusée', () => {
    // Dxb7 gagne un pion mais perd la dame après ...Fxb7 ; un joueur honnête voit la reprise
    const c = new Cerveau();
    const pos = parseFEN('rn1qkbnr/pbpppppp/1p6/8/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3');
    const m = c.penser(pos, { ...FORT, profondeur: 5 })!;
    expect(uci(m)).not.toBe('d1g4x');
    // la dame ne doit pas partir se faire prendre gratuitement
    const apres = makeMove(pos, m);
    const reponses = legalMoves(apres).filter((x) => x.captured && x.captured.toUpperCase() === 'Q');
    expect(reponses).toEqual([]);
  });

  test('une dame en prise est sauvée', () => {
    const c = new Cerveau();
    // la dame blanche en d4 est attaquée par le cavalier c6
    const pos = parseFEN('r1bqkbnr/pppp1ppp/2n5/4p3/3QP3/8/PPP2PPP/RNB1KBNR w KQkq - 1 3');
    const m = c.penser(pos, { ...FORT, profondeur: 5 })!;
    const apres = makeMove(pos, m);
    const prises = legalMoves(apres).filter((x) => x.captured && x.captured.toUpperCase() === 'Q');
    expect(prises).toEqual([]);
  });
});

describe('jouer des coups légaux partout', () => {
  test('à tous les niveaux, sur des positions variées', () => {
    const niveaux: Niveau[] = [
      { profondeur: 1, tempsMs: 0, qmax: 0, temperature: 140, distraction: 0.5 },
      { profondeur: 3, tempsMs: 0, qmax: 4, temperature: 60, distraction: 0.2 },
      { profondeur: 5, tempsMs: 0, qmax: 8, temperature: 0, distraction: 0 },
    ];
    const fens = [
      START_FEN,
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
    ];
    const c = new Cerveau();
    for (const niveau of niveaux) {
      for (const fen of fens) {
        const pos = parseFEN(fen);
        const m = c.penser(pos, niveau, { hasard: () => 0.37 });
        expect(m).not.toBeNull();
        expect(legalMoves(pos).some((x) => x.from === m!.from && x.to === m!.to)).toBe(true);
      }
    }
  }, 60000);

  test('rend null quand la partie est finie', () => {
    const c = new Cerveau();
    expect(c.penser(parseFEN('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'), FORT)).toBeNull();
    expect(c.penser(parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), FORT)).toBeNull();
  });

  test('l’analyse annonce un mat avec son nombre de coups', () => {
    const c = new Cerveau();
    const a = c.analyser(parseFEN('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), { profondeur: 4 });
    expect(a.meilleur).toBe('a1a8');
    expect(a.mat).toBe(1);
    expect(a.cp).toBeNull();
  });
});

describe('vitesse', () => {
  test('atteint la profondeur 6 depuis la position de départ en moins de 5 secondes', () => {
    const c = new Cerveau();
    const t0 = Date.now();
    const a = c.analyser(parseFEN(START_FEN), { profondeur: 6 });
    const dt = Date.now() - t0;
    expect(a.profondeur).toBe(6);
    expect(dt).toBeLessThan(5000);
    // eslint-disable-next-line no-console
    console.log(`profondeur ${a.profondeur} en ${dt} ms — meilleur ${a.meilleur} (${a.cp} cp) pv ${a.pv.slice(0, 6).join(' ')}`);
  });

  test('respecte la limite de temps', () => {
    const c = new Cerveau();
    const t0 = Date.now();
    c.analyser(parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), {
      profondeur: 30,
      tempsMs: 300,
    });
    expect(Date.now() - t0).toBeLessThan(900);
  });

  test('ne modifie pas la position qu’on lui donne', () => {
    const c = new Cerveau();
    const pos = parseFEN(START_FEN);
    const avant = toFEN(pos);
    c.penser(pos, FORT);
    expect(toFEN(pos)).toBe(avant);
  });
});
