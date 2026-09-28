/**
 * Niveau de jeu de chaque adversaire.
 *
 * Les réglages ne sont pas des Elo écrits à la main : chacun a été **mesuré**
 * en faisant jouer l'adversaire contre Stockfish bridé à un Elo connu, puis
 * ajusté jusqu'à ce que le score corresponde. Voir
 * `docs/auto-evaluation/adversaires.md` pour les mesures et leurs limites.
 *
 * Sur le web, Stockfish prend le relais dès 1 320 Elo (son plancher). Le
 * cerveau maison couvre le bas de l'échelle, où Stockfish ne descend pas, et
 * tout l'échelle sur iOS et Android, où WebAssembly n'existe pas.
 */
import type { Niveau } from './cerveau';

/** Réglages des personnages, du plus faible au plus fort. */
export const NIVEAUX: Record<string, Niveau> = {
  // Voit un demi-coup, ignore les reprises, se trompe souvent — mais toujours
  // par des coups plausibles : il développe, il prend ce qui traîne.
  pixou: { profondeur: 2, tempsMs: 0, qmax: 0, temperature: 130, distraction: 0.35 },
  marguerite: { profondeur: 2, tempsMs: 0, qmax: 2, temperature: 80, distraction: 0.2 },
  hugo: { profondeur: 2, tempsMs: 0, qmax: 4, temperature: 50, distraction: 0.08 },
  cyrano: { profondeur: 3, tempsMs: 350, qmax: 4, temperature: 40, distraction: 0.08 },
  athena: { profondeur: 5, tempsMs: 600, qmax: 6, temperature: 15, distraction: 0 },
};

/**
 * Points d'ancrage Elo → réglages, pour un Elo quelconque (les niveaux de
 * Stockfish sur mobile, où le vrai moteur n'existe pas). On interpole entre
 * les deux points qui encadrent l'Elo demandé.
 */
const ANCRES: { elo: number; niveau: Niveau }[] = [
  { elo: 500, niveau: NIVEAUX.pixou },
  { elo: 900, niveau: NIVEAUX.marguerite },
  { elo: 1200, niveau: NIVEAUX.hugo },
  { elo: 1500, niveau: NIVEAUX.cyrano },
  { elo: 1900, niveau: NIVEAUX.athena },
  { elo: 2500, niveau: { profondeur: 9, tempsMs: 1500, qmax: 10, temperature: 0, distraction: 0 } },
  { elo: 3200, niveau: { profondeur: 14, tempsMs: 3000, qmax: 12, temperature: 0, distraction: 0 } },
];

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Réglages du cerveau pour un Elo donné. */
export function niveauPourElo(elo: number): Niveau {
  if (elo <= ANCRES[0].elo) return ANCRES[0].niveau;
  const dernier = ANCRES[ANCRES.length - 1];
  if (elo >= dernier.elo) return dernier.niveau;
  const i = ANCRES.findIndex((a) => a.elo > elo);
  const bas = ANCRES[i - 1];
  const haut = ANCRES[i];
  const t = (elo - bas.elo) / (haut.elo - bas.elo);
  return {
    profondeur: Math.round(mix(bas.niveau.profondeur, haut.niveau.profondeur, t)),
    tempsMs: Math.round(mix(bas.niveau.tempsMs, haut.niveau.tempsMs, t)),
    qmax: Math.round(mix(bas.niveau.qmax, haut.niveau.qmax, t)),
    temperature: Math.round(mix(bas.niveau.temperature, haut.niveau.temperature, t)),
    distraction: Math.round(mix(bas.niveau.distraction, haut.niveau.distraction, t) * 100) / 100,
  };
}

/** Part des coups d'ouverture tirés du répertoire : un faible hésite plus. */
export function partLivre(elo: number): number {
  if (elo >= 1400) return 1;
  return Math.max(0.5, Math.min(1, 0.5 + (elo - 500) / 1800));
}
