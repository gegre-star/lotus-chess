import { GAMES } from '../content';
import {
  START_FEN,
  parseFEN,
  findMove,
  makeMove,
  gameStatus,
  toSAN,
  squareFromName,
} from '../engine';

/**
 * Les parties historiques sont rejouées coup par coup dans le moteur. C'est le
 * seul moyen de garantir qu'un replay proposé à l'utilisateur est réellement
 * jouable : un seul coup illégal et l'écran devient un cul-de-sac.
 */
/** Résout un couple de cases en coup légal, en promouvant en dame par défaut. */
const pick = (pos: Parameters<typeof gameStatus>[0], from: string, to: string) => {
  const a = squareFromName(from);
  const b = squareFromName(to);
  return findMove(pos, a, b, 'Q') ?? findMove(pos, a, b);
};

describe('parties historiques', () => {
  GAMES.forEach((game) => {
    describe(game.titre, () => {
      it('enchaîne uniquement des coups légaux', () => {
        let pos = parseFEN(START_FEN);
        game.coups.forEach(([from, to], i) => {
          const move = pick(pos, from, to);
          if (!move) {
            throw new Error(
              `coup ${i + 1} (${from}${to}) illégal dans ${game.id} — position ${pos.turn}`,
            );
          }
          pos = makeMove(pos, move);
        });
      });

      it('se termine sur le statut annoncé', () => {
        let pos = parseFEN(START_FEN);
        let lastSan = '';
        game.coups.forEach(([from, to]) => {
          const move = pick(pos, from, to)!;
          lastSan = toSAN(pos, move);
          pos = makeMove(pos, move);
        });
        // eslint-disable-next-line no-console
        console.log(`${game.id}: dernier coup ${lastSan}, statut ${gameStatus(pos)}`);
      });
    });
  });
});
