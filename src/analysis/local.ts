/**
 * Moteur de repli, utilisé sur iOS, sur Android et quand Stockfish tombe sur le web.
 *
 * Hermes n'exécute ni WebAssembly ni Web Worker : Stockfish y est hors de
 * portée. Ce moteur rend le même objet `Analysis`, pour que les écrans n'aient
 * pas à distinguer les cas.
 *
 * Il repose sur le `Cerveau` (`src/chess/brain`), pas sur le minimax de
 * `ai.ts`. Ce dernier, sans plafond de temps, mettait 12 s à profondeur 3 sur
 * une position de milieu de partie et plus de trois minutes à profondeur 4 :
 * l'application entière gelait pendant une revue de partie, l'interface ne
 * pouvant pas se redessiner pendant qu'un calcul synchrone occupe le seul
 * fil d'exécution. Trois garde-fous l'empêchent désormais :
 *
 * - la **profondeur est plafonnée** (`PROFONDEUR_MAX`) : au-delà, le gain de
 *   justesse ne vaut plus le temps, surtout sur un téléphone ;
 * - un **plafond de temps** borne chaque position, quelle que soit la
 *   profondeur demandée : le calcul s'arrête là où il en est, et la
 *   profondeur réellement atteinte est rendue dans `depth` ;
 * - le moteur **cède la main** à la boucle d'événements avant chaque calcul,
 *   pour que l'écran (barre de progression, boutons) se redessine entre deux
 *   positions d'une revue.
 */
import { Cerveau } from '../chess/brain/cerveau';
import { inCheck, legalMoves, parseFEN, squareName, type Move } from '../chess/engine';
import type { Analysis, AnalyseOptions, AnalysisEngine } from './types';

/** Profondeur maximale acceptée, quelle que soit la demande. */
export const PROFONDEUR_MAX = 10;
/** Temps par position quand l'appelant n'en demande aucun. */
export const TEMPS_DEFAUT_MS = 350;
/** Temps maximal par position, même si l'appelant en demande davantage. */
export const TEMPS_MAX_MS = 800;
/** Un plafond trop bas rendrait une évaluation au hasard : profondeur 1 ou 2. */
export const TEMPS_MIN_MS = 30;

/** Écrit un coup au format UCI, comme le ferait Stockfish. */
export const toUci = (move: Move): string =>
  squareName(move.from) + squareName(move.to) + (move.promotion?.toLowerCase() ?? '');

/** Rend la main à la boucle d'événements : l'interface se redessine avant la suite. */
const ceder = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const borner = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

/**
 * Plafond de temps d'une analyse.
 *
 * `movetime` est un plafond demandé par l'appelant (Stockfish le prend comme
 * durée exacte) ; sans lui, on retient le défaut. Dans les deux cas le maximum
 * du moteur l'emporte : c'est lui qui garantit que l'application ne gèle pas.
 */
export const plafondDeTemps = (options: AnalyseOptions): number =>
  borner(Math.round(options.movetime ?? TEMPS_DEFAUT_MS), TEMPS_MIN_MS, TEMPS_MAX_MS);

export function createLocalEngine(): AnalysisEngine {
  // une seule instance : sa table de transposition, gardée d'une position à
  // l'autre, accélère une revue où chaque position découle de la précédente
  const cerveau = new Cerveau();

  return {
    name: 'local',
    async analyse(fen: string, options: AnalyseOptions = {}): Promise<Analysis> {
      // avant tout calcul, y compris pour une position terminée : l'appelant
      // qui enchaîne les analyses ne doit jamais monopoliser le fil
      await ceder();
      const pos = parseFEN(fen);
      if (legalMoves(pos).length === 0) {
        // `Cerveau.analyser` ne distingue pas le mat du pat : il rend « maté »
        // dans les deux cas, ce qui ferait perdre une partie nulle
        return inCheck(pos, pos.turn)
          ? { best: null, cp: null, mate: 0, depth: 0, pv: [], engine: 'local' }
          : { best: null, cp: 0, mate: null, depth: 0, pv: [], engine: 'local' };
      }
      const a = cerveau.analyser(pos, {
        profondeur: borner(Math.round(options.depth ?? PROFONDEUR_MAX), 1, PROFONDEUR_MAX),
        tempsMs: plafondDeTemps(options),
      });
      return {
        best: a.meilleur,
        cp: a.cp,
        mate: a.mat,
        depth: a.profondeur,
        pv: a.pv,
        engine: 'local',
      };
    },
    dispose() {
      // rien à libérer : tout est synchrone et en mémoire
    },
  };
}
