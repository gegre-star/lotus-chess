/**
 * Le geste, pas seulement la règle.
 *
 * Un moteur juste ne suffit pas : entre la règle et l'élève il y a deux
 * touchers, et c'est là que naît le sentiment de bug. On vérifie donc la
 * décision elle-même, sur des milliers de positions — en insistant sur le cas
 * signalé : roi en échec, pion voisin, prise légale.
 */
import { issueDePartie, toucherCase } from '../interaction';
import { expliquerRefus } from '../coaching';
import {
  START_FEN,
  findKing,
  inCheck,
  legalMoves,
  makeMove,
  parseFEN,
  pseudoMovesFrom,
  squareFromName,
  squareName,
  type Position,
} from '../engine';

function graine(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Le geste de l'élève : il touche sa pièce, puis la case d'arrivée. */
const deuxTouchers = (pos: Position, from: number, to: number) => {
  const premier = toucherCase(pos, null, from);
  expect(premier).toEqual({ type: 'selection', square: from });
  // une promotion demande un choix : ici on prend la dame, comme le ferait l'élève
  return toucherCase(pos, from, to, 'Q');
};

describe('roi en échec prenant un pion voisin', () => {
  const cas: [string, string, string][] = [
    ['roi blanc', '8/8/8/8/8/4p3/8/3K3k w - - 0 1', 'd1e2'],
    ['roi noir', '3k4/8/4P3/8/8/8/8/4K3 b - - 0 1', 'd8e7'],
    ['roi blanc, pion protégé par son propre roi voisin', '8/8/8/8/8/8/3pk3/3K4 w - - 0 1', 'd1d2'],
  ];

  test.each(cas)('%s : le geste joue la prise', (_nom, fen, uci) => {
    const pos = parseFEN(fen);
    const from = squareFromName(uci.slice(0, 2));
    const to = squareFromName(uci.slice(2, 4));
    const legal = legalMoves(pos).some((m) => m.from === from && m.to === to);

    const decision = deuxTouchers(pos, from, to);
    if (legal) {
      expect(decision.type).toBe('coup');
      if (decision.type === 'coup') expect(decision.move.to).toBe(to);
    } else {
      expect(decision.type).toBe('refus');
    }
  });

  test('le geste joue la prise dans toutes les finales où elle est légale', () => {
    const hasard = graine(77003);
    const PIECES = 'QRBNPqrbnp';
    let verifies = 0;

    for (let essai = 0; essai < 60000 && verifies < 600; essai += 1) {
      const cases: (string | null)[] = new Array(64).fill(null);
      const libre = (): number => {
        for (;;) {
          const s = Math.floor(hasard() * 64);
          if (!cases[s]) return s;
        }
      };
      cases[libre()] = 'K';
      cases[libre()] = 'k';
      for (let i = 0; i < 4; i += 1) {
        const piece = PIECES[Math.floor(hasard() * PIECES.length)];
        const s = libre();
        if (piece.toUpperCase() === 'P' && (s < 8 || s >= 56)) continue;
        cases[s] = piece;
      }
      let placement = '';
      for (let rang = 7; rang >= 0; rang -= 1) {
        let vide = 0;
        for (let colonne = 0; colonne < 8; colonne += 1) {
          const p = cases[rang * 8 + colonne];
          if (p) {
            if (vide) placement += vide;
            vide = 0;
            placement += p;
          } else vide += 1;
        }
        if (vide) placement += vide;
        if (rang > 0) placement += '/';
      }
      const pos = parseFEN(`${placement} ${hasard() < 0.5 ? 'w' : 'b'} - - 0 1`);
      if (inCheck(pos, pos.turn === 'w' ? 'b' : 'w')) continue;
      if (!inCheck(pos, pos.turn)) continue;

      const roi = findKing(pos, pos.turn);
      // toutes les prises de pion que le roi *tente*, légales ou non
      for (const essaiRoi of pseudoMovesFrom(pos, roi)) {
        if (!essaiRoi.captured || essaiRoi.captured.toUpperCase() !== 'P') continue;
        const legal = legalMoves(pos).some((m) => m.from === roi && m.to === essaiRoi.to);
        const decision = deuxTouchers(pos, roi, essaiRoi.to);
        if (legal) {
          expect(decision).toEqual({
            type: 'coup',
            move: legalMoves(pos).find((m) => m.from === roi && m.to === essaiRoi.to),
          });
        } else {
          // refusé, soit — mais jamais sans dire pourquoi
          expect(decision.type).toBe('refus');
          if (decision.type === 'refus') {
            expect(decision.message).toMatch(/Prise impossible en [a-h][1-8]/);
          }
        }
        verifies += 1;
      }
    }

    expect(verifies).toBeGreaterThanOrEqual(600);
  }, 120000);
});

describe('un refus nomme toujours la pièce responsable', () => {
  test('pion défendu par un pion', () => {
    const pos = parseFEN('7k/8/8/8/8/3p4/4p3/3K4 w - - 0 1');
    expect(expliquerRefus(pos, squareFromName('d1'), squareFromName('e2'))).toBe(
      'Prise impossible en e2 : cette pièce est défendue par le pion d3.',
    );
  });

  test('pion défendu par une tour lointaine', () => {
    const pos = parseFEN('4r2k/8/8/8/8/8/4p3/3K4 w - - 0 1');
    expect(expliquerRefus(pos, squareFromName('d1'), squareFromName('e2'))).toBe(
      'Prise impossible en e2 : cette pièce est défendue par la tour e8.',
    );
  });

  test('case de fuite contrôlée : on dit par quoi', () => {
    // roi blanc d1 en échec de la tour a1 ; c2 est tenue par le fou h7
    const pos = parseFEN('7k/7b/8/8/8/8/8/r2K4 w - - 0 1');
    expect(expliquerRefus(pos, squareFromName('d1'), squareFromName('c2'))).toBe(
      'Ton roi ne peut pas aller en c2 : le fou h7 contrôle cette case.',
    );
  });

  test('un coup qui ne pare pas l’échec nomme l’attaquant', () => {
    // prendre la dame est légal : rien à expliquer
    const pos = parseFEN('4k3/8/8/8/7q/8/8/4K2R w - - 0 1');
    expect(expliquerRefus(pos, squareFromName('h1'), squareFromName('h4'))).toBeNull();
    // la dame e4 donne échec par la colonne : Th2 ne s'en occupe pas
    const echec = parseFEN('4k3/8/8/8/4q3/8/8/4K2R w - - 0 1');
    expect(expliquerRefus(echec, squareFromName('h1'), squareFromName('h2'))).toBe(
      'Ce coup ne pare pas l’échec de la dame e4.',
    );
  });

  test('pièce clouée : on nomme celle qui cloue', () => {
    // le cavalier e2 est cloué par la tour e8, sur la colonne du roi blanc
    const pos = parseFEN('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(expliquerRefus(pos, squareFromName('e2'), squareFromName('c3'))).toBe(
      'Cette pièce est clouée : la bouger découvrirait ton roi sur la tour e8.',
    );
  });

  test('rien à dire quand la pièce ne va tout simplement pas là', () => {
    const pos = parseFEN(START_FEN);
    expect(expliquerRefus(pos, squareFromName('a1'), squareFromName('h8'))).toBeNull();
  });
});

describe('le geste ordinaire reste intact', () => {
  test('toucher une case vide désélectionne', () => {
    const pos = parseFEN(START_FEN);
    expect(toucherCase(pos, null, squareFromName('e5'))).toEqual({
      type: 'selection',
      square: null,
    });
  });

  test('toucher sa tour depuis le roi roque', () => {
    const pos = parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const decision = toucherCase(pos, squareFromName('e1'), squareFromName('h1'));
    expect(decision.type).toBe('coup');
    if (decision.type === 'coup') expect(decision.move.castle).toBe('K');
  });

  test('la promotion demande à l’élève quelle pièce il veut', () => {
    const pos = parseFEN('8/4P3/8/8/8/8/8/K6k w - - 0 1');
    const decision = toucherCase(pos, squareFromName('e7'), squareFromName('e8'));
    expect(decision.type).toBe('promotion');
    if (decision.type === 'promotion') {
      expect(decision.candidats.map((m) => m.promotion).sort()).toEqual(['B', 'N', 'Q', 'R']);
    }
  });

  test('une promotion imposée d’avance se joue directement', () => {
    const pos = parseFEN('8/4P3/8/8/8/8/8/K6k w - - 0 1');
    const decision = toucherCase(pos, squareFromName('e7'), squareFromName('e8'), 'Q');
    expect(decision.type).toBe('coup');
    if (decision.type === 'coup') expect(decision.move.promotion).toBe('Q');
  });

  test('la prise en passant se joue', () => {
    const pos = parseFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    const decision = toucherCase(pos, squareFromName('e5'), squareFromName('d6'));
    expect(decision.type).toBe('coup');
    if (decision.type === 'coup') expect(decision.move.enPassant).toBe(true);
  });

  test('sous un échec, un coup impossible signale les pièces qui peuvent parer', () => {
    // seule la tour peut s'interposer ou le roi bouger
    const pos = parseFEN('4k3/8/8/8/8/8/R7/4K2r w - - 0 1');
    const decision = toucherCase(pos, squareFromName('a2'), squareFromName('a8'));
    expect(decision.type).toBe('refus');
    if (decision.type === 'refus') expect(decision.message).toMatch(/échec/);
  });
});

describe('la partie avance comme avant', () => {
  test('une partie entière se joue par touchers successifs', () => {
    const hasard = graine(4242);
    let pos = parseFEN(START_FEN);
    for (let demiCoup = 0; demiCoup < 60; demiCoup += 1) {
      const coups = legalMoves(pos);
      if (coups.length === 0) break;
      const choisi = coups[Math.floor(hasard() * coups.length)];
      const decision = deuxTouchers(pos, choisi.from, choisi.to);
      expect(decision.type).toBe('coup');
      if (decision.type !== 'coup') break;
      expect(squareName(decision.move.from)).toBe(squareName(choisi.from));
      pos = makeMove(pos, decision.move);
    }
    expect(pos.fullmove).toBeGreaterThan(20);
  });
});

describe('fin de partie', () => {
  const joue = (fen: string, uci: string[]): { position: Position; historique: Position[] } => {
    let position = parseFEN(fen);
    const historique: Position[] = [];
    for (const u of uci) {
      const move = legalMoves(position).find(
        (m) => `${squareName(m.from)}${squareName(m.to)}` === u,
      );
      if (!move) throw new Error(`coup ${u} illégal dans ${position.turn}`);
      historique.push(position);
      position = makeMove(position, move);
    }
    return { position, historique };
  };

  test('une partie en cours n’est pas terminée', () => {
    expect(issueDePartie(parseFEN(START_FEN), [], 'w', 'Pixou')).toBeNull();
  });

  test('un échec simple n’est pas terminé', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/R3K2r w - - 0 1');
    expect(issueDePartie(pos, [], 'w', 'Pixou')).toBeNull();
  });

  test('le mat est annoncé du bon côté', () => {
    // les noirs sont mats, l'élève joue les blancs
    const mat = parseFEN('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
    expect(issueDePartie(mat, [], 'w', 'Pixou')).toMatchObject({
      statut: 'mate',
      resultat: 'win',
    });
    expect(issueDePartie(mat, [], 'b', 'Pixou')).toMatchObject({
      statut: 'mate',
      resultat: 'loss',
      message: expect.stringContaining('Pixou'),
    });
  });

  test('le pat est une nulle', () => {
    const pat = parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(issueDePartie(pat, [], 'w', 'Pixou')).toMatchObject({
      statut: 'stalemate',
      resultat: 'draw',
    });
  });

  test('roi et fou contre roi : nulle par matériel', () => {
    const issue = issueDePartie(parseFEN('4k3/8/8/8/8/8/8/3BK3 b - - 0 1'), [], 'w', 'Pixou');
    expect(issue).toMatchObject({ statut: 'draw-material', resultat: 'draw' });
    expect(issue?.message).toMatch(/matériel/);
  });

  test('cent demi-coups sans prise : nulle des cinquante coups', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/R7/4K3 w - - 100 60');
    expect(issueDePartie(pos, [], 'w', 'Pixou')).toMatchObject({
      statut: 'draw-fifty',
      resultat: 'draw',
    });
    // à 99, la partie continue
    expect(
      issueDePartie(parseFEN('4k3/8/8/8/8/8/R7/4K3 w - - 99 60'), [], 'w', 'Pixou'),
    ).toBeNull();
  });

  test('la même position trois fois : nulle par répétition', () => {
    // les deux tours font l'aller-retour jusqu'à la troisième occurrence
    const aller = ['a1a2', 'h8h7', 'a2a1', 'h7h8', 'a1a2', 'h8h7', 'a2a1', 'h7h8'];
    const { position, historique } = joue('r6k/8/8/8/8/8/8/R6K w - - 0 1', aller);
    expect(issueDePartie(position, historique, 'w', 'Pixou')).toMatchObject({
      statut: 'draw-repetition',
      resultat: 'draw',
    });
    // sans l'historique, la répétition est invisible : c'est bien lui qui compte
    expect(issueDePartie(position, [], 'w', 'Pixou')).toBeNull();
  });
});
