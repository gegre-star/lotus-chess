/**
 * Une partie contre l'ordinateur, sans rien d'autre que ses données.
 *
 * L'écran de jeu mêlait tout : règles, score, dialogues, minuteurs, avec des
 * effets de bord cachés dans les fonctions passées à `setState`. Un défaut
 * prouvé en est sorti : « Annuler » après une fin de partie la remettait en
 * cours, et chaque nouvelle fin recomptait la victoire ou la défaite — de
 * quoi gonfler son classement en boucle.
 *
 * Ici la partie est une valeur : chaque opération en rend une nouvelle, et
 * aucune ne touche à la progression. C'est l'écran qui décide, une fois, quand
 * elle se termine.
 */
import type { Bot } from './content';
import {
  START_FEN,
  findMove,
  legalMoves,
  makeMove,
  parseFEN,
  squareFromName,
  squareName,
  toSAN,
  type Color,
  type Move,
  type PieceType,
  type Position,
} from './engine';
import { issueDePartie } from './interaction';
import type { Pendule } from './pendule';

export type ResultatPartie = 'win' | 'loss' | 'draw';

export interface Fin {
  statut: string;
  /** Du point de vue de l'élève. */
  resultat: ResultatPartie;
  message: string;
}

export interface Partie {
  /** Identifiant propre à cette partie : un calcul périmé ne joue jamais dans la suivante. */
  id: string;
  bot: Bot;
  /** Camp de l'élève. */
  side: Color;
  position: Position;
  /** Positions précédant chaque coup, dans l'ordre. */
  history: Position[];
  moves: Move[];
  /** Coups en notation française, pour l'affichage. */
  sans: string[];
  fin: Fin | null;
  /** Vrai une fois la victoire ou la défaite comptée : on ne la compte qu'une fois. */
  scoree: boolean;
  /**
   * Nombre de coups repris. Une partie où l'on a repris un coup devient une
   * partie d'entraînement : elle ne change ni le classement ni les points.
   * Sans cela, reprendre chaque gaffe revenait à ne jamais perdre.
   */
  annulations: number;
  /**
   * Nombre d'indices demandés. Un indice donne le coup : comme un coup repris,
   * il fait de la partie une partie d'entraînement.
   */
  indices: number;
  debut: number;
  pendule: Pendule | null;
}

let compteur = 0;
const nouvelId = (): string => `${Date.now().toString(36)}-${(compteur += 1)}`;

/**
 * Une partie neuve. `depart` permet de la commencer ailleurs qu'au début —
 * une finale, une position d'entraînement.
 */
export function nouvellePartie(
  bot: Bot,
  side: Color,
  pendule: Pendule | null = null,
  depart?: Position,
): Partie {
  return {
    id: nouvelId(),
    bot,
    side,
    position: depart ?? parseFEN(START_FEN),
    history: [],
    moves: [],
    sans: [],
    fin: null,
    scoree: false,
    annulations: 0,
    indices: 0,
    debut: Date.now(),
    pendule,
  };
}

/** Le camp de l'ordinateur. */
export const campBot = (p: Partie): Color => (p.side === 'w' ? 'b' : 'w');

/** Est-ce à l'ordinateur de jouer ? */
export const auBot = (p: Partie): boolean => p.fin === null && p.position.turn === campBot(p);

/** Joue un coup. La fin de partie éventuelle est calculée ici, pas dans l'écran. */
export function jouer(p: Partie, coup: Move): Partie {
  if (p.fin) return p;
  const avant = p.position;
  const apres = makeMove(avant, coup);
  const historique = [...p.history, avant];
  const suivante: Partie = {
    ...p,
    position: apres,
    history: historique,
    moves: [...p.moves, coup],
    sans: [...p.sans, toSAN(avant, coup, apres)],
  };
  const issue = issueDePartie(apres, historique, p.side, p.bot.nom);
  return issue
    ? { ...suivante, fin: { statut: issue.statut, resultat: issue.resultat, message: issue.message } }
    : suivante;
}

/**
 * Retire le dernier coup de l'élève, et la réponse de l'ordinateur avec lui.
 *
 * Impossible une fois la partie terminée : reprendre un coup après le mat
 * annule la défaite sur l'échiquier mais pas dans le classement, et permettait
 * de rejouer la fin autant de fois qu'on voulait.
 */
export function annuler(p: Partie): Partie {
  if (p.fin || p.history.length === 0) return p;
  let index = p.history.length - 1;
  // on remonte aussi le coup de l'ordinateur, pour rendre la main à l'élève
  if (index > 0 && p.history[index].turn !== p.side) index -= 1;
  // si c'est à l'élève de jouer d'emblée (il a les noirs et le bot a ouvert),
  // on ne remonte pas avant le premier coup de l'ordinateur
  if (p.side === 'b' && index === 0) return p;
  return {
    ...p,
    position: p.history[index],
    history: p.history.slice(0, index),
    moves: p.moves.slice(0, index),
    sans: p.sans.slice(0, index),
    annulations: p.annulations + 1,
  };
}

export function abandonner(p: Partie): Partie {
  if (p.fin) return p;
  return {
    ...p,
    fin: { statut: 'abandon', resultat: 'loss', message: 'Tu as abandonné la partie.' },
  };
}

/**
 * Fin sur le temps : le camp dont le drapeau tombe perd — sauf si l'autre
 * n'a plus de quoi mater, auquel cas la partie est nulle (règle de la FIDE).
 */
export function perdreAuTemps(p: Partie, camp: Color, autreNePeutMater: boolean): Partie {
  if (p.fin) return p;
  if (autreNePeutMater) {
    return {
      ...p,
      fin: {
        statut: 'temps-nulle',
        resultat: 'draw',
        message: 'Temps écoulé, mais l’adversaire ne peut plus mater : partie nulle.',
      },
    };
  }
  const moi = camp === p.side;
  return {
    ...p,
    fin: {
      statut: 'temps',
      resultat: moi ? 'loss' : 'win',
      message: moi ? 'Ton temps est écoulé.' : `${p.bot.nom} n’a plus de temps : tu gagnes !`,
    },
  };
}

/** La partie compte-t-elle pour le classement ? Ni coup repris, ni indice. */
export const estClassee = (p: Partie): boolean => p.annulations === 0 && p.indices === 0;

/** Enregistre qu'un indice a été demandé. */
export const avecIndice = (p: Partie): Partie => ({ ...p, indices: p.indices + 1 });

/** Marque la partie comme comptée. */
export const marquerScoree = (p: Partie): Partie => (p.scoree ? p : { ...p, scoree: true });

// ------------------------------------------------------------ sauvegarde

export interface Sauvegarde {
  v: 1;
  botId: string;
  /** Le classement du bot au moment de la partie (les niveaux de Stockfish en ont plusieurs). */
  botElo: number;
  side: Color;
  /** Coups en notation UCI. */
  moves: string[];
  annulations: number;
  indices: number;
  debut: number;
  pendule: Pendule | null;
}

const uci = (m: Move): string =>
  `${squareName(m.from)}${squareName(m.to)}${m.promotion ? m.promotion.toLowerCase() : ''}`;

export function versSauvegarde(p: Partie): Sauvegarde {
  return {
    v: 1,
    botId: p.bot.id,
    botElo: p.bot.elo,
    side: p.side,
    moves: p.moves.map(uci),
    annulations: p.annulations,
    indices: p.indices,
    debut: p.debut,
    pendule: p.pendule,
  };
}

/**
 * Reconstruit une partie sauvegardée en la rejouant coup par coup.
 *
 * Rend `null` si quoi que ce soit ne colle pas — bot inconnu, coup illégal,
 * données abîmées : on préfère perdre une partie que d'en afficher une fausse.
 */
export function depuisSauvegarde(sauve: unknown, bots: Bot[]): Partie | null {
  if (!sauve || typeof sauve !== 'object') return null;
  const s = sauve as Partial<Sauvegarde>;
  if (s.v !== 1 || !Array.isArray(s.moves) || (s.side !== 'w' && s.side !== 'b')) return null;
  const bot = bots.find((b) => b.id === s.botId);
  if (!bot) return null;
  const elo = typeof s.botElo === 'number' && Number.isFinite(s.botElo) ? s.botElo : bot.elo;

  let partie = nouvellePartie({ ...bot, elo }, s.side, null);
  for (const texte of s.moves) {
    if (typeof texte !== 'string' || !/^[a-h][1-8][a-h][1-8][nbrq]?$/.test(texte)) return null;
    const promo = texte.length > 4 ? (texte[4].toUpperCase() as PieceType) : undefined;
    const coup = findMove(
      partie.position,
      squareFromName(texte.slice(0, 2)),
      squareFromName(texte.slice(2, 4)),
      promo,
    );
    if (!coup) return null;
    partie = jouer(partie, coup);
    if (partie.fin) return null; // une partie terminée ne se reprend pas
  }
  return {
    ...partie,
    annulations:
      typeof s.annulations === 'number' && s.annulations > 0 ? Math.floor(s.annulations) : 0,
    indices: typeof s.indices === 'number' && s.indices > 0 ? Math.floor(s.indices) : 0,
    debut: typeof s.debut === 'number' ? s.debut : Date.now(),
    pendule: s.pendule ?? null,
  };
}

/** Les coups légaux de la position courante, pour l'écran. */
export const coupsPossibles = (p: Partie): Move[] => legalMoves(p.position);
