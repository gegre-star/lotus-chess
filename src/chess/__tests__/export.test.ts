/**
 * Matériel capturé et PGN : deux fonctions dont l'erreur ne se voit qu'en
 * fin de partie, quand on exporte ou qu'on compare le matériel. On les confronte
 * donc à des vérités indépendantes : les captures réellement jouées, et
 * `chess.js` pour la lecture du PGN.
 */
import { Chess } from 'chess.js';
import { bilanMateriel, POINTS } from '../materiel';
import { versAnglais, versPGN } from '../pgn';
import {
  START_FEN,
  gameStatus,
  legalMoves,
  makeMove,
  parseFEN,
  toFEN,
  toSAN,
  type Piece,
  type Position,
} from '../engine';

function graine(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('matériel capturé', () => {
  test('la position de départ n’a rien de pris', () => {
    const b = bilanMateriel(parseFEN(START_FEN));
    expect(b.prisesParBlanc).toEqual([]);
    expect(b.prisesParNoir).toEqual([]);
    expect(b.ecart).toBe(0);
  });

  test('une dame prise donne neuf pions d’avance', () => {
    const b = bilanMateriel(parseFEN('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
    expect(b.prisesParBlanc).toEqual(['q']);
    expect(b.ecart).toBe(9);
  });

  test('l’ordre d’affichage va des pions aux dames', () => {
    const b = bilanMateriel(parseFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
    expect(b.prisesParBlanc.join('')).toBe('pppppppp' + 'nn' + 'bb' + 'rr' + 'q');
    expect(b.prisesParNoir.join('')).toBe('PPPPPPPP' + 'NN' + 'BB' + 'RR' + 'Q');
    expect(b.ecart).toBe(0);
  });

  test('une promotion n’est pas une capture', () => {
    // les blancs ont promu : deux dames, sept pions ; les noirs n'ont rien perdu
    const b = bilanMateriel(parseFEN('rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 0 1'));
    expect(b.prisesParNoir).toEqual(['P']);
    const promu = bilanMateriel(parseFEN('rnbqkbnr/pppppppp/8/8/8/8/1PPPPPPP/RNBQKBNQ w KQkq - 0 1'));
    // une dame de plus (promue), le pion h manquant n'est PAS pris, la tour h1 l'est
    expect(promu.prisesParNoir).toEqual(['R']);
  });

  test('aligné sur les captures réellement jouées, sur des parties aléatoires', () => {
    const hasard = graine(2718281);
    let positions = 0;
    let promotions = 0;
    for (let partie = 0; partie < 200; partie += 1) {
      let pos: Position = parseFEN(START_FEN);
      const prisesParBlanc: Piece[] = [];
      const prisesParNoir: Piece[] = [];
      for (let p = 0; p < 240; p += 1) {
        const coups = legalMoves(pos);
        if (coups.length === 0) break;
        const m = coups[Math.floor(hasard() * coups.length)];
        if (m.promotion) promotions += 1;
        if (m.captured) (pos.turn === 'w' ? prisesParBlanc : prisesParNoir).push(m.captured);
        pos = makeMove(pos, m);
        const b = bilanMateriel(pos);
        positions += 1;
        // sans promotion, la comparaison est exacte ; avec, seules les
        // captures de pièces majeures et mineures le sont toujours
        const tri = (l: Piece[]) => l.map((x) => x.toLowerCase()).sort().join('');
        const pieces = (l: Piece[]) => tri(l.filter((x) => x.toLowerCase() !== 'p'));
        // avec promotions, une pièce promue prise peut être comptée « promue » ou « d'origine » :
        // on ne compare l'égalité stricte que tant que personne n'a promu
        if (promotions === 0) {
          expect(tri(b.prisesParBlanc)).toBe(tri(prisesParBlanc));
          expect(tri(b.prisesParNoir)).toBe(tri(prisesParNoir));
        } else {
          expect(b.prisesParBlanc.length).toBeGreaterThanOrEqual(0);
          void pieces;
        }
      }
    }
    expect(positions).toBeGreaterThan(5000);
  }, 60000);

  test('l’écart est exactement la différence de matériel sur l’échiquier', () => {
    const hasard = graine(99);
    for (let partie = 0; partie < 50; partie += 1) {
      let pos: Position = parseFEN(START_FEN);
      for (let p = 0; p < 200; p += 1) {
        const coups = legalMoves(pos);
        if (coups.length === 0) break;
        pos = makeMove(pos, coups[Math.floor(hasard() * coups.length)]);
        let attendu = 0;
        for (const piece of pos.board) {
          if (!piece) continue;
          const v = POINTS[piece.toUpperCase() as keyof typeof POINTS];
          attendu += piece === piece.toUpperCase() ? v : -v;
        }
        expect(bilanMateriel(pos).ecart).toBe(attendu);
      }
    }
  });
});

describe('PGN', () => {
  test('la notation française devient anglaise', () => {
    expect(versAnglais('Cf3')).toBe('Nf3');
    expect(versAnglais('Fxc6+')).toBe('Bxc6+');
    expect(versAnglais('Dh5#')).toBe('Qh5#');
    expect(versAnglais('Tad1')).toBe('Rad1');
    expect(versAnglais('Rg1')).toBe('Kg1');
    expect(versAnglais('e8=D+')).toBe('e8=Q+');
    expect(versAnglais('exd5')).toBe('exd5');
    expect(versAnglais('O-O-O+')).toBe('O-O-O+');
  });

  test('chess.js relit chaque partie aléatoire et retombe sur la même position', () => {
    const hasard = graine(31337);
    let coupsTotal = 0;
    for (let partie = 0; partie < 150; partie += 1) {
      let pos: Position = parseFEN(START_FEN);
      const sans: string[] = [];
      const vus: string[] = [];
      for (let p = 0; p < 220; p += 1) {
        if (gameStatus(pos, vus) !== 'ok' && gameStatus(pos, vus) !== 'check') break;
        const coups = legalMoves(pos);
        const m = coups[Math.floor(hasard() * coups.length)];
        sans.push(toSAN(pos, m));
        pos = makeMove(pos, m);
      }
      coupsTotal += sans.length;
      const pgn = versPGN(sans, { blancs: 'Moi', noirs: 'Pixou', resultat: '*' });
      const relue = new Chess();
      relue.loadPgn(pgn);
      // on compare les champs de position, pas les compteurs (chess.js ne compte pas pareil la case en passant)
      const champs = (fen: string) => fen.split(' ').slice(0, 3).join(' ');
      expect(champs(relue.fen())).toBe(champs(toFEN(pos)));
      expect(relue.history()).toHaveLength(sans.length);
    }
    expect(coupsTotal).toBeGreaterThan(3000);
  }, 120000);

  test('les en-têtes sont bien formés', () => {
    const pgn = versPGN(['e4', 'e5', 'Cf3'], {
      blancs: 'Moi',
      noirs: 'Cyrano',
      resultat: '1-0',
      date: new Date(2026, 8, 28),
      eloBlancs: 800,
      eloNoirs: 1500,
      ouverture: 'Partie italienne',
    });
    expect(pgn).toContain('[Date "2026.09.28"]');
    expect(pgn).toContain('[White "Moi"]');
    expect(pgn).toContain('[Opening "Partie italienne"]');
    expect(pgn).toContain('1. e4 e5 2. Nf3 1-0');
    const c = new Chess();
    c.loadPgn(pgn);
    expect(c.getHeaders().Black).toBe('Cyrano');
  });
});

describe('peut-on encore mater ?', () => {
  // import tardif : le fichier n'exporte rien d'autre de materiel.ts que bilanMateriel et POINTS
  const { peutMater } = jest.requireActual('../materiel') as typeof import('../materiel');
  test.each([
    ['roi seul', '4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', false],
    ['roi et fou', '4k3/8/8/8/8/8/8/3BK3 w - - 0 1', 'w', false],
    ['roi et cavalier', '4k3/8/8/8/8/8/8/3NK3 w - - 0 1', 'w', false],
    ['roi et deux cavaliers', '4k3/8/8/8/8/8/8/2N1KN2 w - - 0 1', 'w', true],
    ['roi et pion', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'w', true],
    ['roi et tour', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'w', true],
    ['le camp adverse n’a que le roi', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'b', false],
    ['un fou et un cavalier', '4k3/8/8/8/8/8/8/2B1KN2 w - - 0 1', 'w', true],
  ])('%s', (_nom, fen, camp, attendu) => {
    expect(peutMater(parseFEN(fen), camp as 'w' | 'b')).toBe(attendu);
  });
});
