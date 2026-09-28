/**
 * Répertoire d'ouvertures.
 *
 * Le moteur choisissait ses premiers coups par le calcul, et le calcul est
 * déterministe : à profondeur égale, depuis la position de départ, il rejouait
 * indéfiniment la même ouverture. Une partie sur deux commençait à
 * l'identique, et l'élève n'apprenait qu'une seule position.
 *
 * Le répertoire répond à deux besoins d'un coup : il fait varier les débuts
 * (tirage pondéré parmi les coups connus), et il les fait varier *vers des
 * ouvertures réelles*, qu'on peut nommer — « Défense sicilienne » vaut mieux
 * qu'un coup au hasard, pour jouer comme pour apprendre.
 *
 * Les coups sont écrits en notation UCI (`e2e4`). La légalité de chacun est
 * vérifiée par les tests, coup par coup, depuis la position de départ.
 */
import { START_FEN, legalMoves, makeMove, parseFEN, positionKey, squareName } from './engine';
import type { Move, Position } from './engine';

export interface Ligne {
  nom: string;
  /** Les coups de la ligne, en UCI, depuis la position initiale. */
  coups: string[];
  /** Poids relatif du tirage : 3 sort trois fois plus souvent que 1. */
  poids: number;
}

/**
 * Les lignes du répertoire.
 *
 * Choisies parmi les ouvertures réellement jouées, et volontairement courtes :
 * quatre à cinq coups suffisent à écarter les parties les unes des autres, et
 * au-delà c'est au moteur de jouer, pas à une liste.
 */
export const LIGNES: Ligne[] = [
  // ---- 1.e4 e5 ----
  { nom: 'Partie italienne', poids: 6, coups: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'] },
  { nom: 'Défense des deux cavaliers', poids: 4, coups: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'd2d3', 'f8c5'] },
  { nom: 'Partie espagnole', poids: 5, coups: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'] },
  { nom: 'Défense Petrov', poids: 2, coups: ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'd7d6', 'e5f3', 'f6e4'] },
  { nom: 'Défense Philidor', poids: 2, coups: ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'e5d4', 'f3d4', 'g8f6'] },
  { nom: 'Gambit du roi', poids: 2, coups: ['e2e4', 'e7e5', 'f2f4', 'e5f4', 'g1f3', 'g7g5'] },
  { nom: 'Partie viennoise', poids: 2, coups: ['e2e4', 'e7e5', 'b1c3', 'g8f6', 'f2f4', 'd7d5'] },
  { nom: 'Partie écossaise', poids: 3, coups: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4', 'f8c5'] },

  // ---- 1.e4, autres réponses ----
  { nom: 'Défense sicilienne', poids: 6, coups: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3'] },
  { nom: 'Sicilienne, variante du dragon', poids: 3, coups: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6'] },
  { nom: 'Sicilienne fermée', poids: 2, coups: ['e2e4', 'c7c5', 'b1c3', 'b8c6', 'g2g3', 'g7g6', 'f1g2', 'f8g7'] },
  { nom: 'Défense française', poids: 5, coups: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'c1g5', 'f8e7'] },
  { nom: 'Française, variante d’échange', poids: 2, coups: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4d5', 'e6d5', 'g1f3', 'g8f6'] },
  { nom: 'Défense Caro-Kann', poids: 4, coups: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'c8f5'] },
  { nom: 'Défense scandinave', poids: 3, coups: ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5', 'd2d4', 'g8f6'] },
  { nom: 'Défense Pirc', poids: 2, coups: ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6', 'g1f3', 'f8g7'] },
  { nom: 'Défense Alekhine', poids: 2, coups: ['e2e4', 'g8f6', 'e4e5', 'f6d5', 'd2d4', 'd7d6', 'g1f3', 'c8g4'] },

  // ---- 1.d4 ----
  { nom: 'Gambit dame refusé', poids: 5, coups: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c1g5', 'f8e7'] },
  { nom: 'Gambit dame accepté', poids: 3, coups: ['d2d4', 'd7d5', 'c2c4', 'd5c4', 'g1f3', 'g8f6', 'e2e3', 'e7e6'] },
  { nom: 'Défense slave', poids: 4, coups: ['d2d4', 'd7d5', 'c2c4', 'c7c6', 'g1f3', 'g8f6', 'b1c3', 'd5c4'] },
  { nom: 'Système de Londres', poids: 3, coups: ['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4', 'e7e6', 'e2e3', 'f8d6'] },
  { nom: 'Défense est-indienne', poids: 4, coups: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'] },
  { nom: 'Défense nimzo-indienne', poids: 4, coups: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'e8g8'] },
  { nom: 'Défense ouest-indienne', poids: 2, coups: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g1f3', 'b7b6', 'g2g3', 'c8b7'] },
  { nom: 'Défense Grünfeld', poids: 3, coups: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5', 'c4d5', 'f6d5'] },
  { nom: 'Ouverture catalane', poids: 2, coups: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3', 'd7d5', 'f1g2', 'f8e7'] },
  { nom: 'Défense hollandaise', poids: 2, coups: ['d2d4', 'f7f5', 'g2g3', 'g8f6', 'f1g2', 'e7e6', 'g1f3', 'f8e7'] },

  // ---- flancs ----
  { nom: 'Ouverture anglaise', poids: 3, coups: ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g2g3', 'd7d5', 'c4d5', 'f6d5'] },
  { nom: 'Anglaise symétrique', poids: 2, coups: ['c2c4', 'c7c5', 'g1f3', 'g8f6', 'b1c3', 'b8c6', 'g2g3', 'd7d5'] },
  { nom: 'Ouverture Réti', poids: 3, coups: ['g1f3', 'd7d5', 'c2c4', 'e7e6', 'g2g3', 'g8f6', 'f1g2', 'f8e7'] },
  { nom: 'Attaque est-indienne', poids: 2, coups: ['g1f3', 'g8f6', 'g2g3', 'g7g6', 'f1g2', 'f8g7', 'e1g1', 'e8g8'] },
];

export interface CoupDeLivre {
  uci: string;
  poids: number;
}

/** Le répertoire indexé par position : signature FEN → coups connus pondérés. */
const LIVRE: Map<string, CoupDeLivre[]> = (() => {
  const livre = new Map<string, CoupDeLivre[]>();
  for (const ligne of LIGNES) {
    let pos = parseFEN(START_FEN);
    for (const uci of ligne.coups) {
      const cle = positionKey(pos);
      const entrees = livre.get(cle) ?? [];
      const connu = entrees.find((e) => e.uci === uci);
      // deux lignes qui partagent un coup en cumulent le poids : 1.e4 sort
      // d'autant plus souvent qu'il mène à plus d'ouvertures
      if (connu) connu.poids += ligne.poids;
      else entrees.push({ uci, poids: ligne.poids });
      livre.set(cle, entrees);
      const move = coupUci(pos, uci);
      // une ligne fautive s'arrête ici plutôt que de fausser le reste du
      // répertoire ; les tests refusent de toute façon qu'il y en ait une
      if (!move) break;
      pos = makeMove(pos, move);
    }
  }
  return livre;
})();

/** Retrouve le coup légal correspondant à une notation UCI. */
export function coupUci(pos: Position, uci: string): Move | null {
  return (
    legalMoves(pos).find(
      (m) =>
        `${squareName(m.from)}${squareName(m.to)}` === uci.slice(0, 4) &&
        (uci.length <= 4 || m.promotion?.toLowerCase() === uci[4]),
    ) ?? null
  );
}

/** Les coups que le répertoire connaît dans cette position. */
export const coupsDeLivre = (pos: Position): CoupDeLivre[] => LIVRE.get(positionKey(pos)) ?? [];

/**
 * Un coup du répertoire, tiré au sort selon les poids.
 *
 * Rend `null` hors du répertoire — c'est alors au moteur de jouer.
 */
export function coupDeLivre(pos: Position, random: () => number = Math.random): Move | null {
  const entrees = coupsDeLivre(pos);
  if (entrees.length === 0) return null;
  const total = entrees.reduce((somme, e) => somme + e.poids, 0);
  let tirage = random() * total;
  for (const e of entrees) {
    tirage -= e.poids;
    if (tirage < 0) return coupUci(pos, e.uci);
  }
  return coupUci(pos, entrees[entrees.length - 1].uci);
}

/** En deçà, trop de lignes partagent le même début pour nommer quoi que ce soit. */
const PROFONDEUR_MIN = 3;

/**
 * Nom de l'ouverture jouée, d'après les coups depuis le début.
 *
 * On retient la ligne qui colle le plus longtemps à la partie ; à égalité,
 * la plus courte, c'est-à-dire la plus générale. Après 1.e4 c5 2.Cf3 on
 * annonce « Défense sicilienne », et c'est seulement une fois ...g6 joué que
 * la « variante du dragon » se distingue. Quand deux ouvertures de noms
 * différents collent aussi bien, on se tait plutôt que de deviner.
 */
export function nommerOuverture(coups: string[]): string | null {
  let retenues: Ligne[] = [];
  let profondeur = PROFONDEUR_MIN - 1;
  for (const ligne of LIGNES) {
    const n = Math.min(ligne.coups.length, coups.length);
    if (n < PROFONDEUR_MIN) continue;
    if (!ligne.coups.slice(0, n).every((c, i) => c === coups[i])) continue;
    if (n > profondeur) {
      retenues = [ligne];
      profondeur = n;
    } else if (n === profondeur) {
      retenues.push(ligne);
    }
  }
  if (retenues.length === 0) return null;
  const court = Math.min(...retenues.map((l) => l.coups.length));
  const noms = new Set(retenues.filter((l) => l.coups.length === court).map((l) => l.nom));
  return noms.size === 1 ? [...noms][0] : null;
}
