/**
 * Défauts de règles trouvés par l'audit indépendant, chacun avec sa preuve.
 *
 * Aucun n'apparaissait sur le chemin ordinaire de jeu — c'est pourquoi les
 * 115 000 positions comparées à `chess.js` ne les avaient pas vus. Ils se
 * cachent dans des situations rares : trois pièces identiques, une promotion
 * en fou, une répétition qui traverse un double pas de pion.
 */
import { Chess } from 'chess.js';
import { expliquerRoque } from '../coaching';
import { issueDePartie, toucherCase } from '../interaction';
import {
  START_FEN,
  findMove,
  gameStatus,
  legalMoves,
  makeMove,
  parseFEN,
  positionKey,
  squareFromName,
  squareName,
  toSAN,
  type Move,
  type Position,
} from '../engine';

const uci = (m: { from: number; to: number; promotion?: string }): string =>
  `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`;

function jouer(fen: string, coups: string[]): { pos: Position; historique: Position[] } {
  let pos = parseFEN(fen);
  const historique: Position[] = [];
  for (const u of coups) {
    const m = legalMoves(pos).find((x) => uci(x) === u);
    if (!m) throw new Error(`coup ${u} illégal`);
    historique.push(pos);
    pos = makeMove(pos, m);
  }
  return { pos, historique };
}

describe('triple répétition et case en passant fantôme', () => {
  const suite = ['e2e4', 'g8f6', 'g1f3', 'f6g8', 'f3g1', 'g8f6', 'g1f3', 'f6g8', 'f3g1'];

  test('la position après 1.e4 est reconnue à sa troisième occurrence, au bon coup', () => {
    const { pos, historique } = jouer(START_FEN, suite);
    // chess.js voit la triple répétition au neuvième demi-coup
    const ref = new Chess();
    suite.forEach((u) => ref.move({ from: u.slice(0, 2), to: u.slice(2, 4) }));
    expect(ref.isThreefoldRepetition()).toBe(true);
    expect(issueDePartie(pos, historique, 'w', 'Pixou')).toMatchObject({
      statut: 'draw-repetition',
      resultat: 'draw',
    });
  });

  test('la nulle n’est pas perdue si l’on dévie ensuite', () => {
    // la répétition a eu lieu : elle compte, même si le coup suivant est différent
    const { pos, historique } = jouer(START_FEN, [...suite.slice(0, 8)]);
    expect(issueDePartie(pos, historique, 'w', 'Pixou')).toBeNull();
    const { pos: p9, historique: h9 } = jouer(START_FEN, suite);
    expect(issueDePartie(p9, h9, 'w', 'Pixou')).not.toBeNull();
  });

  test('une prise en passant réellement possible distingue deux positions', () => {
    const avec = parseFEN('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1');
    const sans = parseFEN('4k3/8/8/8/3pP3/8/8/4K3 b - - 0 1');
    expect(positionKey(avec)).not.toBe(positionKey(sans));
    const inutile = parseFEN('4k3/8/8/8/4P3/8/8/4K3 b - e3 0 1');
    const aucune = parseFEN('4k3/8/8/8/4P3/8/8/4K3 b - - 0 1');
    expect(positionKey(inutile)).toBe(positionKey(aucune));
  });

  test('même verdict que chess.js sur des parties qui tournent en rond', () => {
    let seed = 20260928;
    const hasard = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let repetitions = 0;
    for (let partie = 0; partie < 300; partie += 1) {
      let pos = parseFEN(START_FEN);
      const ref = new Chess();
      const cles = [positionKey(pos)];
      let precedent: { de: number; vers: number } | null = null;
      let avantDernier: { de: number; vers: number } | null = null;
      for (let p = 0; p < 60; p += 1) {
        const coups = legalMoves(pos);
        if (coups.length === 0) break;
        // Une partie qui répète : on rejoue volontiers le coup à l'envers de
        // celui de l'adversaire deux demi-coups plus tôt, ce qui fait revenir
        // la position. Tirer au hasard ne produisait presque aucune répétition.
        const retour: typeof coups[number] | undefined = avantDernier
          ? coups.find((m) => m.from === avantDernier!.vers && m.to === avantDernier!.de && !m.captured)
          : undefined;
        const sobres = coups.filter((m) => 'NRnr'.includes(pos.board[m.from] ?? ' ') && !m.captured);
        const pool = sobres.length > 0 && hasard() < 0.9 ? sobres : coups;
        const m: Move = retour && hasard() < 0.75 ? retour : pool[Math.floor(hasard() * pool.length)];
        avantDernier = precedent;
        precedent = { de: m.from, vers: m.to };
        pos = makeMove(pos, m);
        ref.move({ from: squareName(m.from), to: squareName(m.to), promotion: m.promotion?.toLowerCase() });
        cles.push(positionKey(pos));
        const miens = gameStatus(pos, cles) === 'draw-repetition';
        const siens = ref.isThreefoldRepetition();
        if (miens !== siens) {
          throw new Error(`désaccord après ${ref.history().join(' ')} : moteur ${miens}, chess.js ${siens}`);
        }
        if (siens) {
          repetitions += 1;
          break;
        }
      }
    }
    expect(repetitions).toBeGreaterThan(20);
  }, 120000);
});

describe('notation : désambiguïsation', () => {
  test('trois dames : la case entière quand ni la colonne ni la rangée ne suffisent', () => {
    const pos = parseFEN('7K/8/7k/Q7/8/8/8/Q3Q3 w - - 0 1');
    const m = findMove(pos, squareFromName('a1'), squareFromName('e5'))!;
    const ref = new Chess('7K/8/7k/Q7/8/8/8/Q3Q3 w - - 0 1');
    const attendu = ref.move({ from: 'a1', to: 'e5' }).san;
    expect(attendu).toBe('Qa1e5');
    expect(toSAN(pos, m)).toBe('Da1e5');
  });

  test('la colonne suffit quand les rivales sont sur d’autres colonnes', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/K7/R6R w - - 0 1');
    expect(toSAN(pos, findMove(pos, squareFromName('a1'), squareFromName('d1'))!)).toBe('Tad1');
  });

  test('la rangée suffit quand les rivales partagent la colonne', () => {
    const pos = parseFEN('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1');
    expect(toSAN(pos, findMove(pos, squareFromName('a1'), squareFromName('a3'))!)).toBe('T1a3');
  });
});

describe('matériel insuffisant', () => {
  test.each([
    ['deux fous de même couleur de case, même camp', '4K3/8/8/2B5/8/8/5Bk1/8 b - - 0 1', true],
    ['deux fous de même couleur, un par camp', '8/8/8/7K/2Bk4/8/8/7B w - - 0 1', true],
    ['fous de couleurs opposées : le mat existe', '8/8/8/7K/2Bk4/8/8/6B1 w - - 0 1', false],
    ['deux cavaliers contre un roi nu : le mat existe', '4k3/8/8/8/8/8/8/2N1KN2 w - - 0 1', false],
    ['un fou contre un cavalier : le mat existe', '4k3/8/8/8/8/8/8/2B1K1n1 w - - 0 1', false],
    ['roi et fou contre roi', '4k3/8/8/8/8/8/8/3BK3 w - - 0 1', true],
  ])('%s', (_nom, fen, mort) => {
    expect(gameStatus(parseFEN(fen)) === 'draw-material').toBe(mort);
    // et l'arbitre indépendant est du même avis
    expect(new Chess(fen).isInsufficientMaterial()).toBe(mort);
  });
});

describe('lecture stricte du FEN', () => {
  test.each([
    ['chaîne vide', ''],
    ['sept rangées', '8/8/8/8/8/8/8 w - - 0 1'],
    ['neuf rangées', '8/8/8/8/8/8/8/8/8 w - - 0 1'],
    ['rangée trop longue', 'rnbqkbnrr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['rangée trop courte', 'rnbqkbn/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['caractère inconnu', 'rnbqkbnx/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    ['pas de roi noir', '8/8/8/8/8/8/8/4K3 w - - 0 1'],
    ['deux rois blancs', '4k3/8/8/8/8/8/8/K3K3 w - - 0 1'],
    ['pion sur la première rangée', '4k3/8/8/8/8/8/8/P3K3 w - - 0 1'],
    ['trait invalide', '4k3/8/8/8/8/8/8/4K3 x - - 0 1'],
    ['roques invalides', '4k3/8/8/8/8/8/8/4K3 w KQkqz - 0 1'],
    ['en passant invalide', '4k3/8/8/8/8/8/8/4K3 w - e5 0 1'],
  ])('refuse : %s', (_nom, fen) => {
    expect(() => parseFEN(fen)).toThrow(/FEN invalide/);
  });

  test('retire les droits de roque qui n’ont plus de tour', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1');
    expect(pos.castling).toEqual({ K: false, Q: false, k: false, q: false });
    expect(legalMoves(pos).some((m) => m.castle)).toBe(false);
  });

  test('accepte un FEN sans compteurs de coups', () => {
    expect(parseFEN('4k3/8/8/8/8/8/8/4K3 w - -').fullmove).toBe(1);
    expect(parseFEN('4k3/8/8/8/8/8/8/4K3').turn).toBe('w');
  });
});

describe('sous-promotion', () => {
  const fen = '8/6P1/5K1k/8/6B1/3B4/8/8 w - - 0 1';

  test('le toucher demande la pièce au lieu de promouvoir en dame', () => {
    const pos = parseFEN(fen);
    const d = toucherCase(pos, squareFromName('g7'), squareFromName('g8'));
    expect(d.type).toBe('promotion');
  });

  test('promouvoir en dame est pat, en cavalier est mat', () => {
    const pos = parseFEN(fen);
    const d = toucherCase(pos, squareFromName('g7'), squareFromName('g8'));
    if (d.type !== 'promotion') throw new Error('attendu : promotion');
    const statut = (p: 'Q' | 'N') =>
      gameStatus(makeMove(pos, d.candidats.find((m) => m.promotion === p)!));
    expect(statut('Q')).toBe('stalemate');
    expect(statut('N')).toBe('mate');
  });
});

describe('roque impossible : on dit pourquoi', () => {
  const e1 = squareFromName('e1');
  const g1 = squareFromName('g1');
  const c1 = squareFromName('c1');

  test('droit perdu', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/R3K2R w Q - 0 1');
    expect(expliquerRoque(pos, e1, g1)).toMatch(/plus faire le petit roque/);
  });

  test('roi en échec', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    expect(expliquerRoque(pos, e1, g1)).toBe('Tu ne peux pas roquer : ton roi est en échec.');
  });

  test('une pièce gêne', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/R3KB1R w KQ - 0 1');
    expect(expliquerRoque(pos, e1, g1)).toBe(
      'Tu ne peux pas roquer : le fou f1 est entre ton roi et ta tour.',
    );
  });

  test('case traversée attaquée, en nommant l’attaquant', () => {
    const pos = parseFEN('4k3/8/8/8/8/5b2/8/R3K2R w KQ - 0 1'.replace('5b2/8', '8/5b2').replace('8/8/8/8/5b2', '8/8/8/8/5b2'));
    void pos;
    const p2 = parseFEN('4k3/8/8/8/8/8/6b1/R3K2R w KQ - 0 1');
    expect(expliquerRoque(p2, e1, g1)).toMatch(/traverserait en f1|arriverait en g1|contrôlée par le fou/);
  });

  test('grand roque : la case b peut être attaquée, pas les cases d et c', () => {
    const attaqueB = parseFEN('1r2k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    expect(expliquerRoque(attaqueB, e1, c1)).toBeNull();
    expect(legalMoves(attaqueB).some((m) => m.castle === 'Q')).toBe(true);
    const attaqueD = parseFEN('3rk3/8/8/8/8/8/8/R3K3 w Q - 0 1');
    expect(expliquerRoque(attaqueD, e1, c1)).toMatch(/traverserait en d1, contrôlée par la tour d8/);
  });

  test('le geste « roi vers sa tour » est reconnu aussi', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    expect(expliquerRoque(pos, e1, squareFromName('h1'))).toMatch(/en échec/);
  });

  test('rien à dire quand le roque est légal, ou que ce n’est pas un roque', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(expliquerRoque(pos, e1, g1)).toBeNull();
    expect(expliquerRoque(pos, e1, squareFromName('e2'))).toBeNull();
  });

  test('toucherCase relaie l’explication au lieu de rester muet', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
    const d = toucherCase(pos, e1, g1);
    expect(d.type).toBe('refus');
    if (d.type === 'refus') expect(d.message).toMatch(/ton roi est en échec/);
  });
});
