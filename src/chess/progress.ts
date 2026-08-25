/**
 * Progression du joueur : points, classement, leçons et problèmes terminés,
 * trophées. Sauvegardée sur le téléphone via AsyncStorage.
 *
 * Toute la logique est pure et testable : `applyX` renvoie un nouvel état,
 * seules `loadProgress` / `saveProgress` touchent au stockage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LESSONS, PUZZLES, TROPHIES } from './content';

export const STORAGE_KEY = 'lotus-chess:progress:v1';
export const XP_PER_LEVEL = 150;

export type BoardTheme = 'foret' | 'ocean' | 'bois' | 'nuit';

export interface GameRecord {
  bot: string;
  result: 'win' | 'loss' | 'draw';
  eloDelta: number;
}

export interface Settings {
  sound: boolean;
  coords: boolean;
  board: BoardTheme;
}

export interface Progress {
  xp: number;
  elo: number;
  /** Problèmes résolus d'affilée sans erreur. */
  streak: number;
  bestStreak: number;
  wins: number;
  losses: number;
  draws: number;
  sprintBest: number;
  lessons: Record<string, boolean>;
  /** Exercices pratiques réussis, par identifiant. */
  exercises: Record<string, boolean>;
  puzzles: Record<string, boolean>;
  trophies: Record<string, boolean>;
  seenGames: Record<string, boolean>;
  history: GameRecord[];
  settings: Settings;
}

export const emptyProgress = (): Progress => ({
  xp: 0,
  elo: 800,
  streak: 0,
  bestStreak: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  sprintBest: 0,
  lessons: {},
  exercises: {},
  puzzles: {},
  trophies: {},
  seenGames: {},
  history: [],
  settings: { sound: true, coords: true, board: 'foret' },
});

export const levelOf = (xp: number): number => Math.floor(xp / XP_PER_LEVEL) + 1;
export const xpIntoLevel = (xp: number): number => xp % XP_PER_LEVEL;

/** Identifiants des trophées mérités par cet état. */
export function earnedTrophies(p: Progress): string[] {
  const lessons = Object.keys(p.lessons).length;
  const puzzles = Object.keys(p.puzzles).length;
  const movementLessons = ['pion', 'tour', 'fou', 'cavalier', 'dame', 'roi'];
  const earned: string[] = [];
  const add = (id: string, ok: boolean) => {
    if (ok) earned.push(id);
  };
  add('first', lessons >= 1);
  add('movers', movementLessons.every((id) => p.lessons[id]));
  add('tact5', puzzles >= 5);
  add('clean3', p.bestStreak >= 3);
  add('winai', p.wins >= 1);
  add('scholar', lessons >= LESSONS.length);
  add('lvl5', levelOf(p.xp) >= 5);
  add('allpuz', puzzles >= PUZZLES.length);
  add('sprint10', p.sprintBest >= 10);
  add('elo1000', p.elo >= 1000);
  add('curious', Object.keys(p.seenGames).length >= 1);
  return earned.filter((id) => TROPHIES.some((t) => t.id === id));
}

export interface Awarded {
  progress: Progress;
  /** Trophées débloqués par cette mise à jour, à célébrer à l'écran. */
  unlocked: string[];
}

/** Ajoute les trophées nouvellement mérités et signale lesquels. */
export function withTrophies(p: Progress): Awarded {
  const unlocked = earnedTrophies(p).filter((id) => !p.trophies[id]);
  if (unlocked.length === 0) return { progress: p, unlocked };
  const trophies = { ...p.trophies };
  unlocked.forEach((id) => {
    trophies[id] = true;
  });
  return { progress: { ...p, trophies }, unlocked };
}

export const addXP = (p: Progress, amount: number): Awarded =>
  withTrophies({ ...p, xp: p.xp + Math.max(0, amount) });

/** Marque un exercice réussi et crédite les points correspondants. */
export function completeExercise(p: Progress, exerciseId: string, points: number): Awarded {
  return withTrophies({
    ...p,
    xp: p.xp + points,
    exercises: { ...p.exercises, [exerciseId]: true },
  });
}

export function completeLesson(p: Progress, lessonId: string): Awarded {
  const first = !p.lessons[lessonId];
  return withTrophies({
    ...p,
    xp: p.xp + (first ? 25 : 0),
    lessons: { ...p.lessons, [lessonId]: true },
  });
}

/** Points gagnés pour un problème, selon sa difficulté, le temps et l'aide utilisée. */
export function puzzleReward(rating: number, seconds: number, failed: boolean, hinted: boolean): number {
  let reward = Math.round(rating / 20);
  if (!failed && !hinted) reward += Math.max(0, 25 - Math.max(1, Math.floor(seconds)));
  if (hinted) reward = Math.round(reward * 0.6);
  return Math.max(5, reward);
}

export function solvePuzzle(
  p: Progress,
  puzzleId: string,
  opts: { seconds: number; failed: boolean; hinted: boolean },
): Awarded {
  const puzzle = PUZZLES.find((x) => x.id === puzzleId);
  const first = !p.puzzles[puzzleId];
  const full = puzzleReward(puzzle?.rating ?? 800, opts.seconds, opts.failed, opts.hinted);
  const streak = opts.failed ? 0 : p.streak + 1;
  return withTrophies({
    ...p,
    xp: p.xp + (first ? full : Math.round(full / 3)),
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    puzzles: { ...p.puzzles, [puzzleId]: true },
  });
}

/** Remet la série à zéro après une erreur sur un problème. */
export const failPuzzle = (p: Progress): Progress => ({ ...p, streak: 0 });

export function finishGame(
  p: Progress,
  bot: string,
  result: GameRecord['result'],
  newElo: number,
): Awarded {
  const record: GameRecord = { bot, result, eloDelta: newElo - p.elo };
  return withTrophies({
    ...p,
    elo: newElo,
    xp: p.xp + (result === 'win' ? 50 : 0),
    wins: p.wins + (result === 'win' ? 1 : 0),
    losses: p.losses + (result === 'loss' ? 1 : 0),
    draws: p.draws + (result === 'draw' ? 1 : 0),
    // on ne garde que les vingt dernières parties
    history: [...p.history, record].slice(-20),
  });
}

export const finishSprint = (p: Progress, score: number): Awarded =>
  withTrophies({
    ...p,
    xp: p.xp + score * 8,
    sprintBest: Math.max(p.sprintBest, score),
  });

export const markGameSeen = (p: Progress, gameId: string): Awarded =>
  withTrophies({ ...p, seenGames: { ...p.seenGames, [gameId]: true } });

/** Fusionne un état lu du disque avec les valeurs par défaut (montées de version). */
export function normalize(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<Progress>;
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings ?? {}) },
    lessons: data.lessons ?? {},
    // absent des sauvegardes antérieures aux exercices
    exercises: data.exercises ?? {},
    puzzles: data.puzzles ?? {},
    trophies: data.trophies ?? {},
    seenGames: data.seenGames ?? {},
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export async function loadProgress(): Promise<Progress> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    // stockage indisponible : on joue quand même, sans sauvegarde
    return emptyProgress();
  }
}

export async function saveProgress(p: Progress): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // rien à faire : la partie en cours reste jouable
  }
}

export async function resetProgress(): Promise<Progress> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignoré
  }
  return emptyProgress();
}
