// AsyncStorage repose sur un module natif : on utilise le mock fourni par la librairie
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { LESSONS, PUZZLES } from '../content';
import {
  addXP,
  completeLesson,
  completerFinale,
  POINTS_FINALE,
  earnedTrophies,
  emptyProgress,
  failPuzzle,
  finishGame,
  finishSprint,
  levelOf,
  markGameSeen,
  normalize,
  puzzleReward,
  solvePuzzle,
  withTrophies,
  XP_PER_LEVEL,
  type Progress,
} from '../progress';
import { updateElo } from '../ai';

const seed = (patch: Partial<Progress> = {}): Progress => ({ ...emptyProgress(), ...patch });

describe('niveaux', () => {
  it('démarre au niveau 1 et monte tous les paliers', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(XP_PER_LEVEL - 1)).toBe(1);
    expect(levelOf(XP_PER_LEVEL)).toBe(2);
    expect(levelOf(XP_PER_LEVEL * 4)).toBe(5);
  });
});

describe('leçons', () => {
  it('accorde les points une seule fois', () => {
    const first = completeLesson(emptyProgress(), 'pion');
    expect(first.progress.xp).toBe(25);
    const again = completeLesson(first.progress, 'pion');
    expect(again.progress.xp).toBe(25);
    expect(again.progress.lessons.pion).toBe(true);
  });

  it('débloque « Premier pas » dès la première leçon', () => {
    const { unlocked } = completeLesson(emptyProgress(), 'pion');
    expect(unlocked).toContain('first');
  });

  it('débloque « Pièces en main » une fois les six déplacements appris', () => {
    let p = emptyProgress();
    for (const id of ['pion', 'tour', 'fou', 'cavalier', 'dame']) {
      p = completeLesson(p, id).progress;
    }
    expect(earnedTrophies(p)).not.toContain('movers');
    const last = completeLesson(p, 'roi');
    expect(last.unlocked).toContain('movers');
  });

  it('débloque « Érudit » quand toutes les leçons sont finies', () => {
    let p = emptyProgress();
    LESSONS.forEach((l) => {
      p = completeLesson(p, l.id).progress;
    });
    expect(p.trophies.scholar).toBe(true);
  });
});

describe('problèmes', () => {
  it('récompense davantage une résolution rapide et sans aide', () => {
    const clean = puzzleReward(1000, 3, false, false);
    const slow = puzzleReward(1000, 60, false, false);
    const hinted = puzzleReward(1000, 3, false, true);
    expect(clean).toBeGreaterThan(slow);
    expect(clean).toBeGreaterThan(hinted);
    expect(puzzleReward(1000, 999, true, true)).toBeGreaterThanOrEqual(5);
  });

  it('récompense moins une deuxième résolution du même problème', () => {
    const id = PUZZLES[0].id;
    const first = solvePuzzle(emptyProgress(), id, { seconds: 5, failed: false, hinted: false });
    const second = solvePuzzle(first.progress, id, { seconds: 5, failed: false, hinted: false });
    expect(second.progress.xp - first.progress.xp).toBeLessThan(first.progress.xp);
  });

  it('fait progresser la série, et la remet à zéro sur une erreur', () => {
    let p = emptyProgress();
    for (const puzzle of PUZZLES.slice(0, 3)) {
      p = solvePuzzle(p, puzzle.id, { seconds: 4, failed: false, hinted: false }).progress;
    }
    expect(p.streak).toBe(3);
    expect(p.bestStreak).toBe(3);
    expect(p.trophies.clean3).toBe(true);

    p = failPuzzle(p);
    expect(p.streak).toBe(0);
    // le record, lui, est conservé
    expect(p.bestStreak).toBe(3);
  });

  it('débloque « Collection » quand tous les problèmes sont résolus', () => {
    let p = emptyProgress();
    PUZZLES.forEach((puzzle) => {
      p = solvePuzzle(p, puzzle.id, { seconds: 10, failed: false, hinted: false }).progress;
    });
    expect(p.trophies.allpuz).toBe(true);
  });
});

describe('parties', () => {
  it('enregistre le résultat, les points et l’écart de classement', () => {
    const start = seed({ elo: 800 });
    const newElo = updateElo(800, 900, 1);
    const { progress } = finishGame(start, 'Marguerite', 'win', newElo);
    expect(progress.wins).toBe(1);
    expect(progress.xp).toBe(50);
    expect(progress.elo).toBe(newElo);
    expect(progress.history[0]).toEqual({
      bot: 'Marguerite',
      result: 'win',
      eloDelta: newElo - 800,
    });
  });

  it('ne donne pas de points pour une défaite', () => {
    const { progress } = finishGame(seed(), 'Athéna', 'loss', 780);
    expect(progress.xp).toBe(0);
    expect(progress.losses).toBe(1);
  });

  it('ne conserve que les vingt dernières parties', () => {
    let p = emptyProgress();
    for (let i = 0; i < 25; i += 1) {
      p = finishGame(p, `Bot${i}`, 'draw', p.elo).progress;
    }
    expect(p.history).toHaveLength(20);
    expect(p.history[19].bot).toBe('Bot24');
  });

  it('débloque « Échec et mat » à la première victoire', () => {
    const { unlocked } = finishGame(emptyProgress(), 'Pixou', 'win', 820);
    expect(unlocked).toContain('winai');
  });
});

describe('classement Elo', () => {
  it('rapporte plus contre un adversaire plus fort', () => {
    const vsStrong = updateElo(800, 1600, 1) - 800;
    const vsWeak = updateElo(800, 400, 1) - 800;
    expect(vsStrong).toBeGreaterThan(vsWeak);
  });

  it('baisse après une défaite mais ne descend jamais sous 100', () => {
    expect(updateElo(800, 800, 0)).toBeLessThan(800);
    expect(updateElo(100, 2500, 0)).toBeGreaterThanOrEqual(100);
  });

  it('bouge à peine sur une nulle entre joueurs de même force', () => {
    expect(Math.abs(updateElo(1000, 1000, 0.5) - 1000)).toBeLessThanOrEqual(1);
  });
});

describe('sprint et parties célèbres', () => {
  it('garde le meilleur score et récompense chaque problème', () => {
    const first = finishSprint(emptyProgress(), 7);
    expect(first.progress.sprintBest).toBe(7);
    expect(first.progress.xp).toBe(56);
    const worse = finishSprint(first.progress, 3);
    expect(worse.progress.sprintBest).toBe(7);
    const better = finishSprint(worse.progress, 12);
    expect(better.progress.sprintBest).toBe(12);
    expect(better.unlocked).toContain('sprint10');
  });

  it('débloque « Curieux » après une partie célèbre rejouée', () => {
    expect(markGameSeen(emptyProgress(), 'opera').unlocked).toContain('curious');
  });
});

describe('trophées', () => {
  it('ne se débloquent qu’une fois', () => {
    const once = addXP(seed({ xp: XP_PER_LEVEL * 4 }), 0);
    expect(once.unlocked).toContain('lvl5');
    const twice = withTrophies(once.progress);
    expect(twice.unlocked).toHaveLength(0);
  });

  it('ne renvoient jamais d’identifiant inconnu', () => {
    const everything = seed({
      xp: 10000,
      elo: 2000,
      wins: 5,
      bestStreak: 10,
      sprintBest: 20,
      lessons: Object.fromEntries(LESSONS.map((l) => [l.id, true])),
      puzzles: Object.fromEntries(PUZZLES.map((p) => [p.id, true])),
      seenGames: { opera: true },
    });
    expect(earnedTrophies(everything).length).toBeGreaterThan(0);
  });
});

describe('lecture d’un état sauvegardé', () => {
  it('complète les champs manquants d’une ancienne sauvegarde', () => {
    const restored = normalize({ xp: 120, settings: { sound: false } });
    expect(restored.xp).toBe(120);
    expect(restored.elo).toBe(800);
    expect(restored.settings).toEqual({ sound: false, vibration: true, coords: true, board: 'foret' });
    expect(restored.history).toEqual([]);
  });

  it('résiste à des données absentes ou corrompues', () => {
    expect(normalize(null).xp).toBe(0);
    expect(normalize('nawak').elo).toBe(800);
    expect(normalize({ history: 'pas un tableau' }).history).toEqual([]);
  });
});

describe('normalisation d’une sauvegarde existante', () => {
  /**
   * Régression : une sauvegarde antérieure aux exercices ne portait pas le
   * champ `exercises`. Sans valeur de repli, la lecture rendait `undefined` et
   * le premier accès plantait — l'élève aurait perdu toute sa progression.
   */
  it('complète les champs absents sans effacer les autres', () => {
    const ancienne = {
      xp: 340,
      elo: 912,
      lessons: { roque: true },
      puzzles: { 'dame-roi': true },
    };
    const p = normalize(ancienne);
    expect(p.xp).toBe(340);
    expect(p.elo).toBe(912);
    expect(p.lessons).toEqual({ roque: true });
    expect(p.puzzles).toEqual({ 'dame-roi': true });
    expect(p.exercises).toEqual({});
    expect(p.settings.board).toBe('foret');
  });

  it('rend une progression vide sur une sauvegarde illisible', () => {
    expect(normalize(null).xp).toBe(0);
    expect(normalize('n’importe quoi').xp).toBe(0);
    expect(normalize(undefined).exercises).toEqual({});
  });
});

describe('série de jours et objectifs du jour', () => {
  const {
    BONUS_DU_JOUR,
    CIBLES_DU_JOUR,
    enregistrerActivite,
    objectifsAffiches,
    serieVivante,
    veille,
  } = jest.requireActual('../progress') as typeof import('../progress');

  test('la veille tient compte des fins de mois et d’année, bissextiles comprises', () => {
    expect(veille('2026-09-28')).toBe('2026-09-27');
    expect(veille('2026-10-01')).toBe('2026-09-30');
    expect(veille('2027-01-01')).toBe('2026-12-31');
    expect(veille('2028-03-01')).toBe('2028-02-29');
    expect(veille('2027-03-01')).toBe('2027-02-28');
  });

  test('la première activité ouvre une série d’un jour', () => {
    const { progress } = enregistrerActivite(emptyProgress(), 'lecon', '2026-09-28');
    expect(progress.serieJours).toEqual({ dernier: '2026-09-28', courante: 1, meilleure: 1 });
  });

  test('plusieurs activités le même jour ne prolongent pas la série', () => {
    let p = enregistrerActivite(emptyProgress(), 'lecon', '2026-09-28').progress;
    p = enregistrerActivite(p, 'probleme', '2026-09-28').progress;
    expect(p.serieJours.courante).toBe(1);
  });

  test('un jour de plus prolonge la série, un jour manqué la remet à un', () => {
    let p = enregistrerActivite(emptyProgress(), 'lecon', '2026-09-26').progress;
    p = enregistrerActivite(p, 'lecon', '2026-09-27').progress;
    p = enregistrerActivite(p, 'lecon', '2026-09-28').progress;
    expect(p.serieJours).toMatchObject({ courante: 3, meilleure: 3 });
    p = enregistrerActivite(p, 'lecon', '2026-09-30').progress; // le 29 est manqué
    expect(p.serieJours).toMatchObject({ courante: 1, meilleure: 3 });
  });

  test('les compteurs du jour repartent à zéro le lendemain', () => {
    let p = enregistrerActivite(emptyProgress(), 'probleme', '2026-09-28').progress;
    p = enregistrerActivite(p, 'probleme', '2026-09-28').progress;
    expect(objectifsAffiches(p, '2026-09-28').problemes).toBe(2);
    expect(objectifsAffiches(p, '2026-09-29').problemes).toBe(0);
    p = enregistrerActivite(p, 'probleme', '2026-09-29').progress;
    expect(p.objectifs).toMatchObject({ jour: '2026-09-29', problemes: 1 });
  });

  test('le bonus est versé une seule fois, quand les trois cibles sont atteintes', () => {
    const jour = '2026-09-28';
    let p = emptyProgress();
    const xp0 = p.xp;
    for (let i = 0; i < CIBLES_DU_JOUR.problemes; i += 1) p = enregistrerActivite(p, 'probleme', jour).progress;
    p = enregistrerActivite(p, 'lecon', jour).progress;
    expect(p.xp).toBe(xp0); // il manque la partie
    expect(p.objectifs.bonus).toBe(false);
    p = enregistrerActivite(p, 'partie', jour).progress;
    expect(p.xp).toBe(xp0 + BONUS_DU_JOUR);
    expect(p.objectifs.bonus).toBe(true);
    // une activité de plus ne le reverse pas
    p = enregistrerActivite(p, 'probleme', jour).progress;
    expect(p.xp).toBe(xp0 + BONUS_DU_JOUR);
  });

  test('la série s’éteint si ni aujourd’hui ni hier n’ont eu d’activité', () => {
    const p = enregistrerActivite(emptyProgress(), 'lecon', '2026-09-28').progress;
    expect(serieVivante(p, '2026-09-28')).toBe(1);
    expect(serieVivante(p, '2026-09-29')).toBe(1); // hier : encore vivante, on peut la prolonger
    expect(serieVivante(p, '2026-09-30')).toBe(0);
  });

  test('les actions existantes alimentent bien les objectifs', () => {
    let p = completeLesson(emptyProgress(), 'pion', '2026-09-28').progress;
    expect(p.objectifs.lecons).toBe(1);
    p = solvePuzzle(p, PUZZLES[0].id, { seconds: 10, failed: false, hinted: false }, '2026-09-28').progress;
    expect(p.objectifs.problemes).toBe(1);
    p = finishGame(p, 'Pixou', 'win', 820, '2026-09-28').progress;
    expect(p.objectifs.parties).toBe(1);
    expect(p.serieJours.courante).toBe(1);
  });

  test('normalize refuse des données de série absurdes', () => {
    const n = normalize({
      serieJours: { dernier: 'hier', courante: -3, meilleure: 'beaucoup' },
      objectifs: { jour: 12, lecons: '5', problemes: -1, parties: 2.6, bonus: 'oui' },
    });
    expect(n.serieJours).toEqual({ dernier: null, courante: 0, meilleure: 0 });
    expect(n.objectifs).toEqual({ jour: null, lecons: 0, problemes: 0, parties: 3, bonus: false });
  });
});

describe('finales', () => {
  test('une finale rapporte ses points une seule fois', () => {
    const a = completerFinale(emptyProgress(), 'mat-dame', '2026-09-28').progress;
    expect(a.finales['mat-dame']).toBe(true);
    expect(a.xp).toBe(POINTS_FINALE);
    const b = completerFinale(a, 'mat-dame', '2026-09-28').progress;
    expect(b.xp).toBe(POINTS_FINALE);
  });

  test('une finale compte dans la série du jour', () => {
    const a = completerFinale(emptyProgress(), 'mat-tour', '2026-09-28').progress;
    expect(a.serieJours.courante).toBe(1);
  });

  test('normalize garde les finales valides et écarte le reste', () => {
    const n = normalize({ finales: { 'mat-dame': true, 'x': 'oui' } });
    expect(n.finales['mat-dame']).toBe(true);
    expect(n.finales.x).toBeFalsy();
    expect(normalize({ finales: 12 }).finales).toEqual({});
  });
});
