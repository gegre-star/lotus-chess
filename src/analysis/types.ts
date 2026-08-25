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

/** Valeur d'un mat, en centièmes de pion, avant décote de distance. */
const MAT = 100000;

/**
 * Score ramené du point de vue des blancs, pour comparer deux analyses.
 *
 * `mate: 0` ne veut pas dire « pas de mat » mais « le camp au trait est maté
 * en ce moment même » : c'est ce que répond le moteur sur une position déjà
 * terminée. Le traiter comme les autres via `Math.sign` donnerait zéro et
 * ferait passer un mat porté pour une gaffe — le coup gagnant serait noté
 * comme le pire de la partie.
 */
export const whitePov = (a: Analysis, turn: 'w' | 'b'): number => {
  let raw: number;
  if (a.mate === null) {
    raw = a.cp ?? 0;
  } else if (a.mate === 0) {
    raw = -MAT;
  } else {
    raw = Math.sign(a.mate) * (MAT - Math.abs(a.mate));
  }
  return turn === 'w' ? raw : -raw;
};
