/**
 * Ce que produit un toucher sur l'échiquier.
 *
 * Cette décision vivait dans l'écran de jeu, mêlée au score, au coach et aux
 * minuteurs : impossible à tester ailleurs qu'en jouant une partie entière.
 * Or c'est exactement là que se joue le sentiment de bug — « je vois la
 * capture, l'application refuse ». On l'isole donc pour pouvoir la vérifier
 * sur des milliers de positions, en particulier les finales.
 */
import {
  castleByRook,
  colorOf,
  gameStatus,
  inCheck,
  legalMoves,
  movesFrom,
  positionKey,
  type GameStatus,
  type Color,
  type Move,
  type PieceType,
  type Position,
} from './engine';
import { expliquerRefus, expliquerRoque } from './coaching';

/**
 * Temps minimal avant que l'adversaire ne réponde.
 *
 * L'ordinateur répondait en 120 ms : sur un téléphone la pièce était déjà
 * arrivée avant qu'on ait relevé les yeux, et on ne voyait pas ce qui avait
 * bougé. Ce délai n'est pas de l'attente perdue, c'est ce qui rend le coup
 * observable. Partagé par tous les écrans pour que l'application ait un seul
 * rythme.
 */
export const REFLEXION_MIN_MS = 850;

/** Durée d'affichage du fantôme laissé sur la case de départ. */
export const TRACE_MS = 2200;

export type Decision =
  /** Le coup est légal : on le joue. */
  | { type: 'coup'; move: Move }
  /** On change (ou on annule) la pièce sélectionnée. */
  | { type: 'selection'; square: number | null }
  /** Le coup est refusé, et on dit pourquoi. */
  | { type: 'refus'; message: string }
  /**
   * Un pion arrive au bout : c'est à l'élève de choisir la pièce.
   *
   * Promouvoir toujours en dame privait l'élève de la sous-promotion, qui
   * décide parfois de la partie : `8/6P1/5K1k/8/6B1/3B4/8/8`, `g8=D` est pat
   * alors que `g8=C` est mat.
   */
  | { type: 'promotion'; candidats: Move[] };

/**
 * Décide de l'effet d'un toucher sur `square`, la pièce `selected` étant déjà
 * choisie (ou aucune).
 *
 * L'ordre compte : on joue d'abord le coup s'il est légal, sinon on explique.
 * Une explication qui passerait avant priverait l'élève de son coup.
 */
export function toucherCase(
  pos: Position,
  selected: number | null,
  square: number,
  /** Promotion imposée d'avance (leçons) ; absente, on demande à l'élève. */
  promotionAuto?: PieceType,
): Decision {
  if (selected !== null) {
    const candidats = movesFrom(pos, selected).filter((m) => m.to === square);
    if (candidats.length > 0) {
      if (candidats.length > 1 && candidats.every((m) => m.promotion)) {
        const imposee = promotionAuto && candidats.find((m) => m.promotion === promotionAuto);
        return imposee ? { type: 'coup', move: imposee } : { type: 'promotion', candidats };
      }
      return { type: 'coup', move: candidats[0] };
    }
    // toucher sa propre tour est l'autre geste courant pour roquer
    const roque = castleByRook(pos, selected, square);
    if (roque) return { type: 'coup', move: roque };

    // Un refus muet est la première cause de « c'est un bug » : l'élève voit
    // une capture évidente, elle est refusée, et rien ne l'éclaire. On
    // explique d'abord le coup précis qu'il vient de tenter — c'est cela
    // qu'il cherche à comprendre, avant l'état général de la position.
    const pourquoi = expliquerRoque(pos, selected, square) ?? expliquerRefus(pos, selected, square);
    if (pourquoi) return { type: 'refus', message: pourquoi };

    // Sur un échec, annoncer la menace ne suffit pas : quand une seule pièce
    // peut parer, un débutant la cherche, ne la trouve pas, et conclut qu'il
    // est mat. On montre donc les pièces capables de jouer.
    const piece = pos.board[square];
    if (colorOf(piece) !== pos.turn && inCheck(pos, pos.turn)) {
      const parades = new Set(legalMoves(pos).map((m) => m.from));
      return {
        type: 'refus',
        message:
          parades.size === 1
            ? 'Ton roi est en échec, et une seule pièce peut te sauver — elle est marquée.'
            : `Ton roi est en échec. ${parades.size} pièces peuvent parer : elles sont marquées.`,
      };
    }
  }

  const piece = pos.board[square];
  return { type: 'selection', square: colorOf(piece) === pos.turn ? square : null };
}

/** Ce que dit le coach selon la règle de nulle atteinte. */
const NULLES: Record<string, string> = {
  stalemate: 'Pat : le camp au trait n’a plus aucun coup légal et n’est pas en échec. Partie nulle.',
  'draw-fifty': 'Nulle : cinquante coups de chaque côté sans prise ni coup de pion.',
  'draw-material': 'Nulle : il ne reste plus assez de matériel pour mater.',
  'draw-repetition': 'Nulle : la même position est revenue trois fois.',
};

export interface Issue {
  statut: GameStatus;
  /** Résultat du point de vue de l'élève. */
  resultat: 'win' | 'loss' | 'draw';
  message: string;
}

/**
 * La partie est-elle terminée, et comment ?
 *
 * Les nulles de règle manquaient à l'écran de jeu : une finale morte — roi
 * contre roi et fou, cinquante coups sans prise, position revenue trois fois —
 * se poursuivait indéfiniment sans que rien ne le dise. C'est en finale que
 * ces règles décident des parties, donc là qu'elles s'apprennent.
 *
 * `historique` contient les positions qui ont précédé `position`, dans
 * l'ordre : c'est ce que demande la règle de la triple répétition.
 */
export function issueDePartie(
  position: Position,
  historique: Position[],
  camp: Color,
  adversaire: string,
): Issue | null {
  const vues = [...historique, position].map(positionKey);
  const statut = gameStatus(position, vues);
  if (statut === 'ok' || statut === 'check') return null;

  if (statut === 'mate') {
    const vainqueur: Color = position.turn === 'w' ? 'b' : 'w';
    return vainqueur === camp
      ? { statut, resultat: 'win', message: 'Échec et mat — tu as gagné !' }
      : {
          statut,
          resultat: 'loss',
          message: `Échec et mat pour ${adversaire}. Rejoue, tu vas y arriver.`,
        };
  }
  return { statut, resultat: 'draw', message: NULLES[statut] };
}
