import { createStockfishEngine, DELAIS_DEFAUT, type WorkerLike } from '../stockfish.web';

/**
 * Faux Worker : il répond au protocole UCI comme Stockfish, ou se tait.
 *
 * Les tests qui suivent portent sur le comportement du moteur face à un
 * worker défaillant — muet, planté, arrêté en cours de route — que le vrai
 * Stockfish ne reproduit pas à volonté.
 */
class FauxWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  recu: string[] = [];
  termine = false;

  constructor(
    private readonly comportement: { muetAuDemarrage?: boolean; muetALaRecherche?: boolean } = {},
  ) {}

  /** Envoie une ligne au moteur, comme le ferait Stockfish. */
  dire(ligne: string): void {
    this.onmessage?.({ data: ligne });
  }

  postMessage(message: string): void {
    this.recu.push(message);
    const { muetAuDemarrage, muetALaRecherche } = this.comportement;
    if (message === 'uci' && !muetAuDemarrage) this.repondre('id name Faux', 'uciok');
    if (message === 'isready' && !muetAuDemarrage) this.repondre('readyok');
    if (message.startsWith('go ') && !muetALaRecherche) {
      this.repondre(
        'info depth 8 seldepth 10 multipv 1 score cp 34 nodes 1200 nps 90000 time 13 pv e2e4 e7e5 g1f3',
        'bestmove e2e4 ponder e7e5',
      );
    }
  }

  /** Réponse asynchrone, comme un vrai worker : jamais dans l'appel d'envoi. */
  private repondre(...lignes: string[]): void {
    Promise.resolve().then(() => lignes.forEach((l) => this.dire(l)));
  }

  terminate(): void {
    this.termine = true;
  }
}

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Moteur branché sur des faux workers, avec la liste de ceux qu'il a créés. */
function fabrique(...comportements: ConstructorParameters<typeof FauxWorker>[0][]) {
  const workers: FauxWorker[] = [];
  const creer = jest.fn((_url: string) => {
    const w = new FauxWorker(comportements[workers.length] ?? comportements[comportements.length - 1]);
    workers.push(w);
    return w;
  });
  return { engine: createStockfishEngine('/engine/faux.js', creer), workers, creer };
}

/** Observe une promesse sans la laisser lever : on lit son état au moment voulu. */
function suivre<T>(p: Promise<T>) {
  const etat: { regle: boolean; valeur?: T; erreur?: Error } = { regle: false };
  p.then(
    (valeur) => Object.assign(etat, { regle: true, valeur }),
    (erreur) => Object.assign(etat, { regle: true, erreur }),
  );
  return etat;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Stockfish dans un worker', () => {
  it('démarre puis rend l’analyse de la position', async () => {
    const { engine, workers } = fabrique({});
    const p = engine.analyse(FEN, { depth: 8 });
    await jest.advanceTimersByTimeAsync(0);
    const a = await p;
    expect(a).toEqual({
      best: 'e2e4',
      cp: 34,
      mate: null,
      depth: 8,
      pv: ['e2e4', 'e7e5', 'g1f3'],
      engine: 'stockfish',
    });
    expect(workers[0].recu).toContain(`position fen ${FEN}`);
    expect(workers[0].recu).toContain('go depth 8');
  });

  it('borne la recherche par movetime quand il est donné', async () => {
    const { engine, workers } = fabrique({});
    const p = engine.analyse(FEN, { movetime: 300 });
    await jest.advanceTimersByTimeAsync(0);
    await p;
    expect(workers[0].recu).toContain('go movetime 300');
  });

  it('sérialise les recherches : la seconde attend la fin de la première', async () => {
    const { engine, workers } = fabrique({});
    const p1 = engine.analyse(FEN, { depth: 6 });
    const p2 = engine.analyse(FEN, { depth: 7 });
    await jest.advanceTimersByTimeAsync(0);
    await Promise.all([p1, p2]);
    const go = workers[0].recu.filter((m) => m.startsWith('go '));
    expect(go).toEqual(['go depth 6', 'go depth 7']);
  });

  describe('worker muet au démarrage', () => {
    /**
     * Régression : `boot()` attendait `uciok` sans limite. Un wasm introuvable
     * ou tronqué laissait l'appelant suspendu pour toujours.
     */
    it('échoue après le délai de démarrage, pas avant', async () => {
      const { engine, workers } = fabrique({ muetAuDemarrage: true });
      const etat = suivre(engine.analyse(FEN, { depth: 8 }));
      await jest.advanceTimersByTimeAsync(DELAIS_DEFAUT.demarrageMs - 1);
      expect(etat.regle).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(etat.regle).toBe(true);
      expect(etat.erreur?.message).toMatch(/démarrage/);
      expect(workers[0].termine).toBe(true);
    });

    it('fait échouer aussitôt les appels suivants, sans relancer de worker', async () => {
      const { engine, creer } = fabrique({ muetAuDemarrage: true });
      const premier = suivre(engine.analyse(FEN));
      await jest.advanceTimersByTimeAsync(DELAIS_DEFAUT.demarrageMs);
      expect(premier.erreur).toBeDefined();

      const suivant = suivre(engine.analyse(FEN));
      // aucun avancement du temps : l'échec doit être immédiat
      await jest.advanceTimersByTimeAsync(0);
      expect(suivant.regle).toBe(true);
      expect(suivant.erreur).toBeDefined();
      expect(creer).toHaveBeenCalledTimes(1);
    });

    it('échoue tout de suite quand le worker ne peut même pas être créé', async () => {
      const engine = createStockfishEngine('/x.js', () => {
        throw new Error('SecurityError');
      });
      const etat = suivre(engine.analyse(FEN));
      await jest.advanceTimersByTimeAsync(0);
      expect(etat.erreur?.message).toMatch(/SecurityError/);
    });
  });

  describe('worker qui ne répond pas à la recherche', () => {
    it('échoue à movetime + marge, pas avant', async () => {
      const { engine } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { movetime: 500 }));
      const limite = 500 + DELAIS_DEFAUT.margeRechercheMs;
      await jest.advanceTimersByTimeAsync(limite - 1);
      expect(etat.regle).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(etat.erreur?.message).toMatch(/recherche/);
    });

    it('applique un plafond par défaut aux recherches en profondeur', async () => {
      const { engine } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { depth: 12 }));
      await jest.advanceTimersByTimeAsync(DELAIS_DEFAUT.rechercheDepthMs - 1);
      expect(etat.regle).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(etat.erreur).toBeDefined();
    });

    it('déclare le moteur cassé : la suite échoue vite, sans nouveau worker', async () => {
      const { engine, creer, workers } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { movetime: 100 }));
      await jest.advanceTimersByTimeAsync(100 + DELAIS_DEFAUT.margeRechercheMs);
      expect(etat.erreur).toBeDefined();
      expect(workers[0].termine).toBe(true);

      const suivant = suivre(engine.analyse(FEN, { movetime: 100 }));
      await jest.advanceTimersByTimeAsync(0);
      expect(suivant.erreur).toBeDefined();
      expect(creer).toHaveBeenCalledTimes(1);
    });

    it('ne laisse pas le délai courir après une réponse à temps', async () => {
      const { engine } = fabrique({});
      const p = engine.analyse(FEN, { movetime: 200 });
      await jest.advanceTimersByTimeAsync(0);
      await p;
      // si le minuteur survivait, il casserait le moteur bien après coup
      await jest.advanceTimersByTimeAsync(60_000);
      const encore = engine.analyse(FEN, { movetime: 200 });
      await jest.advanceTimersByTimeAsync(0);
      await expect(encore).resolves.toMatchObject({ best: 'e2e4' });
    });
  });

  describe('dispose', () => {
    /**
     * Régression : `dispose()` mettait `current` à `null` sans rien rejeter.
     * La promesse restait suspendue, avec l'écran de revue qui l'attendait.
     */
    it('rejette la recherche en cours au lieu de l’abandonner', async () => {
      const { engine, workers } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { depth: 10 }));
      await jest.advanceTimersByTimeAsync(0);
      expect(etat.regle).toBe(false);
      engine.dispose();
      await jest.advanceTimersByTimeAsync(0);
      expect(etat.regle).toBe(true);
      expect(etat.erreur?.message).toMatch(/arrêté/);
      expect(workers[0].termine).toBe(true);
    });

    it('rejette aussi le démarrage en cours', async () => {
      const { engine } = fabrique({ muetAuDemarrage: true });
      const etat = suivre(engine.analyse(FEN));
      await jest.advanceTimersByTimeAsync(10);
      engine.dispose();
      await jest.advanceTimersByTimeAsync(0);
      expect(etat.erreur?.message).toMatch(/arrêté/);
    });

    it('rejette les requêtes en file sans relancer de worker', async () => {
      const { engine, creer } = fabrique({ muetALaRecherche: true });
      const premiere = suivre(engine.analyse(FEN, { depth: 10 }));
      const seconde = suivre(engine.analyse(FEN, { depth: 10 }));
      await jest.advanceTimersByTimeAsync(0);
      engine.dispose();
      await jest.advanceTimersByTimeAsync(0);
      expect(premiere.erreur).toBeDefined();
      expect(seconde.erreur?.message).toMatch(/arrêté/);
      expect(creer).toHaveBeenCalledTimes(1);
    });

    it('ne laisse aucun minuteur derrière lui', async () => {
      const { engine } = fabrique({ muetALaRecherche: true });
      suivre(engine.analyse(FEN, { depth: 10 }));
      await jest.advanceTimersByTimeAsync(0);
      engine.dispose();
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('permet de réutiliser le moteur : un worker neuf repart', async () => {
      const { engine, creer } = fabrique({});
      const a = engine.analyse(FEN, { depth: 5 });
      await jest.advanceTimersByTimeAsync(0);
      await a;
      engine.dispose();
      const b = engine.analyse(FEN, { depth: 5 });
      await jest.advanceTimersByTimeAsync(0);
      await expect(b).resolves.toMatchObject({ best: 'e2e4' });
      expect(creer).toHaveBeenCalledTimes(2);
    });
  });

  describe('erreur du worker', () => {
    /**
     * Régression : `onerror` ne rejetait que la promesse de démarrage, déjà
     * réglée. Une erreur en cours de session laissait la recherche en cours
     * sans réponse, et l'appel suivant restait suspendu.
     */
    it('fait échouer la recherche en cours', async () => {
      const { engine, workers } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { depth: 10 }));
      await jest.advanceTimersByTimeAsync(0);
      workers[0].onerror?.({ message: 'wasm crash' });
      await jest.advanceTimersByTimeAsync(0);
      expect(etat.erreur?.message).toMatch(/wasm crash/);
    });

    it('rend le moteur cassé : les appels suivants échouent vite', async () => {
      const { engine, workers, creer } = fabrique({});
      const a = engine.analyse(FEN, { depth: 5 });
      await jest.advanceTimersByTimeAsync(0);
      await a;

      workers[0].onerror?.({ message: 'boom' });
      const suivant = suivre(engine.analyse(FEN, { depth: 5 }));
      await jest.advanceTimersByTimeAsync(0);
      expect(suivant.regle).toBe(true);
      expect(suivant.erreur?.message).toMatch(/boom/);
      expect(creer).toHaveBeenCalledTimes(1);
      expect(workers[0].termine).toBe(true);
    });

    it('ignore les messages tardifs d’un worker arrêté', async () => {
      const { engine, workers } = fabrique({ muetALaRecherche: true });
      const etat = suivre(engine.analyse(FEN, { depth: 10 }));
      await jest.advanceTimersByTimeAsync(0);
      engine.dispose();
      await jest.advanceTimersByTimeAsync(0);
      // le vieux worker parle encore : cela ne doit rien changer
      expect(() => workers[0].dire('bestmove a2a3')).not.toThrow();
      expect(etat.erreur).toBeDefined();
    });
  });
});
