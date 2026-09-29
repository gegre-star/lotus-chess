/**
 * Sons et vibrations — version web.
 *
 * Les sons sont **synthétisés** avec l'API Web Audio : aucun fichier à
 * charger, donc rien à télécharger, rien à mettre en cache, et l'application
 * reste légère. Chaque effet est une enveloppe courte sur un ou deux
 * oscillateurs.
 *
 * Safari sur iPhone ne démarre le contexte audio qu'à la suite d'un geste de
 * l'utilisateur, et le suspend quand la page passe en arrière-plan : on le
 * reprend à chaque son plutôt que de le créer une fois pour toutes.
 */
import type { Effet } from './son';

export type { Effet };

let contexte: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    if (!contexte) contexte = new Ctor();
    if (contexte.state === 'suspended') void contexte.resume();
    return contexte;
  } catch {
    return null;
  }
}

interface Note {
  /** Fréquence de départ, en Hz. */
  f: number;
  /** Fréquence d'arrivée (glissando), en Hz. */
  vers?: number;
  /** Début, en secondes après le déclenchement. */
  t: number;
  /** Durée, en secondes. */
  d: number;
  gain: number;
  onde?: OscillatorType;
}

const PARTITION: Record<Effet, Note[]> = {
  // un « toc » de bois : un sinus grave qui retombe vite
  coup: [{ f: 210, vers: 120, t: 0, d: 0.09, gain: 0.5, onde: 'triangle' }],
  prise: [
    { f: 260, vers: 100, t: 0, d: 0.12, gain: 0.7, onde: 'triangle' },
    { f: 130, vers: 70, t: 0.02, d: 0.12, gain: 0.5, onde: 'sine' },
  ],
  roque: [
    { f: 210, vers: 120, t: 0, d: 0.09, gain: 0.5, onde: 'triangle' },
    { f: 250, vers: 150, t: 0.1, d: 0.09, gain: 0.5, onde: 'triangle' },
  ],
  promotion: [
    { f: 440, t: 0, d: 0.1, gain: 0.35, onde: 'sine' },
    { f: 660, t: 0.09, d: 0.16, gain: 0.35, onde: 'sine' },
  ],
  echec: [
    { f: 210, vers: 120, t: 0, d: 0.09, gain: 0.5, onde: 'triangle' },
    { f: 880, t: 0.08, d: 0.14, gain: 0.3, onde: 'square' },
  ],
  erreur: [{ f: 150, vers: 110, t: 0, d: 0.16, gain: 0.35, onde: 'sawtooth' }],
  fin: [
    { f: 392, t: 0, d: 0.22, gain: 0.3, onde: 'sine' },
    { f: 494, t: 0.12, d: 0.22, gain: 0.3, onde: 'sine' },
    { f: 587, t: 0.24, d: 0.42, gain: 0.3, onde: 'sine' },
  ],
};

/** Durée de vibration par effet, en millisecondes. Safari sur iPhone ne les supporte pas. */
const VIBRATION: Record<Effet, number | number[]> = {
  coup: 8,
  prise: 16,
  roque: [8, 40, 8],
  promotion: [10, 30, 10],
  echec: [12, 40, 12],
  erreur: [30, 40, 30],
  fin: [20, 50, 20, 50, 40],
};

export function jouerSon(effet: Effet, reglages: { sound: boolean; vibration: boolean }): void {
  if (reglages.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(VIBRATION[effet]);
    } catch {
      // certains navigateurs refusent hors geste : sans importance
    }
  }
  if (!reglages.sound) return;
  const ctx = audio();
  if (!ctx) return;
  const debut = ctx.currentTime;
  for (const n of PARTITION[effet]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.onde ?? 'sine';
    osc.frequency.setValueAtTime(n.f, debut + n.t);
    if (n.vers) osc.frequency.exponentialRampToValueAtTime(n.vers, debut + n.t + n.d);
    // enveloppe : attaque quasi instantanée, extinction douce (évite le « clic » de fin)
    gain.gain.setValueAtTime(0.0001, debut + n.t);
    gain.gain.exponentialRampToValueAtTime(n.gain, debut + n.t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, debut + n.t + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(debut + n.t);
    osc.stop(debut + n.t + n.d + 0.02);
  }
}
