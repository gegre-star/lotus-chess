/**
 * Le moteur confronté à un arbitre indépendant.
 *
 * `perft` vérifie le générateur de coups contre des totaux de référence : il
 * dit qu'il y a le bon *nombre* de coups, pas que ce sont les bons. Ici on
 * compare la liste elle-même, position par position, à `chess.js` — une
 * bibliothèque tierce, éprouvée, utilisée uniquement dans les tests : le
 * moteur de l'application reste sans dépendance.
 *
 * Les parties sont tirées au hasard mais d'une graine fixe : un écart trouvé
 * ici se rejoue à l'identique.
 */
import { Chess } from 'chess.js';
import {
  START_FEN,
  findKing,
  inCheck,
  legalMoves,
  makeMove,
  parseFEN,
  squareName,
  toFEN,
  type Position,
} from '../engine';

const coupsMoteur = (p: Position): string[] =>
  legalMoves(p)
    .map(
      (m) =>
        `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`,
    )
    .sort();

const coupsArbitre = (fen: string): string[] =>
  new Chess(fen)
    .moves({ verbose: true })
    .map((m) => `${m.from}${m.to}${m.promotion ?? ''}`)
    .sort();

/** Générateur déterministe : un échec doit pouvoir se rejouer. */
function graine(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('coups légaux comparés à chess.js', () => {
  test('parties aléatoires, de l’ouverture à la finale', () => {
    const hasard = graine(20260928);
    let positions = 0;
    let finales = 0;
    let roiPrendPion = 0;
    const ecarts: string[] = [];

    for (let partie = 0; partie < 120 && ecarts.length === 0; partie += 1) {
      let pos = parseFEN(START_FEN);
      for (let demiCoup = 0; demiCoup < 160; demiCoup += 1) {
        const fen = toFEN(pos);
        const mien = coupsMoteur(pos);
        const sien = coupsArbitre(fen);
        positions += 1;
        if (fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length <= 8) finales += 1;
        if (mien.join(' ') !== sien.join(' ')) {
          ecarts.push(`${fen}\n  moteur   : ${mien.join(' ')}\n  chess.js : ${sien.join(' ')}`);
          break;
        }
        if (mien.length === 0) break;

        // le cas exact signalé : roi en échec capturant un pion voisin
        if (inCheck(pos, pos.turn)) {
          const roi = findKing(pos, pos.turn);
          if (
            legalMoves(pos).some(
              (m) => m.from === roi && m.captured && m.captured.toUpperCase() === 'P',
            )
          ) {
            roiPrendPion += 1;
          }
        }
        pos = makeMove(pos, legalMoves(pos)[Math.floor(hasard() * mien.length)]);
      }
    }

    expect(ecarts).toEqual([]);
    expect(positions).toBeGreaterThan(8000);
    // sans ces deux garde-fous, le test pourrait passer sans avoir rien vu
    expect(finales).toBeGreaterThan(100);
    expect(roiPrendPion).toBeGreaterThan(20);
  }, 180000);

  /**
   * Les parties tirées au hasard passent peu de temps en finale, alors que
   * c'est là que les cas limites se concentrent — pions qui se défendent
   * mutuellement, clouages à travers tout l'échiquier, promotions. On part
   * donc aussi de finales construites exprès.
   */
  test('finales construites, deux à six pièces', () => {
    const hasard = graine(5150);
    const PIECES = 'QRBNPqrbnp';
    let positions = 0;
    let roiPrendPion = 0;
    const ecarts: string[] = [];

    for (let essai = 0; essai < 4000 && ecarts.length === 0; essai += 1) {
      const cases: (string | null)[] = new Array(64).fill(null);
      const libre = (): number => {
        for (;;) {
          const s = Math.floor(hasard() * 64);
          if (!cases[s]) return s;
        }
      };
      cases[libre()] = 'K';
      cases[libre()] = 'k';
      const extra = 1 + Math.floor(hasard() * 4);
      for (let i = 0; i < extra; i += 1) {
        const piece = PIECES[Math.floor(hasard() * PIECES.length)];
        const s = libre();
        // un pion ne peut pas se trouver sur la première ni la huitième rangée
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
      const fen = `${placement} ${hasard() < 0.5 ? 'w' : 'b'} - - 0 1`;
      // c'est l'arbitre qui dit si la position est jouable : rois adjacents,
      // camp adverse déjà en échec… autant de FEN à écarter
      try {
        const arbitre = new Chess(fen);
        if (arbitre.isGameOver() && arbitre.moves().length === 0) continue;
      } catch {
        continue;
      }

      let pos = parseFEN(fen);
      // position impossible : le camp qui vient de jouer laisserait son roi en
      // échec, donc le roi serait capturable au coup suivant
      if (inCheck(pos, pos.turn === 'w' ? 'b' : 'w')) continue;

      for (let demiCoup = 0; demiCoup < 12; demiCoup += 1) {
        const courant = toFEN(pos);
        const mien = coupsMoteur(pos);
        const sien = coupsArbitre(courant);
        positions += 1;
        if (mien.join(' ') !== sien.join(' ')) {
          ecarts.push(`${courant}\n  moteur   : ${mien.join(' ')}\n  chess.js : ${sien.join(' ')}`);
          break;
        }
        if (mien.length === 0) break;
        if (inCheck(pos, pos.turn)) {
          const roi = findKing(pos, pos.turn);
          if (
            legalMoves(pos).some(
              (m) => m.from === roi && m.captured && m.captured.toUpperCase() === 'P',
            )
          ) {
            roiPrendPion += 1;
          }
        }
        pos = makeMove(pos, legalMoves(pos)[Math.floor(hasard() * mien.length)]);
      }
    }

    expect(ecarts).toEqual([]);
    expect(positions).toBeGreaterThan(8000);
    expect(roiPrendPion).toBeGreaterThan(20);
  }, 180000);
});

describe('roi en échec et pion voisin — les deux couleurs', () => {
  const cas: { nom: string; fen: string; uci: string; autorise: boolean }[] = [
    {
      nom: 'roi blanc prend le pion qui fait échec',
      fen: '8/8/8/8/8/4p3/8/3K3k w - - 0 1',
      uci: 'd1e2',
      autorise: true,
    },
    {
      nom: 'roi noir prend le pion qui fait échec',
      fen: '3k4/8/4P3/8/8/8/8/4K3 b - - 0 1',
      uci: 'd8e7',
      autorise: true,
    },
    {
      nom: 'roi blanc : le pion est défendu par un autre pion',
      fen: '7k/8/8/8/8/3p4/4p3/3K4 w - - 0 1',
      uci: 'd1e2',
      autorise: false,
    },
    {
      nom: 'roi noir : le pion est défendu par un autre pion',
      fen: '3k4/4P3/3P4/8/8/8/8/7K b - - 0 1',
      uci: 'd8e7',
      autorise: false,
    },
    {
      nom: 'roi blanc : le pion est défendu par une tour lointaine',
      fen: '4r2k/8/8/8/8/8/4p3/3K4 w - - 0 1',
      uci: 'd1e2',
      autorise: false,
    },
    {
      nom: 'roi noir : le pion est défendu par une tour lointaine',
      fen: '3k4/4P3/8/8/8/8/8/4R2K b - - 0 1',
      uci: 'd8e7',
      autorise: false,
    },
  ];

  test.each(cas)('$nom', ({ fen, uci, autorise }) => {
    const mien = coupsMoteur(parseFEN(fen));
    // l'arbitre indépendant valide la position autant que le verdict
    expect(mien).toEqual(coupsArbitre(fen));
    expect(mien.includes(uci)).toBe(autorise);
  });
});
