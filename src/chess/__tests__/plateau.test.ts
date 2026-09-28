/**
 * Le plateau de recherche est un second moteur de règles : il doit être aussi
 * juste que le premier, et on ne le croit pas sur parole.
 *
 * Deux vérifications indépendantes. `perft` compte les coups à profondeur
 * donnée sur les positions de référence publiées. Et une comparaison position
 * par position avec `engine.ts` — lui-même confronté à `chess.js` — vérifie
 * que ce sont bien les mêmes coups, pas seulement le même nombre.
 */
import { Plateau, coupsLegaux, deCase, perft, promoDe, versCase } from '../brain/plateau';
import {
  START_FEN,
  legalMoves,
  makeMove,
  parseFEN,
  squareName,
  toFEN,
  type Position,
} from '../engine';

const charge = (fen: string): Plateau => {
  const p = new Plateau();
  p.charger(parseFEN(fen));
  return p;
};

describe('perft', () => {
  const cas: [string, string, number[]][] = [
    ['position de départ', START_FEN, [20, 400, 8902, 197281]],
    [
      'Kiwipete',
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      [48, 2039, 97862],
    ],
    ['finale (position 3)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
    [
      'position 4 (promotions, roques)',
      'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      [6, 264, 9467, 422333],
    ],
    [
      'position 5',
      'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
      [44, 1486, 62379],
    ],
    [
      'position 6',
      'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
      [46, 2079, 89890],
    ],
  ];

  test.each(cas)('%s', (_nom, fen, attendus) => {
    const p = charge(fen);
    attendus.forEach((attendu, i) => {
      expect(`profondeur ${i + 1}: ${perft(p, i + 1)}`).toBe(`profondeur ${i + 1}: ${attendu}`);
    });
  });

  test('faire puis defaire restitue exactement la position', () => {
    const p = charge('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    const avant = { cases: Array.from(p.cases), hi: p.hi, lo: p.lo, roque: p.roque, ep: p.ep, demi: p.demi, trait: p.trait };
    perft(p, 3);
    expect({ cases: Array.from(p.cases), hi: p.hi, lo: p.lo, roque: p.roque, ep: p.ep, demi: p.demi, trait: p.trait }).toEqual(avant);
  });
});

/** Générateur déterministe : un écart doit pouvoir se rejouer. */
function graine(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const uci = (de: number, vers: number, promo: number): string =>
  `${squareName(de)}${squareName(vers)}${promo ? 'nbrq'[promo - 2] : ''}`;

describe('mêmes coups que engine.ts', () => {
  test('des parties aléatoires, de l’ouverture à la finale', () => {
    const hasard = graine(0xc0ffee);
    let positions = 0;
    const ecarts: string[] = [];
    const p = new Plateau();

    for (let partie = 0; partie < 150 && ecarts.length === 0; partie += 1) {
      let pos: Position = parseFEN(START_FEN);
      for (let demiCoup = 0; demiCoup < 200; demiCoup += 1) {
        p.charger(pos);
        const miens = coupsLegaux(p)
          .map((m) => uci(deCase(m), versCase(m), promoDe(m)))
          .sort();
        const leurs = legalMoves(pos)
          .map((m) => `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`)
          .sort();
        positions += 1;
        if (miens.join(' ') !== leurs.join(' ')) {
          ecarts.push(`${toFEN(pos)}\n  plateau : ${miens.join(' ')}\n  engine  : ${leurs.join(' ')}`);
          break;
        }
        if (leurs.length === 0) break;
        // le hachage incrémental doit égaler un recalcul complet
        const copie = new Plateau();
        const choisi = legalMoves(pos)[Math.floor(hasard() * leurs.length)];
        pos = makeMove(pos, choisi);
        copie.charger(pos);
        const m = coupsLegaux(p).find(
          (x) => deCase(x) === choisi.from && versCase(x) === choisi.to && (!choisi.promotion || promoDe(x) === 'NBRQ'.indexOf(choisi.promotion) + 2),
        )!;
        p.faire(m);
        if (p.hi !== copie.hi || p.lo !== copie.lo) {
          ecarts.push(`hachage incrémental faux après ${uci(choisi.from, choisi.to, 0)} → ${toFEN(pos)}`);
          break;
        }
      }
    }
    expect(ecarts).toEqual([]);
    expect(positions).toBeGreaterThan(8000);
  }, 180000);
});

describe('répétition', () => {
  test('la case en passant n’entre dans le hachage que si la prise est possible', () => {
    // 1.e4 avec un pion noir en d4 ou f4 : la prise en passant existe ; sans
    // pion adjacent, la même position doit garder le même hachage
    const a = charge('4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1');
    const b = charge('4k3/8/8/8/4P3/8/8/4K3 b - - 0 1');
    expect(`${a.hi}:${a.lo}`).toBe(`${b.hi}:${b.lo}`);
    const c = charge('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
    const d = charge('4k3/8/8/8/3pP3/8/8/4K3 b - - 0 1');
    expect(`${c.hi}:${c.lo}`).not.toBe(`${d.hi}:${d.lo}`);
  });

  test('un aller-retour de tours répète la position', () => {
    const p = charge('r6k/8/8/8/8/8/8/R6K w - - 0 1');
    const jouer = (de: string, vers: string) => {
      const m = coupsLegaux(p).find((x) => squareName(deCase(x)) === de && squareName(versCase(x)) === vers)!;
      p.faire(m);
    };
    expect(p.repetee()).toBe(false);
    jouer('a1', 'a2');
    jouer('a8', 'a7');
    jouer('a2', 'a1');
    jouer('a7', 'a8');
    expect(p.repetee()).toBe(true);
  });
});
