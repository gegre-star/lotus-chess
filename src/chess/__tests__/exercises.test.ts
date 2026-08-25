import { EXERCISES, THEMES, exercisesByTheme, type Exercise } from '../exercises';
import { bestValue, moveValue } from '../ai';
import { toUci } from '../../analysis/local';
import {
  findMove,
  inCheck,
  legalMoves,
  parseFEN,
  squareFromName as at,
  type Position,
} from '../engine';

const DEPTH = 3;
/**
 * Écart toléré au meilleur coup, en centièmes de pion.
 *
 * Un pion entier : assez serré pour rejeter une vraie bévue, assez large pour
 * absorber le bruit d'une recherche à trois demi-coups. À cette profondeur le
 * minimax préfère par exemple Cc3 à d4 dans la Philidor, alors que d4 est le
 * coup de manuel — la nuance dépasse ce qu'il sait juger.
 */
const TOLERANCE = 100;

const uciToMove = (pos: Position, uci: string) => {
  const promo = uci.length > 4 ? (uci[4].toUpperCase() as 'Q' | 'R' | 'B' | 'N') : undefined;
  return findMove(pos, at(uci.slice(0, 2)), at(uci.slice(2, 4)), promo);
};

describe('exercices', () => {
  it('ne contient pas deux fois le même identifiant', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('couvre chaque thème annoncé', () => {
    THEMES.forEach((t) => {
      expect(exercisesByTheme(t.id).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('classe les exercices d’un thème par niveau croissant', () => {
    THEMES.forEach((t) => {
      const niveaux = exercisesByTheme(t.id).map((e) => e.niveau);
      expect([...niveaux].sort((a, b) => a - b)).toEqual(niveaux);
    });
  });

  EXERCISES.forEach((ex: Exercise) => {
    describe(`${ex.id} — ${ex.consigne}`, () => {
      const pos = parseFEN(ex.fen);

      it('part d’une position légale', () => {
        expect(pos.board.filter((p) => p === 'K')).toHaveLength(1);
        expect(pos.board.filter((p) => p === 'k')).toHaveLength(1);
        // le camp qui n'a pas le trait ne peut pas être en échec
        expect(inCheck(pos, pos.turn === 'w' ? 'b' : 'w')).toBe(false);
        expect(legalMoves(pos).length).toBeGreaterThan(0);
      });

      it('propose des coups attendus tous jouables', () => {
        expect(ex.attendus.length).toBeGreaterThan(0);
        ex.attendus.forEach((uci) => {
          expect(uciToMove(pos, uci)).toBeDefined();
        });
      });

      it('n’accepte que des coups réellement parmi les meilleurs', () => {
        const meilleur = bestValue(pos, DEPTH);
        ex.attendus.forEach((uci) => {
          const move = uciToMove(pos, uci)!;
          const valeur = moveValue(pos, move, DEPTH);
          expect({ uci, ecart: Math.round(meilleur - valeur) }).toEqual({
            uci,
            ecart: expect.any(Number),
          });
          expect(meilleur - valeur).toBeLessThanOrEqual(TOLERANCE);
        });
      });

      it('reconnaît tout coup aussi bon que le meilleur', () => {
        const meilleur = bestValue(pos, DEPTH);
        const aussiBons = legalMoves(pos)
          .filter((m) => meilleur - moveValue(pos, m, DEPTH) <= 5)
          .map(toUci);
        // un coup pratiquement équivalent au meilleur ne doit jamais être
        // traité comme une faute : soit il répond à la consigne, soit il est
        // listé comme toléré et l'élève lira « bon coup, mais pas la question »
        const connus = [...ex.attendus, ...(ex.toleres ?? [])];
        aussiBons.forEach((uci) => expect(connus).toContain(uci));
      });

      it('distingue vraiment une bonne réponse d’une mauvaise', () => {
        // un exercice que tous les coups résolvent n'apprend rien
        const connus = [...ex.attendus, ...(ex.toleres ?? [])];
        const refuses = legalMoves(pos)
          .map(toUci)
          .filter((uci) => !connus.includes(uci));
        expect(refuses.length).toBeGreaterThan(0);
      });

      it('ne tolère que des coups jouables et distincts des attendus', () => {
        (ex.toleres ?? []).forEach((uci) => {
          expect(uciToMove(pos, uci)).toBeDefined();
          expect(ex.attendus).not.toContain(uci);
        });
      });

      it('fournit trois indices dont le dernier donne la solution', () => {
        expect(ex.indices).toHaveLength(3);
        ex.indices.forEach((h) => expect(h.texte.length).toBeGreaterThan(10));
        expect(ex.indices[2].solution).toBe(true);
        expect(ex.indices[0].solution).toBeUndefined();
        expect(ex.indices[1].solution).toBeUndefined();
      });

      it('surligne des cases qui existent', () => {
        ex.indices.forEach((h) =>
          (h.cases ?? []).forEach((c) => {
            expect(at(c)).toBeGreaterThanOrEqual(0);
            expect(at(c)).toBeLessThan(64);
          }),
        );
      });

      it('donne une consigne courte et une explication', () => {
        expect(ex.consigne.length).toBeLessThanOrEqual(80);
        expect(ex.explication.length).toBeGreaterThan(30);
      });
    });
  });
});
