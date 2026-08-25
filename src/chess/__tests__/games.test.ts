import { GAMES } from '../content';
import {
  START_FEN,
  parseFEN,
  findMove,
  makeMove,
  gameStatus,
  legalMoves,
  toSAN,
  squareFromName,
  type Position,
} from '../engine';

/**
 * Les parties historiques sont rejouées coup par coup dans le moteur.
 *
 * C'est le seul moyen de garantir qu'un replay proposé à l'utilisateur est
 * réellement jouable : un seul coup illégal et l'écran devient un cul-de-sac.
 * On vérifie aussi le coup final, pour empêcher qu'une partie soit tronquée
 * sans que personne ne s'en aperçoive — c'était le cas de la Partie du siècle,
 * qui s'arrêtait juste avant le sacrifice de dame qui la rend célèbre.
 */

/** Coup final attendu, en notation française, et statut de la position finale. */
const EXPECTED: Record<string, { san: string; status: string }> = {
  opera: { san: 'Td8#', status: 'mate' },
  immortelle: { san: 'Fe7#', status: 'mate' },
  siecle: { san: 'Tc2#', status: 'mate' },
};

/** Résout un couple de cases en coup légal, en promouvant en dame par défaut. */
const pick = (pos: Position, from: string, to: string) => {
  const a = squareFromName(from);
  const b = squareFromName(to);
  return findMove(pos, a, b, 'Q') ?? findMove(pos, a, b);
};

/** Rejoue toute la partie et rend la position finale avec son dernier coup. */
const replay = (id: string) => {
  const game = GAMES.find((g) => g.id === id)!;
  let pos = parseFEN(START_FEN);
  let lastSan = '';
  game.coups.forEach(([from, to], i) => {
    const move = pick(pos, from, to);
    if (!move) {
      throw new Error(`coup ${i + 1} (${from}${to}) illégal dans ${id} — trait aux ${pos.turn}`);
    }
    lastSan = toSAN(pos, move);
    pos = makeMove(pos, move);
  });
  return { pos, lastSan, plies: game.coups.length };
};

describe('parties historiques', () => {
  it('couvre exactement les parties attendues', () => {
    expect(GAMES.map((g) => g.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  GAMES.forEach((game) => {
    describe(game.titre, () => {
      it('enchaîne uniquement des coups légaux', () => {
        expect(() => replay(game.id)).not.toThrow();
      });

      it('se termine sur le coup et le statut annoncés', () => {
        const { pos, lastSan } = replay(game.id);
        const want = EXPECTED[game.id];
        expect(lastSan).toBe(want.san);
        expect(gameStatus(pos)).toBe(want.status);
      });
    });
  });

  /**
   * Vérification demandée explicitement : la position finale de la partie de
   * l'Opéra est un mat légal, et non un coup que l'interface refuserait ou un
   * état où le roi noir pourrait capturer la tour de d8.
   */
  it("mat de l'Opéra : le roi noir n'a aucune réponse", () => {
    const { pos } = replay('opera');
    expect(gameStatus(pos)).toBe('mate');
    expect(pos.turn).toBe('b');
    // aucun coup légal, y compris aucune capture de la tour de d8
    expect(legalMoves(pos)).toHaveLength(0);
  });
});
