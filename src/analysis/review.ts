/**
 * Revue de partie, sur le modèle de chess.com et de lichess.
 *
 * L'ancienne revue n'examinait que les coups de l'élève, à raison de deux
 * analyses par coup, et concluait « X bons coups sur N ». Celle-ci fait **une
 * seule passe** : chacune des N+1 positions de la partie (les N positions
 * d'avant chaque demi-coup, plus la finale) est analysée une fois. Tout le
 * reste s'en déduit, pour les deux camps :
 *
 * - la perte de probabilité de gain de chaque demi-coup, en comparant
 *   l'évaluation de la position d'avant (ce que valait le meilleur coup) et
 *   celle de la position d'après (ce que vaut le coup joué) ;
 * - le meilleur coup de la position d'avant, et sa variante principale ;
 * - le verdict et le texte, par `noterCoup` ;
 * - la précision de chaque joueur, le résumé par catégorie, la courbe
 *   d'évaluation et le coup critique (voir `statistiques.ts`).
 *
 * Une partie de 40 coups coûte 81 analyses au lieu de 2 × 40 pour un seul
 * camp : la revue des deux camps revient moins cher que l'ancienne revue d'un
 * seul, et l'évaluation d'une position sert deux fois (après un coup, avant le
 * suivant).
 */
import { colorOf, inCheck, legalMoves, makeMove, toFEN, toSAN, type Color, type Move, type Position } from '../chess/engine';
import { noterCoup, type Feedback } from '../chess/coaching';
import { toUci } from './local';
import {
  coupCritique,
  courbeDEval,
  precisionJoueur,
  resumerCoups,
  type ResumeCategories,
} from './statistiques';
import { coupDepuisUci } from './uci';
import { whitePov, type Analysis, type AnalysisEngine } from './types';

/** Un demi-coup revu, avec son verdict. Sous-ensemble compatible avec l'ancien écran de jeu. */
export interface CoupRevu extends Feedback {
  san: string;
  /** Numéro du demi-coup dans la partie, à partir de 1. */
  ply: number;
  /** Camp qui a joué ce coup. */
  camp: Color;
  /** Coup joué, au format UCI, pour le tracer sur l'échiquier. */
  joue: string;
  /** Meilleur coup de la position d'avant, pour montrer ce qu'il fallait jouer. */
  meilleur: string | null;
  /** Le même, en notation algébrique, ou `null` s'il n'y en a pas. */
  meilleurSan: string | null;
  /**
   * Variante principale du moteur depuis la position d'avant (coups UCI).
   * Elle commence par `meilleur` ; c'est ce que déroule « Voir la meilleure
   * suite ».
   */
  pv: string[];
}

/**
 * Résultat complet d'une revue.
 *
 * `coups[i]` est le demi-coup joué depuis la position `i` (numérotée de 0 à
 * N, la position 0 étant celle du départ et la position N la finale). Les
 * tableaux `scores` et `courbe` ont donc N+1 valeurs, un par position.
 */
export interface RevueComplete {
  /** Un élément par demi-coup joué, les deux camps mêlés, dans l'ordre. */
  coups: CoupRevu[];
  /**
   * Évaluation de chaque position, en centipions, du point de vue des blancs.
   * Un mat vaut ±(100 000 − distance) ; voir `whitePov`.
   */
  scores: number[];
  /** Les mêmes scores, écrêtés à ±1000 pour l'affichage de la courbe. */
  courbe: number[];
  /**
   * Précision de chaque camp, de 0 à 100, moyenne de la précision de ses
   * coups ; `null` s'il n'a joué aucun coup.
   */
  precision: Record<Color, number | null>;
  /** Nombre de coups de chaque catégorie, par camp. */
  resume: Record<Color, ResumeCategories>;
  /**
   * Indice, dans `coups`, du coup qui a coûté le plus de probabilité de gain
   * (au moins une erreur), ou `null` quand la partie est propre.
   */
  critique: number | null;
  /** Moteur qui a analysé la dernière position, pour informer l'élève. */
  moteur: Analysis['engine'];
  /** Profondeur minimale atteinte : la revue vaut ce que vaut sa position la plus superficielle. */
  profondeur: number;
}

export interface OptionsRevue {
  /** Profondeur demandée à chaque position (10 par défaut). */
  depth?: number;
  /** Plafond de temps par position, transmis au moteur. */
  movetime?: number;
  /**
   * Camp de l'élève : ses coups sont commentés à la deuxième personne, ceux de
   * l'adversaire à la troisième. Par défaut, le camp qui joue le premier coup.
   */
  joueur?: Color;
  /** Appelé après chaque position analysée : `fait` sur `total` (N + 1). */
  onProgress?: (fait: number, total: number) => void;
  /** Interroge l'appelant entre deux positions : vrai pour abandonner la revue. */
  annule?: () => boolean;
}

/** Levée quand `annule` demande d'abandonner : l'écran a été fermé pendant l'analyse. */
export class RevueAnnulee extends Error {
  constructor() {
    super('Revue de partie annulée');
    this.name = 'RevueAnnulee';
  }
}

/**
 * Analyse d'une position sans coup légal, sans interroger le moteur.
 *
 * Les moteurs répondent à peu près la même chose, mais pas exactement (un
 * `bestmove (none)` de Stockfish sans score, un pat rendu comme un mat par le
 * cerveau) : la fin de partie est un cas où l'on connaît la réponse, autant
 * ne pas dépendre d'eux. `mate: 0` veut dire « le camp au trait est maté ».
 */
function analyseTerminale(pos: Position, moteur: Analysis['engine']): Analysis {
  return inCheck(pos, pos.turn)
    ? { best: null, cp: null, mate: 0, depth: 0, pv: [], engine: moteur }
    : { best: null, cp: 0, mate: null, depth: 0, pv: [], engine: moteur };
}

/** Ramène un score « point de vue des blancs » au point de vue d'un camp. */
const pointDeVue = (scoreBlancs: number, camp: Color): number => (camp === 'w' ? scoreBlancs : -scoreBlancs);

/**
 * Analyse toute la partie en une passe et note les deux camps.
 *
 * @param depart position de départ de la partie
 * @param moves  coups joués, dans l'ordre
 * @param sans   notation de chaque coup, si l'appelant l'a déjà ; complétée sinon
 */
export async function analyserPartie(
  engine: AnalysisEngine,
  depart: Position,
  moves: Move[],
  sans: string[] = [],
  options: OptionsRevue = {},
): Promise<RevueComplete> {
  const depth = options.depth ?? 10;
  const joueur = options.joueur ?? depart.turn;
  const total = moves.length + 1;

  // positions[i] : avant le demi-coup i ; positions[N] : la finale
  const positions: Position[] = [depart];
  moves.forEach((m, i) => positions.push(makeMove(positions[i], m)));

  // une position vue deux fois (répétition) ne se calcule qu'une. La clé omet
  // les deux compteurs de la FEN (règle des 50 coups, numéro du coup) : deux
  // occurrences de la même position n'ont jamais les mêmes.
  const cle = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const memoire = new Map<string, Analysis>();
  const analyses: Analysis[] = [];
  let profondeur = Infinity;
  let moteur: Analysis['engine'] = engine.name;

  for (let i = 0; i < positions.length; i += 1) {
    if (options.annule?.()) throw new RevueAnnulee();
    const pos = positions[i];
    let a: Analysis;
    if (legalMoves(pos).length === 0) {
      a = analyseTerminale(pos, moteur);
    } else {
      const fen = toFEN(pos);
      const connue = memoire.get(cle(fen));
      if (connue) {
        a = connue;
      } else {
        a = await engine.analyse(fen, { depth, movetime: options.movetime });
        memoire.set(cle(fen), a);
        profondeur = Math.min(profondeur, a.depth);
        moteur = a.engine;
      }
    }
    analyses.push(a);
    options.onProgress?.(i + 1, total);
  }

  // score de chaque position, point de vue des blancs, avec le vrai trait
  // `|| 0` : le changement de signe d'un score nul rendrait −0, qui s'afficherait
  // et se comparerait de travers
  const scores = analyses.map((a, i) => whitePov(a, positions[i].turn) || 0);

  const coups: CoupRevu[] = moves.map((move, i) => {
    const pos = positions[i];
    const camp = colorOf(pos.board[move.from]) as Color;
    const avant = analyses[i];
    const joue = toUci(move);
    const meilleur = pointDeVue(scores[i], camp);
    // Le coup joué se juge sur l'évaluation de la position d'APRÈS, même quand
    // c'est le coup que le moteur recommandait : la recherche de la position
    // suivante voit deux demi-coups plus loin et peut révéler un piège que la
    // première n'avait pas vu (une gaffe que le moteur lui-même conseillait à
    // profondeur 10 devient alors visible). Forcer « meilleur coup = aucune
    // perte » cachait ces cas. Le bruit entre deux recherches, lui, ne coûte
    // que quelques centipions, sous le seuil du verdict « bon ».
    const evalJoue = pointDeVue(scores[i + 1], camp);
    const feedback = noterCoup({
      pos,
      move,
      meilleur,
      joue: evalJoue,
      voix: camp === joueur ? 'joueur' : 'adversaire',
    });
    const meilleurCoup = avant.best ? coupDepuisUci(pos, avant.best) : null;
    return {
      ...feedback,
      san: sans[i] || toSAN(pos, move),
      ply: i + 1,
      camp,
      joue,
      meilleur: avant.best,
      meilleurSan: meilleurCoup ? toSAN(pos, meilleurCoup) : null,
      pv: avant.pv,
    };
  });

  return {
    coups,
    scores,
    courbe: courbeDEval(scores),
    precision: { w: precisionJoueur(coups, 'w'), b: precisionJoueur(coups, 'b') },
    resume: resumerCoups(coups),
    critique: coupCritique(coups),
    moteur,
    profondeur: Number.isFinite(profondeur) ? profondeur : 0,
  };
}

/**
 * Note les coups d'un seul camp.
 *
 * Conservée pour l'écran de jeu actuel, qui n'affiche que les coups de
 * l'élève : c'est un filtre de `analyserPartie`. Le rappel de progression
 * compte désormais les positions analysées (N + 1) et non plus les coups du
 * camp, puisque la passe couvre toute la partie.
 */
export async function revoirPartie(
  engine: AnalysisEngine,
  depart: Position,
  moves: Move[],
  sans: string[],
  camp: Color,
  options: Omit<OptionsRevue, 'joueur'> = {},
): Promise<CoupRevu[]> {
  const revue = await analyserPartie(engine, depart, moves, sans, { ...options, joueur: camp });
  return revue.coups.filter((c) => c.camp === camp);
}
