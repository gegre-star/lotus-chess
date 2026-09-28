// AsyncStorage repose sur un module natif : on utilise le mock fourni par la librairie
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * Le sprint : sans logique testée, le trophée « Sprinteur » — qui n'avait
 * aucun écran pour être gagné — resterait aussi inaccessible qu'avant.
 */
import { PUZZLES } from '../content';
import { finishSprint, emptyProgress } from '../progress';
import {
  DUREE_SPRINT_MS,
  PENALITE_MS,
  demarrerSprint,
  estTermine,
  melanger,
  problemeCourant,
  problemesDeSprint,
  rater,
  reussir,
  tempsRestant,
} from '../sprint';

const graine = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

describe('problèmes de sprint', () => {
  test('seuls les problèmes en un coup y figurent', () => {
    const pool = problemesDeSprint(PUZZLES);
    expect(pool.length).toBeGreaterThanOrEqual(8);
    pool.forEach((p) => expect(p.line).toHaveLength(1));
  });

  test('le mélange garde tous les éléments et dépend du hasard fourni', () => {
    const liste = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = melanger(liste, graine(1));
    const b = melanger(liste, graine(1));
    const c = melanger(liste, graine(2));
    expect([...a].sort()).toEqual(liste);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // et la liste d'origine n'est pas modifiée
    expect(liste).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('déroulement', () => {
  test('trois minutes, un score nul, le premier problème', () => {
    const s = demarrerSprint(PUZZLES, 1_000, graine(3));
    expect(tempsRestant(s, 1_000)).toBe(DUREE_SPRINT_MS);
    expect(s.score).toBe(0);
    expect(problemeCourant(s).line).toHaveLength(1);
  });

  test('réussir donne un point et passe au problème suivant', () => {
    const s = demarrerSprint(PUZZLES, 0, graine(3));
    const suivant = reussir(s);
    expect(suivant.score).toBe(1);
    expect(problemeCourant(suivant)).not.toBe(problemeCourant(s));
  });

  test('rater coûte du temps et laisse sur le même problème', () => {
    const s = demarrerSprint(PUZZLES, 0, graine(3));
    const rate = rater(s);
    expect(rate.erreurs).toBe(1);
    expect(rate.score).toBe(0);
    expect(problemeCourant(rate)).toBe(problemeCourant(s));
    expect(tempsRestant(rate, 0)).toBe(DUREE_SPRINT_MS - PENALITE_MS);
  });

  test('la file boucle quand tous les problèmes ont été vus', () => {
    let s = demarrerSprint(PUZZLES, 0, graine(3));
    const n = s.file.length;
    for (let i = 0; i < n; i += 1) s = reussir(s);
    expect(problemeCourant(s)).toBe(s.file[0]);
    expect(s.score).toBe(n);
  });

  test('le sprint se termine à l’instant dit, et les erreurs l’avancent', () => {
    const s = demarrerSprint(PUZZLES, 0, graine(3));
    expect(estTermine(s, DUREE_SPRINT_MS - 1)).toBe(false);
    expect(estTermine(s, DUREE_SPRINT_MS)).toBe(true);
    const cinq = [1, 2, 3, 4, 5].reduce((acc) => rater(acc), s);
    expect(estTermine(cinq, DUREE_SPRINT_MS - 5 * PENALITE_MS)).toBe(true);
  });

  test('le temps restant ne devient jamais négatif', () => {
    expect(tempsRestant(demarrerSprint(PUZZLES, 0), 10 * DUREE_SPRINT_MS)).toBe(0);
  });
});

describe('le trophée devient atteignable', () => {
  test('dix problèmes dans un sprint débloquent « Sprinteur »', () => {
    const { unlocked, progress } = finishSprint(emptyProgress(), 10);
    expect(unlocked).toContain('sprint10');
    expect(progress.sprintBest).toBe(10);
    expect(progress.xp).toBe(80);
  });

  test('neuf ne suffisent pas', () => {
    expect(finishSprint(emptyProgress(), 9).unlocked).not.toContain('sprint10');
  });
});
