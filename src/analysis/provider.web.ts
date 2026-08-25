/**
 * Choix du moteur d'analyse — version web.
 *
 * Stockfish tourne en WebAssembly dans un Worker. Si le navigateur refuse
 * (Worker indisponible, fichier absent), on retombe silencieusement sur le
 * minimax intégré plutôt que de priver l'élève de tout retour.
 */
import { createLocalEngine } from './local';
import { createStockfishEngine } from './stockfish.web';
import type { Analysis, AnalyseOptions, AnalysisEngine } from './types';

export function createEngine(): AnalysisEngine {
  if (typeof Worker === 'undefined') return createLocalEngine();

  const stockfish = createStockfishEngine();
  const local = createLocalEngine();
  let broken = false;

  return {
    name: 'stockfish',
    async analyse(fen: string, options?: AnalyseOptions): Promise<Analysis> {
      if (broken) return local.analyse(fen, options);
      try {
        return await stockfish.analyse(fen, options);
      } catch {
        broken = true;
        return local.analyse(fen, options);
      }
    },
    dispose() {
      stockfish.dispose();
      local.dispose();
    },
  };
}
