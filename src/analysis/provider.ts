/**
 * Choix du moteur d'analyse — version native (iOS, Android).
 *
 * Hermes n'a ni WebAssembly ni Web Worker : Stockfish est hors de portée,
 * on utilise le minimax intégré. Metro remplace ce fichier par
 * `provider.web.ts` lors de la construction web.
 */
import { createLocalEngine } from './local';
import type { AnalysisEngine } from './types';

export const createEngine = (): AnalysisEngine => createLocalEngine();
