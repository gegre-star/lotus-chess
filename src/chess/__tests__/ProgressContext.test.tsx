jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ProgressProvider, useProgress } from '../ProgressContext';
import {
  STORAGE_KEY,
  completeLesson,
  emptyProgress,
  finishGame,
  loadProgress,
  normalize,
  saveProgress,
} from '../progress';

type Contexte = ReturnType<typeof useProgress>;

/** Monte le vrai fournisseur et donne accès à son contexte courant. */
async function monter(): Promise<{ ctx: () => Contexte; fin: () => void }> {
  let dernier!: Contexte;
  function Sonde() {
    dernier = useProgress();
    return null;
  }
  let arbre!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    arbre = TestRenderer.create(
      <ProgressProvider>
        <Sonde />
      </ProgressProvider>,
    );
  });
  return { ctx: () => dernier, fin: () => arbre.unmount() };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  // le mock d'AsyncStorage garde l'historique des appels d'un test à l'autre
  jest.clearAllMocks();
});

describe('trophées : la célébration s’affiche vraiment', () => {
  test('update rend les trophées débloqués, à chaque appel — pas seulement au premier', async () => {
    const { ctx, fin } = await monter();
    // Avant la correction, seul le tout premier update voyait ses trophées :
    // React différait les suivants, la variable restait vide et update rendait [].
    let premier: string[] = [];
    let deuxieme: string[] = [];
    await act(async () => {
      premier = ctx().update((p) => completeLesson(p, 'pion'));
    });
    expect(premier).toContain('first');
    await act(async () => {
      deuxieme = ctx().update((p) => finishGame(p, 'Pixou', 'win', 820));
    });
    expect(deuxieme).toContain('winai');
    fin();
  });

  test('le trophée débloqué à un update tardif est bien célébré', async () => {
    const { ctx, fin } = await monter();
    await act(async () => {
      ctx().update((p) => completeLesson(p, 'pion'));
    });
    await act(async () => {
      ctx().dismissCelebration();
    });
    expect(ctx().celebrating).toBeNull();
    await act(async () => {
      ctx().update((p) => finishGame(p, 'Pixou', 'win', 820));
    });
    expect(ctx().celebrating?.id).toBe('winai');
    fin();
  });

  test('deux mises à jour de suite ne s’écrasent pas', async () => {
    const { ctx, fin } = await monter();
    await act(async () => {
      ctx().update((p) => ({ progress: { ...p, xp: p.xp + 10 }, unlocked: [] }));
      ctx().update((p) => ({ progress: { ...p, xp: p.xp + 5 }, unlocked: [] }));
    });
    expect(ctx().progress.xp).toBe(15);
    fin();
  });

  test('la progression survit à un rechargement', async () => {
    const a = await monter();
    await act(async () => {
      a.ctx().update((p) => completeLesson(p, 'pion'));
    });
    a.fin();
    const b = await monter();
    expect(b.ctx().progress.lessons.pion).toBe(true);
    expect(b.ctx().progress.xp).toBe(25);
    b.fin();
  });
});

describe('stockage défaillant', () => {
  test('une lecture qui échoue interdit d’écrire par-dessus la vraie progression', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyProgress(), xp: 999 }));
    const ecrire = jest.spyOn(AsyncStorage, 'setItem');
    ecrire.mockClear(); // l'amorçage ci-dessus est un appel du test, pas de l'application
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('indisponible'));
    const { ctx, fin } = await monter();
    expect(ctx().avertissement).not.toBeNull();
    await act(async () => {
      ctx().update((p) => completeLesson(p, 'pion'));
    });
    // l'état en mémoire est vide : l'écrire effacerait les 999 points
    expect(ecrire).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!).xp).toBe(999);
    fin();
  });

  test('une écriture refusée est signalée à l’élève', async () => {
    const { ctx, fin } = await monter();
    expect(ctx().avertissement).toBeNull();
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    await act(async () => {
      ctx().update((p) => completeLesson(p, 'pion'));
    });
    expect(ctx().avertissement).toMatch(/ne peut pas être sauvegardée/);
    // et l'avertissement disparaît dès que l'écriture réussit de nouveau
    await act(async () => {
      ctx().update((p) => completeLesson(p, 'tour'));
    });
    expect(ctx().avertissement).toBeNull();
    fin();
  });

  test('une sauvegarde illisible est mise de côté, pas détruite', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{ceci n’est pas du json');
    const lecture = await loadProgress();
    expect(lecture.fiable).toBe(true);
    expect(lecture.progress).toEqual(emptyProgress());
    expect(await AsyncStorage.getItem(`${STORAGE_KEY}:corrompu`)).toBe('{ceci n’est pas du json');
  });

  test('saveProgress rend faux quand le stockage refuse', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('plein'));
    expect(await saveProgress(emptyProgress())).toBe(false);
    expect(await saveProgress(emptyProgress())).toBe(true);
  });
});

describe('normalize : jamais de type inattendu', () => {
  test('un thème inconnu retombe sur le thème par défaut', () => {
    expect(normalize({ settings: { board: 'rose' } }).settings.board).toBe('foret');
    expect(normalize({ settings: { board: 'nuit' } }).settings.board).toBe('nuit');
  });

  test('les nombres invalides sont remplacés, les valides bornés', () => {
    const n = normalize({ elo: 'abc', xp: '120', wins: -5, losses: NaN, streak: 3.7 });
    expect(n.elo).toBe(800);
    expect(n.xp).toBe(0);
    expect(n.wins).toBe(0);
    expect(n.losses).toBe(0);
    expect(n.streak).toBe(4);
    expect(normalize({ elo: 99999 }).elo).toBe(4000);
  });

  test('une chaîne à la place d’un dictionnaire ne donne aucune leçon', () => {
    const n = normalize({ lessons: 'x', puzzles: [true, true], trophies: 12 });
    expect(n.lessons).toEqual({});
    expect(n.puzzles).toEqual({});
    expect(n.trophies).toEqual({});
  });

  test('seules les entrées vraies comptent', () => {
    expect(normalize({ lessons: { pion: true, tour: false, fou: 'oui' } }).lessons).toEqual({ pion: true });
  });

  test('un historique corrompu est filtré', () => {
    const n = normalize({
      history: [null, 3, { bot: 'Pixou', result: 'win', eloDelta: 12 }, { bot: 'X', result: 'gagné', eloDelta: 1 }],
    });
    expect(n.history).toEqual([{ bot: 'Pixou', result: 'win', eloDelta: 12 }]);
  });

  test('des réglages absents reprennent leur valeur par défaut', () => {
    expect(normalize({ settings: 'x' }).settings).toEqual(emptyProgress().settings);
    expect(normalize(null)).toEqual(emptyProgress());
    expect(normalize([1, 2])).toEqual(emptyProgress());
  });

  test('une sauvegarde complète et saine traverse sans changement', () => {
    const p = { ...emptyProgress(), xp: 300, elo: 1234, lessons: { pion: true } };
    expect(normalize(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
