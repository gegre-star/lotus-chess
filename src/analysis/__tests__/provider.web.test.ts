import type { Analysis, AnalysisEngine } from '../types';

/**
 * La bascule Stockfish → moteur local est ce qui empêche un worker défaillant
 * de priver l'élève de sa revue. On la teste avec un Stockfish simulé, le vrai
 * n'étant pas exécutable sous Node/Jest.
 */
const mockStockfish = {
  analyse: jest.fn<Promise<Analysis>, [string, unknown?]>(),
  dispose: jest.fn(),
};

jest.mock('../stockfish.web', () => ({
  createStockfishEngine: () => ({ name: 'stockfish', ...mockStockfish }),
}));

const MAT_EN_UN = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
const globale = globalThis as { Worker?: unknown };

/** Le module se charge après avoir posé (ou non) un `Worker` global. */
function moteur(): AnalysisEngine {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../provider.web').createEngine();
}

const reponseStockfish: Analysis = { best: 'a1a8', cp: null, mate: 1, depth: 12, pv: ['a1a8'], engine: 'stockfish' };

describe('choix du moteur sur le web', () => {
  beforeEach(() => {
    mockStockfish.analyse.mockReset();
    mockStockfish.dispose.mockReset();
    globale.Worker = class {};
  });
  afterEach(() => {
    delete globale.Worker;
  });

  it('prend le moteur local quand le navigateur n’a pas de Worker', async () => {
    delete globale.Worker;
    const e = moteur();
    expect(e.name).toBe('local');
    expect((await e.analyse(MAT_EN_UN, { depth: 4 })).engine).toBe('local');
  });

  it('utilise Stockfish quand il répond', async () => {
    mockStockfish.analyse.mockResolvedValue(reponseStockfish);
    const a = await moteur().analyse(MAT_EN_UN);
    expect(a.engine).toBe('stockfish');
  });

  it('bascule sur le moteur local quand Stockfish échoue, et n’y revient plus', async () => {
    mockStockfish.analyse.mockRejectedValue(new Error('délai de démarrage dépassé'));
    const e = moteur();
    const premiere = await e.analyse(MAT_EN_UN, { depth: 4 });
    const seconde = await e.analyse(MAT_EN_UN, { depth: 4 });
    expect(premiere.engine).toBe('local');
    expect(premiere.best).toBe('a1a8');
    expect(seconde.engine).toBe('local');
    // le moteur cassé n'est pas réinterrogé à chaque position : ce serait
    // attendre à chaque fois son échec
    expect(mockStockfish.analyse).toHaveBeenCalledTimes(1);
  });

  it('ne lance pas de calcul de repli quand l’écran a été fermé en cours de route', async () => {
    let echouer!: (e: Error) => void;
    mockStockfish.analyse.mockReturnValue(new Promise((_, rej) => (echouer = rej)));
    const e = moteur();
    const attente = e.analyse(MAT_EN_UN, { depth: 4 });
    e.dispose();
    echouer(new Error('Stockfish arrêté'));
    await expect(attente).rejects.toThrow(/arrêté/);
    expect(mockStockfish.dispose).toHaveBeenCalled();
  });
});
