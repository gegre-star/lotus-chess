/**
 * Mode « Bibliothèque » : des problèmes à solution imposée, joués par les blancs
 * comme par les noirs.
 *
 * Les 33 problèmes du parcours sont jugés par le moteur (un but : mat ou gain de
 * matériel). Ceux-ci viennent de la base libre de Lichess, qui donne la solution
 * coup par coup : on compare donc le coup de l'élève à la ligne attendue, et
 * l'adversaire répond exactement ce que la ligne prévoit.
 *
 * Convention Lichess : `coups[0]` est le dernier coup de l'adversaire, joué avant
 * que le problème ne commence ; `coups[1]` est le premier coup de l'élève, puis
 * l'adversaire (`coups[2]`), l'élève (`coups[3]`), etc.
 */
import {
  findMove,
  gameStatus,
  makeMove,
  parseFEN,
  squareFromName,
  squareName,
  type Color,
  type Move,
  type PieceType,
  type Position,
} from './engine';

export interface ProblemeLichess {
  id: string;
  /** Position AVANT le coup de l'adversaire, `coups[0]`. */
  fen: string;
  coups: string[];
  rating: number;
  themes: string[];
}

export interface EtatLichess {
  probleme: ProblemeLichess;
  /** Position de départ pour l'élève (après le coup de l'adversaire). */
  depart: Position;
  position: Position;
  /** Coup de l'adversaire joué en ouverture, pour le montrer à l'élève. */
  coupAdverse: Move;
  /** Indice, dans `coups`, du prochain coup attendu de l'élève. */
  etape: number;
  joueur: Color;
  resolu: boolean;
}

export type Verdict =
  | { type: 'juste'; etat: EtatLichess; reponse: Move | null }
  | { type: 'faux' };

/** Coup UCI (`e2e4`, `e7e8q`) → coup du moteur, ou `undefined` s'il est illégal. */
export function coupDepuisUci(pos: Position, uci: string): Move | undefined {
  const promo = uci.length > 4 ? (uci[4].toUpperCase() as PieceType) : undefined;
  return findMove(pos, squareFromName(uci.slice(0, 2)), squareFromName(uci.slice(2, 4)), promo);
}

export function demarrer(probleme: ProblemeLichess): EtatLichess {
  const initiale = parseFEN(probleme.fen);
  const coupAdverse = coupDepuisUci(initiale, probleme.coups[0]);
  if (!coupAdverse) throw new Error(`Problème ${probleme.id} : le premier coup est illégal`);
  const depart = makeMove(initiale, coupAdverse);
  return {
    probleme,
    depart,
    position: depart,
    coupAdverse,
    etape: 1,
    joueur: depart.turn,
    resolu: false,
  };
}

const memeCoup = (a: Move, b: Move): boolean =>
  a.from === b.from && a.to === b.to && (a.promotion ?? null) === (b.promotion ?? null);

/**
 * Juge le coup de l'élève.
 *
 * Un mat est toujours accepté, même si ce n'est pas le coup de la ligne : c'est
 * la règle de Lichess, et refuser un mat serait absurde.
 */
export function jouer(etat: EtatLichess, coup: Move): Verdict {
  if (etat.resolu) return { type: 'faux' };
  const { coups } = etat.probleme;
  const attendu = coupDepuisUci(etat.position, coups[etat.etape]);
  const apres = makeMove(etat.position, coup);
  const mat = gameStatus(apres) === 'mate';
  if (!mat && !(attendu && memeCoup(attendu, coup))) return { type: 'faux' };

  if (mat || etat.etape + 1 >= coups.length) {
    return { type: 'juste', reponse: null, etat: { ...etat, position: apres, etape: coups.length, resolu: true } };
  }
  const reponse = coupDepuisUci(apres, coups[etat.etape + 1]);
  if (!reponse) throw new Error(`Problème ${etat.probleme.id} : la réponse adverse est illégale`);
  const etape = etat.etape + 2;
  return {
    type: 'juste',
    reponse,
    etat: { ...etat, position: makeMove(apres, reponse), etape, resolu: etape >= coups.length },
  };
}

/** Case de la pièce à jouer (pour l'indice). */
export function caseIndice(etat: EtatLichess): string | null {
  const uci = etat.probleme.coups[etat.etape];
  return uci ? uci.slice(0, 2) : null;
}

/** Les coups restant à jouer pour l'élève, en cases de départ et d'arrivée. */
export function coupsRestants(etat: EtatLichess): [string, string][] {
  return etat.probleme.coups
    .slice(etat.etape)
    .filter((_, i) => i % 2 === 0)
    .map((uci) => [uci.slice(0, 2), uci.slice(2, 4)] as [string, string]);
}

export const nomCase = squareName;

// ------------------------------------------------------------------- niveau

export const NOTE_INITIALE = 1000;
export const NOTE_MIN = 100;
export const NOTE_MAX = 3200;

/**
 * Nouvelle note de l'élève après un problème (système Elo, comme sur chess.com).
 *
 * - réussi sans aide : un point entier ;
 * - réussi avec un indice : un demi-point (l'aide a un coût) ;
 * - raté : zéro.
 * Les 20 premiers problèmes pèsent plus lourd, pour trouver vite son niveau.
 */
export function nouvelleNote(
  note: number,
  niveauProbleme: number,
  resultat: { reussi: boolean; indice: boolean },
  nbDejaJoues: number,
): number {
  const attendu = 1 / (1 + 10 ** ((niveauProbleme - note) / 400));
  const score = !resultat.reussi ? 0 : resultat.indice ? 0.5 : 1;
  const k = nbDejaJoues < 20 ? 48 : 24;
  const nouvelle = Math.round(note + k * (score - attendu));
  return Math.min(NOTE_MAX, Math.max(NOTE_MIN, nouvelle));
}

/**
 * Choisit le prochain problème : un de ceux dont le niveau est le plus proche
 * de la note de l'élève, parmi ceux qu'il n'a pas encore vus.
 */
export function choisirProbleme(
  tous: ProblemeLichess[],
  note: number,
  vus: Record<string, boolean>,
  hasard: () => number = Math.random,
  themeFiltre: string | null = null,
): ProblemeLichess {
  const dansTheme = themeFiltre ? tous.filter((p) => themeDe(p) === themeFiltre) : tous;
  const source = dansTheme.length ? dansTheme : tous;
  const nonVus = source.filter((p) => !vus[p.id]);
  const liste = nonVus.length ? nonVus : source;
  const proches = [...liste].sort((a, b) => Math.abs(a.rating - note) - Math.abs(b.rating - note)).slice(0, 8);
  return proches[Math.min(proches.length - 1, Math.floor(hasard() * proches.length))];
}

// ------------------------------------------------------------------- thèmes

/** Libellé français du thème principal (montré une fois le problème résolu). */
export const THEMES_FR: Record<string, string> = {
  mateIn1: 'Mat en 1', mateIn2: 'Mat en 2', mateIn3: 'Mat en 3', mateIn4: 'Mat en 4',
  mate: 'Mat', backRankMate: 'Mat du couloir', smotheredMate: 'Mat étouffé',
  anastasiaMate: 'Mat d’Anastasie', arabianMate: 'Mat arabe', bodenMate: 'Mat de Boden',
  doubleBishopMate: 'Mat des deux fous', hookMate: 'Mat du crochet',
  fork: 'Fourchette', pin: 'Clouage', skewer: 'Enfilade', discoveredAttack: 'Attaque à la découverte',
  doubleCheck: 'Double échec', deflection: 'Déviation', attraction: 'Attraction',
  interference: 'Interférence', clearance: 'Dégagement', sacrifice: 'Sacrifice',
  hangingPiece: 'Pièce en prise', trappedPiece: 'Pièce prisonnière', zugzwang: 'Zugzwang',
  quietMove: 'Coup calme', promotion: 'Promotion', enPassant: 'Prise en passant',
  castling: 'Roque', xRayAttack: 'Rayons X', exposedKing: 'Roi exposé',
  capturingDefender: 'Éliminer le défenseur', defensiveMove: 'Coup défensif',
  intermezzo: 'Coup intermédiaire', advancedPawn: 'Pion avancé', equality: 'Égalité',
  advantage: 'Avantage', crushing: 'Gain décisif',
};

const ORDRE_THEMES = Object.keys(THEMES_FR);

/** Thème principal d'un problème : le plus parlant parmi ses étiquettes. */
export function themeDe(p: ProblemeLichess): string {
  return ORDRE_THEMES.find((t) => p.themes.includes(t)) ?? 'advantage';
}

export const libelleTheme = (p: ProblemeLichess): string => THEMES_FR[themeDe(p)] ?? 'Tactique';
