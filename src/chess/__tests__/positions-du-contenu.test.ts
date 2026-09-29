/**
 * Ce que doit respecter TOUTE position du contenu — leçons, problèmes,
 * exercices — avant même de regarder ce qu'elle enseigne.
 *
 * L'audit avait trouvé des positions que les tests d'alors laissaient passer
 * parce qu'ils ne vérifiaient que la présence des deux rois :
 *
 * - des finales « gagnées » où le matériel restant était insuffisant pour
 *   mater : roi et cavalier contre roi, ou même roi contre roi, deux nulles
 *   automatiques que le texte présentait comme une victoire ;
 * - des positions d'ouverture aux compteurs de coups incohérents avec les
 *   pièces, ou dont le camp au trait était l'autre ;
 * - des droits de roque déclarés sans le roi ou la tour à leur place, que
 *   `parseFEN` retire en silence — ce qui les rend invisibles à tout test
 *   passant par le moteur.
 *
 * Les vérifications lisent donc le FEN brut, pas la position déjà « réparée ».
 */
import { LESSONS, PUZZLES } from '../content';
import { EXERCISES } from '../exercises';
import {
  findMove,
  inCheck,
  insufficientMaterial,
  legalMoves,
  makeMove,
  parseFEN,
  squareFromName as at,
  type Piece,
  type Position,
} from '../engine';

interface Source {
  id: string;
  fen: string;
  /** Tous les textes qui décrivent la position à l'élève. */
  texte: string;
  /** Vrai pour les leçons : elles peuvent montrer une pièce seule pour expliquer sa marche. */
  lecon: boolean;
  /** Coups dont le résultat doit lui aussi tenir : le coup de la tâche, de la solution. */
  coups: string[];
}

const sources: Source[] = [
  ...LESSONS.flatMap((l) =>
    l.steps.map((s, i) => ({
      id: `leçon ${l.id}, étape ${i}`,
      fen: s.fen,
      texte: s.say,
      lecon: true,
      coups: s.task ? [`${s.task.from}${s.task.to}${s.task.promotion?.toLowerCase() ?? ''}`] : [],
    })),
  ),
  ...PUZZLES.map((p) => ({
    id: `problème ${p.id}`,
    fen: p.fen,
    texte: `${p.hint} ${p.desc}`,
    lecon: false,
    coups: [] as string[],
  })),
  ...EXERCISES.map((e) => ({
    id: `exercice ${e.id}`,
    fen: e.fen,
    texte: [e.consigne, ...e.indices.map((h) => h.texte), e.explication].join(' '),
    lecon: false,
    coups: e.attendus,
  })),
];

/** Le texte promet-il une victoire, un mat, un gain ? */
const PARLE_DE_GAGNER =
  /(^|[^a-zà-ÿ])(gagn[a-zà-ÿ]*|mat|mate|mater|matez|victoire|décisi[a-zà-ÿ]*)([^a-zà-ÿ]|$)/i;

const comptePieces = (pos: Position, camp: 'w' | 'b'): number =>
  pos.board.filter((p) => p && (p === p.toUpperCase()) === (camp === 'w')).length;

describe('toute position du contenu est une position d’échecs', () => {
  test('le contenu est bien couvert', () => {
    expect(sources.length).toBeGreaterThan(80);
  });

  test.each(sources.map((s) => [s.id, s] as const))('%s : deux rois, personne en échec hors trait', (_id, s) => {
    const pos = parseFEN(s.fen); // refuse déjà un roi manquant ou en double
    // le camp qui n'a pas le trait ne peut pas être en échec
    expect(inCheck(pos, pos.turn === 'w' ? 'b' : 'w')).toBe(false);
    // et la position ne doit pas décrire plus de matériel qu'une partie n'en a
    (['w', 'b'] as const).forEach((camp) => {
      expect(comptePieces(pos, camp)).toBeLessThanOrEqual(16);
      const pions = pos.board.filter((p) => p === (camp === 'w' ? 'P' : 'p')).length;
      expect(pions).toBeLessThanOrEqual(8);
    });
  });

  test.each(sources.map((s) => [s.id, s] as const))('%s : droits de roque cohérents avec le placement', (_id, s) => {
    const droits = s.fen.trim().split(/\s+/)[2] ?? '-';
    const pos = parseFEN(s.fen);
    const enPlace = (nom: string, piece: Piece) => pos.board[at(nom)] === piece;
    const exiges: Record<string, [string, Piece, string, Piece]> = {
      K: ['e1', 'K', 'h1', 'R'],
      Q: ['e1', 'K', 'a1', 'R'],
      k: ['e8', 'k', 'h8', 'r'],
      q: ['e8', 'k', 'a8', 'r'],
    };
    if (droits === '-') return;
    [...droits].forEach((d) => {
      const [caseRoi, roi, caseTour, tour] = exiges[d];
      // un droit sans son roi ou sa tour serait retiré par le moteur sans un mot
      expect(`${d} : ${enPlace(caseRoi, roi) && enPlace(caseTour, tour)}`).toBe(`${d} : true`);
    });
  });

  test.each(sources.map((s) => [s.id, s] as const))('%s : jamais de matériel insuffisant là où on parle de gagner', (_id, s) => {
    const pos = parseFEN(s.fen);
    if (!s.lecon) {
      // un problème ou un exercice ne part jamais d'une nulle automatique
      expect(insufficientMaterial(pos)).toBe(false);
    } else if (PARLE_DE_GAGNER.test(s.texte)) {
      // une leçon peut montrer un roi seul pour expliquer sa marche, pas pour
      // annoncer un gain
      expect(insufficientMaterial(pos)).toBe(false);
    }
    // et le coup demandé ne doit pas *aboutir* à une nulle automatique quand
    // le texte promet une victoire : c'était le défaut de la fourchette
    s.coups.forEach((uci) => {
      const coup = findMove(
        pos,
        at(uci.slice(0, 2)),
        at(uci.slice(2, 4)),
        uci.length > 4 ? (uci[4].toUpperCase() as 'Q') : undefined,
      );
      if (!coup) return;
      if (s.lecon && !PARLE_DE_GAGNER.test(s.texte)) return;
      const apres = makeMove(pos, coup);
      // un mat termine la partie : la règle du matériel ne s'y applique pas
      if (legalMoves(apres).length === 0) return;
      expect(`${uci} : ${insufficientMaterial(apres)}`).toBe(`${uci} : false`);
    });
  });
});

describe('la fin d’un problème n’est jamais une nulle automatique', () => {
  // `fourch-tour` gagnait une tour pour finir avec cavalier contre roi ;
  // `fourch-roi` et `skewer-fou` finissaient roi contre roi : trois
  // « victoires » que le règlement déclare nulles sur-le-champ.
  test.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, puzzle) => {
    let pos = parseFEN(puzzle.fen);
    puzzle.line.forEach(([de, vers, promotion]) => {
      pos = makeMove(pos, findMove(pos, at(de), at(vers), promotion)!);
    });
    if (legalMoves(pos).length === 0) return; // mat : la partie est finie, et gagnée
    expect(insufficientMaterial(pos)).toBe(false);
  });
});

/**
 * Le décompte des coups.
 *
 * Une position d'ouverture porte son numéro de coup et son trait. Les
 * pièces qu'on y voit doivent avoir pu y arriver *dans ce nombre de coups* :
 * les blancs au trait au coup 4 ont joué trois coups, et les noirs aussi.
 * L'ancienne position du roque — trois coups blancs, deux coups noirs, blancs
 * au trait — décrivait donc une partie où les noirs avaient passé un tour.
 *
 * On calcule un minimum de coups par camp : chaque pion avancé compte pour ses
 * pas (le double pas n'en vaut qu'un), chaque pièce hors de sa case de départ
 * pour un coup, le roque pour un seul coup à deux pièces. Dans une position
 * d'ouverture — presque toutes les pièces encore là — ce minimum doit être
 * exactement le nombre de coups joués.
 */
const DEPART: Record<string, string[]> = {
  N: ['b1', 'g1'],
  B: ['c1', 'f1'],
  R: ['a1', 'h1'],
  Q: ['d1'],
  K: ['e1'],
};

function coupsMinimaux(pos: Position, camp: 'w' | 'b'): number {
  const rangeeDepart = camp === 'w' ? 0 : 7;
  let total = 0;
  pos.board.forEach((piece, s) => {
    if (!piece || (piece === piece.toUpperCase()) !== (camp === 'w')) return;
    const type = piece.toUpperCase();
    const rang = Math.floor(s / 8);
    if (type === 'P') {
      const pas = camp === 'w' ? rang - 1 : 6 - rang;
      total += pas === 2 ? 1 : pas;
      return;
    }
    const departs = DEPART[type].map((n) => at(camp === 'w' ? n : n[0] + (9 - Number(n[1]))));
    if (!departs.includes(s)) total += 1;
  });
  // le roque déplace deux pièces en un seul coup
  const roi = pos.board.indexOf(camp === 'w' ? 'K' : 'k');
  const tourDe = (f: number) => pos.board[rangeeDepart * 8 + f] === (camp === 'w' ? 'R' : 'r');
  const aRoque =
    (roi === rangeeDepart * 8 + 6 && tourDe(5) && !tourDe(7)) ||
    (roi === rangeeDepart * 8 + 2 && tourDe(3) && !tourDe(0));
  return aRoque ? total - 1 : total;
}

describe('les compteurs de coups des positions d’ouverture', () => {
  const ouvertures = sources.filter((s) => {
    const pos = parseFEN(s.fen);
    return pos.fullmove >= 2 && pos.board.filter(Boolean).length >= 28;
  });

  test('il y a bien des positions d’ouverture à vérifier', () => {
    expect(ouvertures.length).toBeGreaterThanOrEqual(8);
  });

  test.each(ouvertures.map((s) => [s.id, s] as const))('%s : le numéro de coup colle aux pièces', (_id, s) => {
    const pos = parseFEN(s.fen);
    const joueBlancs = pos.fullmove - 1 + (pos.turn === 'b' ? 1 : 0);
    const joueNoirs = pos.fullmove - 1;
    expect({ blancs: coupsMinimaux(pos, 'w'), noirs: coupsMinimaux(pos, 'b') }).toEqual({
      blancs: joueBlancs,
      noirs: joueNoirs,
    });
    // et la pendule des 50 coups ne peut pas dépasser les demi-coups joués
    expect(pos.halfmove).toBeLessThanOrEqual(joueBlancs + joueNoirs);
  });
});
