/**
 * Choix du moteur d'analyse — version web.
 *
 * Stockfish tourne en WebAssembly dans un Worker. Si le navigateur refuse
 * (Worker indisponible, fichier absent), ou si le worker se tait ou plante en
 * cours de session (délais de `stockfish.web.ts`), on retombe sur le moteur
 * local plutôt que de priver l'élève de tout retour. Le moteur de repli est
 * plafonné en temps : la bascule ne fait jamais geler l'écran.
 */
import { createLocalEngine } from './local';
import { createStockfishEngine } from './stockfish.web';
import type { Analysis, AnalyseOptions, AnalysisEngine } from './types';

export function createEngine(): AnalysisEngine {
  if (typeof Worker === 'undefined') return createLocalEngine();

  const stockfish = createStockfishEngine();
  const local = createLocalEngine();
  let broken = false;
  let disposed = false;

  return {
    name: 'stockfish',
    async analyse(fen: string, options?: AnalyseOptions): Promise<Analysis> {
      // un moteur libéré puis réutilisé repart de zéro (Stockfish se relance)
      disposed = false;
      if (broken) return local.analyse(fen, options);
      try {
        return await stockfish.analyse(fen, options);
      } catch (e) {
        // l'écran a été fermé pendant la recherche : la requête est rejetée
        // par `dispose()`, et personne n'attend plus de réponse — inutile de
        // lancer un calcul de repli pour rien
        if (disposed) throw e;
        broken = true;
        return local.analyse(fen, options);
      }
    },
    dispose() {
      disposed = true;
      stockfish.dispose();
      local.dispose();
    },
  };
}
