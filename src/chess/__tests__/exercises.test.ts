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

/**
 * Exercices que le minimax à trois demi-coups ne peut pas juger, et pourquoi.
 *
 * Les tests « meilleur coup » ci-dessous mesurent l'exercice avec l'évaluateur
 * de l'application. Il ne voit ni une finale qui se joue sur dix coups (la
 * règle du carré, la case clé, la défense Philidor), ni ce que la règle
 * interdit (le roque en échec ne se juge pas à la valeur d'un coup). Ces
 * exercices sont vérifiés à la place par `preuves-exercices.test.ts` —
 * Stockfish, et un solveur exact des finales de pions — qui exige pour chacun
 * une preuve.
 */
const HORS_HORIZON = new Map<string, string>([
  ['fi-regle-du-carre', 'finale de pion : la course se joue sur six demi-coups'],
  ['fi-case-cle', 'finale de pion : gagné ou nulle, sans différence de matériel'],
  ['fi-philidor', 'finale de tours : la nulle se tient sur vingt coups'],
  ['sr-roque-permis', 'exercice de règle : la réponse vient du règlement, pas d’une valeur'],
]);

/**
 * Coups que le minimax à trois demi-coups juge aussi bons que le meilleur alors
 * que Stockfish les juge perdants : sa portée s'arrête avant la sanction.
 * Chacun est exclu de la liste des « coups aussi bons » ci-dessous, et le
 * dernier test de ce fichier vérifie que Stockfish les condamne bien.
 */
const ANGLES_MORTS = new Map<string, Record<string, string>>([
  [
    'pp-sauve-la-tour',
    { a1a5: '…Fc3+ fourche le roi et la tour : la sanction arrive au quatrième demi-coup' },
  ],
]);

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

  it('ne range aucun exercice dans un thème inconnu', () => {
    const themes = new Set(THEMES.map((t) => t.id));
    EXERCISES.forEach((e) => expect(themes.has(e.theme)).toBe(true));
  });

  it('couvre les mats de base, les finales et la sécurité du roi ajoutés à l’audit', () => {
    // dix positions que l'audit jugeait absentes : roi avant la dame, tour et roi,
    // règle du carré, case clé, Lucena, Philidor, conditions du roque, mat du
    // couloir en deux, mat du berger (à donner comme à parer), coup simple d'abord
    const ids = EXERCISES.map((e) => e.id);
    [
      'mb-roi-avant-dame',
      'mb-tour-et-roi',
      'fi-regle-du-carre',
      'fi-case-cle',
      'fi-lucena',
      'fi-philidor',
      'sr-roque-permis',
      'mb-couloir-en-deux',
      'sr-berger-attaque',
      'sr-berger-defense',
      'mb-simple-dabord',
    ].forEach((id) => expect(ids).toContain(id));
  });

  it('a donné à chaque exercice hors horizon une raison écrite', () => {
    HORS_HORIZON.forEach((raison, id) => {
      expect(EXERCISES.some((e) => e.id === id)).toBe(true);
      expect(raison.length).toBeGreaterThan(10);
    });
  });

  it('écrit ses coups en notation française : aucune notation anglaise dans les textes', () => {
    // N, B, Q, K, R pour cavalier, fou, dame, roi, tour : la leçon d'introduction
    // enseigne C, F, D, R, T
    EXERCISES.forEach((e) => {
      const textes = [e.consigne, e.explication, ...e.indices.map((h) => h.texte)].join(' ');
      expect(`${e.id}: ${/\b[NBQ][a-h][1-8]\b/.test(textes)}`).toBe(`${e.id}: false`);
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

      if (HORS_HORIZON.has(ex.id)) {
        it(`est jugé par les preuves, non par le minimax (${HORS_HORIZON.get(ex.id)})`, () => {
          // la preuve existe et décrit exactement cette position
          const fichier = require('./donnees/preuves-stockfish.json') as {
            positions: Record<string, { coups: Record<string, unknown> }>;
          };
          const preuve = fichier.positions[ex.fen];
          expect(preuve).toBeDefined();
          expect(Object.keys(preuve.coups).sort()).toEqual(legalMoves(pos).map(toUci).sort());
        });
      } else {
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
          const angles = Object.keys(ANGLES_MORTS.get(ex.id) ?? {});
          const aussiBons = legalMoves(pos)
            .filter((m) => meilleur - moveValue(pos, m, DEPTH) <= 5)
            .map(toUci)
            .filter((uci) => !angles.includes(uci));
          // un coup pratiquement équivalent au meilleur ne doit jamais être
          // traité comme une faute : soit il répond à la consigne, soit il est
          // listé comme toléré et l'élève lira « bon coup, mais pas la question »
          const connus = [...ex.attendus, ...(ex.toleres ?? [])];
          aussiBons.forEach((uci) => expect(connus).toContain(uci));
        });
      }

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

  it('ne classe comme « aussi bon » aucun coup que Stockfish condamne', () => {
    // les angles morts du minimax sont des fautes, pas des coups équivalents
    const fichier = require('./donnees/preuves-stockfish.json') as {
      positions: Record<string, { coups: Record<string, { cp?: number; mat?: number }> }>;
    };
    ANGLES_MORTS.forEach((coups, id) => {
      const ex = EXERCISES.find((e) => e.id === id)!;
      const table = fichier.positions[ex.fen].coups;
      const v = (u: string) => table[u].cp ?? (table[u].mat! > 0 ? 100000 : -100000);
      const meilleur = Math.max(...Object.keys(table).map(v));
      Object.keys(coups).forEach((u) => {
        expect(meilleur - v(u)).toBeGreaterThanOrEqual(300);
        expect([...ex.attendus, ...(ex.toleres ?? [])]).not.toContain(u);
      });
    });
  });
});
