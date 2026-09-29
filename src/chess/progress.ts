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
  /** Vibration à chaque coup (iPhone : non pris en charge par Safari). */
  vibration: boolean;
  coords: boolean;
  board: BoardTheme;
}

/** Objectifs d'une journée : ce que l'élève a fait aujourd'hui. */
export interface ObjectifsDuJour {
  /** Jour concerné, `AAAA-MM-JJ` en heure locale ; les compteurs repartent à zéro le lendemain. */
  jour: string | null;
  lecons: number;
  problemes: number;
  parties: number;
  /** Le bonus de la journée a déjà été versé. */
  bonus: boolean;
}

/** Cibles à atteindre chaque jour pour toucher le bonus. */
export const CIBLES_DU_JOUR = { lecons: 1, problemes: 3, parties: 1 } as const;
export const BONUS_DU_JOUR = 50;

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
  /** Finales jouées jusqu'au bout avec succès, par identifiant. */
  finales: Record<string, boolean>;
  trophies: Record<string, boolean>;
  seenGames: Record<string, boolean>;
  history: GameRecord[];
  settings: Settings;
  /** Jours consécutifs d'activité — la mesure de régularité qui fait revenir. */
  serieJours: { dernier: string | null; courante: number; meilleure: number };
  objectifs: ObjectifsDuJour;
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
  finales: {},
  trophies: {},
  seenGames: {},
  history: [],
  settings: { sound: true, vibration: true, coords: true, board: 'foret' },
  serieJours: { dernier: null, courante: 0, meilleure: 0 },
  objectifs: { jour: null, lecons: 0, problemes: 0, parties: 0, bonus: false },
});

// ------------------------------------------------------------ objectifs du jour

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/** Jour local au format `AAAA-MM-JJ`. L'heure locale, pas UTC : le jour change à minuit chez l'élève. */
export const jourLocal = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${deuxChiffres(d.getMonth() + 1)}-${deuxChiffres(d.getDate())}`;

/** La veille d'un jour `AAAA-MM-JJ`, calendrier compris (fins de mois, années bissextiles). */
export function veille(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  // midi, pour ne pas dépendre d'un changement d'heure
  return jourLocal(new Date(a, m - 1, j - 1, 12));
}

export type Activite = 'lecon' | 'probleme' | 'partie';

/**
 * Enregistre une activité dans la série de jours et les objectifs du jour.
 *
 * La série continue si l'élève était déjà actif la veille, repart à un sinon.
 * Le bonus est versé une seule fois, à l'instant où les trois cibles sont
 * atteintes, et non à chaque activité supplémentaire.
 */
export function enregistrerActivite(p: Progress, activite: Activite, jour: string = jourLocal()): Awarded {
  let serie = p.serieJours;
  if (serie.dernier !== jour) {
    const courante = serie.dernier === veille(jour) ? serie.courante + 1 : 1;
    serie = { dernier: jour, courante, meilleure: Math.max(serie.meilleure, courante) };
  }
  const base: ObjectifsDuJour =
    p.objectifs.jour === jour
      ? p.objectifs
      : { jour, lecons: 0, problemes: 0, parties: 0, bonus: false };
  const objectifs: ObjectifsDuJour = {
    ...base,
    lecons: base.lecons + (activite === 'lecon' ? 1 : 0),
    problemes: base.problemes + (activite === 'probleme' ? 1 : 0),
    parties: base.parties + (activite === 'partie' ? 1 : 0),
  };
  const atteints =
    objectifs.lecons >= CIBLES_DU_JOUR.lecons &&
    objectifs.problemes >= CIBLES_DU_JOUR.problemes &&
    objectifs.parties >= CIBLES_DU_JOUR.parties;
  let xp = p.xp;
  if (atteints && !objectifs.bonus) {
    xp += BONUS_DU_JOUR;
    objectifs.bonus = true;
  }
  return withTrophies({ ...p, xp, serieJours: serie, objectifs });
}

/** Objectifs tels qu'il faut les afficher aujourd'hui : ceux d'hier ne comptent plus. */
export function objectifsAffiches(p: Progress, jour: string = jourLocal()): ObjectifsDuJour {
  return p.objectifs.jour === jour
    ? p.objectifs
    : { jour, lecons: 0, problemes: 0, parties: 0, bonus: false };
}

/** La série est-elle encore vivante ? Elle s'éteint si ni aujourd'hui ni hier n'ont eu d'activité. */
export function serieVivante(p: Progress, jour: string = jourLocal()): number {
  const d = p.serieJours.dernier;
  return d === jour || d === veille(jour) ? p.serieJours.courante : 0;
}

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

export function completeLesson(p: Progress, lessonId: string, jour?: string): Awarded {
  const first = !p.lessons[lessonId];
  const fait = withTrophies({
    ...p,
    xp: p.xp + (first ? 25 : 0),
    lessons: { ...p.lessons, [lessonId]: true },
  });
  return fusionner(fait, enregistrerActivite(fait.progress, 'lecon', jour));
}

/** Points gagnés pour un problème, selon sa difficulté, le temps et l'aide utilisée. */
export function puzzleReward(rating: number, seconds: number, failed: boolean, hinted: boolean): number {
  let reward = Math.round(rating / 20);
  if (!failed && !hinted) reward += Math.max(0, 25 - Math.max(1, Math.floor(seconds)));
  if (hinted) reward = Math.round(reward * 0.6);
  return Math.max(5, reward);
}

/** Combine deux résultats successifs : l'état final, tous les trophées débloqués. */
function fusionner(avant: Awarded, apres: Awarded): Awarded {
  return { progress: apres.progress, unlocked: [...avant.unlocked, ...apres.unlocked] };
}

export function solvePuzzle(
  p: Progress,
  puzzleId: string,
  opts: { seconds: number; failed: boolean; hinted: boolean },
  jour?: string,
): Awarded {
  const puzzle = PUZZLES.find((x) => x.id === puzzleId);
  const first = !p.puzzles[puzzleId];
  const full = puzzleReward(puzzle?.rating ?? 800, opts.seconds, opts.failed, opts.hinted);
  const streak = opts.failed ? 0 : p.streak + 1;
  const fait = withTrophies({
    ...p,
    xp: p.xp + (first ? full : Math.round(full / 3)),
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    puzzles: { ...p.puzzles, [puzzleId]: true },
  });
  return fusionner(fait, enregistrerActivite(fait.progress, 'probleme', jour));
}

/** Points d'une finale réussie, versés une seule fois. */
export const POINTS_FINALE = 30;

/** Enregistre une finale menée à bien. */
export function completerFinale(p: Progress, id: string, jour?: string): Awarded {
  const premiere = !p.finales[id];
  const fait = withTrophies({
    ...p,
    xp: p.xp + (premiere ? POINTS_FINALE : 0),
    finales: { ...p.finales, [id]: true },
  });
  return fusionner(fait, enregistrerActivite(fait.progress, 'probleme', jour));
}

/** Remet la série à zéro après une erreur sur un problème. */
export const failPuzzle = (p: Progress): Progress => ({ ...p, streak: 0 });

export function finishGame(
  p: Progress,
  bot: string,
  result: GameRecord['result'],
  newElo: number,
  jour?: string,
): Awarded {
  const record: GameRecord = { bot, result, eloDelta: newElo - p.elo };
  const fait = withTrophies({
    ...p,
    elo: newElo,
    xp: p.xp + (result === 'win' ? 50 : 0),
    wins: p.wins + (result === 'win' ? 1 : 0),
    losses: p.losses + (result === 'loss' ? 1 : 0),
    draws: p.draws + (result === 'draw' ? 1 : 0),
    // on ne garde que les vingt dernières parties
    history: [...p.history, record].slice(-20),
  });
  return fusionner(fait, enregistrerActivite(fait.progress, 'partie', jour));
}

export const finishSprint = (p: Progress, score: number): Awarded =>
  withTrophies({
    ...p,
    xp: p.xp + score * 8,
    sprintBest: Math.max(p.sprintBest, score),
  });

export const markGameSeen = (p: Progress, gameId: string): Awarded =>
  withTrophies({ ...p, seenGames: { ...p.seenGames, [gameId]: true } });

const THEMES: readonly BoardTheme[] = ['foret', 'ocean', 'bois', 'nuit'];

const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const entier = (v: unknown, defaut: number, min: number, max: number): number =>
  estNombre(v) ? Math.min(max, Math.max(min, Math.round(v))) : defaut;

/** Ne garde d'un dictionnaire que ses entrées `true` : les seules qui signifient quelque chose. */
function drapeaux(v: unknown): Record<string, boolean> {
  const sortie: Record<string, boolean> = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return sortie;
  for (const [cle, valeur] of Object.entries(v as Record<string, unknown>)) {
    if (valeur === true) sortie[cle] = true;
  }
  return sortie;
}

const RESULTATS: readonly GameRecord['result'][] = ['win', 'loss', 'draw'];

const estJour = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function normaliserSerie(v: unknown): Progress['serieJours'] {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const courante = entier(o.courante, 0, 0, 100_000);
  return {
    dernier: estJour(o.dernier) ? o.dernier : null,
    courante,
    meilleure: Math.max(courante, entier(o.meilleure, 0, 0, 100_000)),
  };
}

function normaliserObjectifs(v: unknown): ObjectifsDuJour {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return {
    jour: estJour(o.jour) ? o.jour : null,
    lecons: entier(o.lecons, 0, 0, 10_000),
    problemes: entier(o.problemes, 0, 0, 10_000),
    parties: entier(o.parties, 0, 0, 10_000),
    bonus: o.bonus === true,
  };
}

/**
 * Remet en état un état lu du disque.
 *
 * Une sauvegarde peut être ancienne, tronquée ou corrompue, et `...data` ne
 * vérifiait rien : un thème inconnu faisait planter l'échiquier, un classement
 * « abc » traversait toute l'application, une liste de leçons réduite à une
 * chaîne donnait un trophée. Chaque champ est donc contrôlé, et ramené à sa
 * valeur par défaut s'il n'a pas le bon type.
 */
export function normalize(raw: unknown): Progress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const d = raw as Record<string, unknown>;
  const reglages = d.settings && typeof d.settings === 'object' ? (d.settings as Record<string, unknown>) : {};
  const historique = Array.isArray(d.history) ? d.history : [];
  return {
    xp: entier(d.xp, base.xp, 0, 10_000_000),
    elo: entier(d.elo, base.elo, 100, 4000),
    streak: entier(d.streak, 0, 0, 100_000),
    bestStreak: entier(d.bestStreak, 0, 0, 100_000),
    wins: entier(d.wins, 0, 0, 1_000_000),
    losses: entier(d.losses, 0, 0, 1_000_000),
    draws: entier(d.draws, 0, 0, 1_000_000),
    sprintBest: entier(d.sprintBest, 0, 0, 100_000),
    lessons: drapeaux(d.lessons),
    // absent des sauvegardes antérieures aux exercices
    exercises: drapeaux(d.exercises),
    puzzles: drapeaux(d.puzzles),
    finales: drapeaux(d.finales),
    trophies: drapeaux(d.trophies),
    seenGames: drapeaux(d.seenGames),
    history: historique
      .filter(
        (h): h is GameRecord =>
          !!h &&
          typeof h === 'object' &&
          typeof (h as GameRecord).bot === 'string' &&
          RESULTATS.includes((h as GameRecord).result) &&
          estNombre((h as GameRecord).eloDelta),
      )
      .slice(-20),
    serieJours: normaliserSerie(d.serieJours),
    objectifs: normaliserObjectifs(d.objectifs),
    settings: {
      sound: typeof reglages.sound === 'boolean' ? reglages.sound : base.settings.sound,
      coords: typeof reglages.coords === 'boolean' ? reglages.coords : base.settings.coords,
      board: THEMES.includes(reglages.board as BoardTheme)
        ? (reglages.board as BoardTheme)
        : base.settings.board,
      vibration:
        typeof reglages.vibration === 'boolean' ? reglages.vibration : base.settings.vibration,
    },
  };
}

export interface Lecture {
  progress: Progress;
  /**
   * Faux quand la lecture a échoué (stockage indisponible). Il ne faut alors
   * rien écrire par-dessus : l'état en mémoire est vide, et le remplacer par
   * lui effacerait la progression de l'élève pour une panne passagère.
   */
  fiable: boolean;
}

const CLE_CORROMPUE = `${STORAGE_KEY}:corrompu`;

/**
 * Relit la sauvegarde.
 *
 * Une donnée **illisible** (JSON invalide) est mise de côté sous une autre clé
 * avant d'être remplacée : on ne détruit jamais ce qu'on n'a pas su lire, un
 * correctif ultérieur pourrait le récupérer. Un **échec de lecture** est
 * différent : le contenu existe peut-être encore, on le signale et on
 * s'interdit d'écrire.
 */
export async function loadProgress(): Promise<Lecture> {
  let brut: string | null;
  try {
    brut = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return { progress: emptyProgress(), fiable: false };
  }
  if (!brut) return { progress: emptyProgress(), fiable: true };
  try {
    return { progress: normalize(JSON.parse(brut)), fiable: true };
  } catch {
    try {
      await AsyncStorage.setItem(CLE_CORROMPUE, brut);
    } catch {
      // la copie de secours est un plus : sans elle on repart quand même
    }
    return { progress: emptyProgress(), fiable: true };
  }
}

/** Enregistre. Rend `false` si le stockage a refusé (plein, mode privé). */
export async function saveProgress(p: Progress): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
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
