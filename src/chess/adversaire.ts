/**
 * Choisit le coup de l'ordinateur.
 *
 * Trois sources, dans cet ordre : le répertoire d'ouvertures, Stockfish quand
 * il est disponible et que l'adversaire est assez fort pour lui, et enfin le
 * cerveau maison. Un échec de Stockfish (worker qui ne démarre pas, délai
 * dépassé) ne bloque jamais la partie : le cerveau reprend.
 */
import type { AnalysisEngine } from '../analysis/types';
import { ELO_MAX, ELO_MIN } from '../analysis/types';
import { Cerveau } from './brain/cerveau';
import { NIVEAUX, niveauPourElo, partLivre } from './brain/niveaux';
import { findMove, parseFEN, squareFromName, toFEN, type Move, type PieceType } from './engine';
import { coupDeLivre } from './ouvertures';
import type { Partie } from './partie';

export interface Moteurs {
  /** Stockfish, ou un moteur de repli. `name` dit lequel répond. */
  analyse: AnalysisEngine | null;
  cerveau: Cerveau;
}

/** Délai maximal accordé à Stockfish avant de se rabattre sur le cerveau. */
const DELAI_STOCKFISH_MS = 6000;

const coupDepuisUci = (fen: string, uci: string): Move | null => {
  const pos = parseFEN(fen);
  const promo = uci.length > 4 ? (uci[4].toUpperCase() as PieceType) : undefined;
  return (
    findMove(pos, squareFromName(uci.slice(0, 2)), squareFromName(uci.slice(2, 4)), promo) ?? null
  );
};

/** Temps de réflexion de Stockfish, croissant avec la force demandée. */
const tempsStockfish = (elo: number): number => Math.round(250 + ((elo - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 800);

const avecDelai = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('délai dépassé')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

export async function coupAdverse(
  partie: Partie,
  moteurs: Moteurs,
  hasard: () => number = Math.random,
): Promise<Move | null> {
  const { bot, position } = partie;
  const fen = toFEN(position);

  if (hasard() < partLivre(bot.elo)) {
    const livre = coupDeLivre(position, hasard);
    if (livre) return livre;
  }

  if (bot.stockfish && moteurs.analyse?.name === 'stockfish') {
    try {
      const a = await avecDelai(
        moteurs.analyse.analyse(fen, { elo: bot.elo, movetime: tempsStockfish(bot.elo) }),
        DELAI_STOCKFISH_MS,
      );
      const coup = a.best ? coupDepuisUci(fen, a.best) : null;
      if (coup) return coup;
    } catch {
      // Stockfish en panne : on ne bloque pas la partie pour autant
    }
  }

  const niveau = bot.stockfish ? niveauPourElo(bot.elo) : (NIVEAUX[bot.id] ?? niveauPourElo(bot.elo));
  return moteurs.cerveau.penser(position, niveau, {
    coups: partie.moves,
    historique: partie.history,
    hasard,
  });
}
