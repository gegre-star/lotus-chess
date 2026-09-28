/**
 * Pendule d'échecs.
 *
 * Tout repose sur des horodatages (`Date.now()`), jamais sur un compteur
 * décrémenté à chaque tic : iOS suspend les minuteurs quand l'application passe
 * en arrière-plan, et un compteur perdrait le temps écoulé. Un horodatage, lui,
 * dit toujours combien de temps s'est réellement passé.
 *
 * Le module est pur : le temps est passé en paramètre, ce qui permet de tester
 * un drapeau qui tombe sans attendre dix minutes.
 */
import type { Color } from './engine';

export interface Cadence {
  id: string;
  nom: string;
  /** Temps de départ par camp, en secondes. 0 : pas de pendule. */
  base: number;
  /** Incrément par coup, en secondes. */
  increment: number;
}

export const CADENCES: Cadence[] = [
  { id: 'libre', nom: 'Sans limite', base: 0, increment: 0 },
  { id: '15+10', nom: '15 min + 10 s', base: 900, increment: 10 },
  { id: '10', nom: '10 min', base: 600, increment: 0 },
  { id: '5', nom: '5 min', base: 300, increment: 0 },
  { id: '3+2', nom: '3 min + 2 s', base: 180, increment: 2 },
];

export interface Pendule {
  /** Temps restant en millisecondes, blancs puis noirs, à l'instant `depuis`. */
  restant: [number, number];
  incrementMs: number;
  /** Camp dont la pendule court, ou `null` avant le premier coup. */
  actif: Color | null;
  /** Horodatage du dernier changement de main. */
  depuis: number;
}

const idx = (c: Color): 0 | 1 => (c === 'w' ? 0 : 1);

/** Une pendule pour cette cadence, ou `null` si la partie est sans limite. */
export function creer(cadence: Cadence): Pendule | null {
  if (cadence.base <= 0) return null;
  return {
    restant: [cadence.base * 1000, cadence.base * 1000],
    incrementMs: cadence.increment * 1000,
    actif: null,
    depuis: 0,
  };
}

/** Temps restant de chaque camp à l'instant `maintenant`. */
export function lire(p: Pendule, maintenant: number): [number, number] {
  const r: [number, number] = [p.restant[0], p.restant[1]];
  if (p.actif !== null) {
    r[idx(p.actif)] = Math.max(0, r[idx(p.actif)] - Math.max(0, maintenant - p.depuis));
  }
  return r;
}

/**
 * Enregistre un coup du camp `joueur` : il paie le temps écoulé, gagne
 * l'incrément, et la pendule passe à l'adversaire.
 *
 * Avant le premier coup, la pendule ne court pas : le premier coup des blancs
 * est gratuit, et celle des noirs démarre à ce moment-là.
 */
export function coupJoue(p: Pendule, joueur: Color, maintenant: number): Pendule {
  const r = lire(p, maintenant);
  if (p.actif !== null) r[idx(joueur)] += p.incrementMs;
  return {
    restant: r,
    incrementMs: p.incrementMs,
    actif: joueur === 'w' ? 'b' : 'w',
    depuis: maintenant,
  };
}

/** Le camp dont le temps est écoulé, s'il y en a un. */
export function drapeauTombe(p: Pendule, maintenant: number): Color | null {
  const [b, n] = lire(p, maintenant);
  if (p.actif === 'w' && b <= 0) return 'w';
  if (p.actif === 'b' && n <= 0) return 'b';
  return null;
}

/**
 * Reprise après une interruption : on ne fait pas perdre à l'élève le temps où
 * l'application était fermée. La pendule repart de l'état sauvegardé, sans
 * compter l'absence.
 */
export function reprendre(p: Pendule, maintenant: number): Pendule {
  return { ...p, depuis: maintenant };
}

/** « 9:41 » ; sous vingt secondes, « 18.4 » pour que l'urgence se voie. */
export function formater(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 20_000) return (Math.floor(total / 100) / 10).toFixed(1);
  const s = Math.ceil(total / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
