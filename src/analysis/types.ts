/**
 * Couche d'analyse — interface commune aux deux moteurs.
 *
 * Sur le web, Lotus Chess délègue à Stockfish (WebAssembly). Sur iOS et
 * Android, Hermes n'exécute ni WebAssembly ni Web Worker : on retombe sur le
 * minimax intégré (`src/chess/ai.ts`), moins fort mais suffisant pour noter
 * les coups d'un débutant.
 *
 * Les deux implémentations rendent le même objet, pour que l'interface n'ait
 * jamais à savoir lequel des deux répond.
 */

/** Un coup au format UCI : `e2e4`, `e7e8q` pour une promotion. */
export type UciMove = string;

export interface Analysis {
  /** Meilleur coup trouvé, ou `null` si la position est terminée. */
  best: UciMove | null;
  /**
   * Évaluation en centièmes de pion, du point de vue du camp au trait.
   * `null` quand un mat est annoncé.
   */
  cp: number | null;
  /**
   * Nombre de coups avant le mat, du point de vue du camp au trait.
   * Positif si c'est lui qui mate, négatif s'il est maté.
   */
  mate: number | null;
  /** Profondeur atteinte. */
  depth: number;
  /** Variante principale, coups UCI dans l'ordre. */
  pv: UciMove[];
  /** Nom du moteur qui a répondu, pour l'affichage et le diagnostic. */
  engine: 'stockfish' | 'local';
}

export interface AnalyseOptions {
  /** Profondeur demandée. */
  depth?: number;
  /** Plafond de temps en millisecondes. */
  movetime?: number;
}

export interface AnalysisEngine {
  readonly name: 'stockfish' | 'local';
  /** Analyse une position donnée en FEN. */
  analyse(fen: string, options?: AnalyseOptions): Promise<Analysis>;
  /** Libère les ressources (worker, mémoire). */
  dispose(): void;
}

/** Score ramené du point de vue des blancs, pour comparer deux analyses. */
export const whitePov = (a: Analysis, turn: 'w' | 'b'): number => {
  const raw = a.mate !== null ? Math.sign(a.mate) * (100000 - Math.abs(a.mate)) : (a.cp ?? 0);
  return turn === 'w' ? raw : -raw;
};
