/**
 * Stockfish 18 Lite, exécuté dans un Web Worker.
 *
 * Le build retenu est `lite-single` : les variantes multi-thread réclament
 * `SharedArrayBuffer`, donc les en-têtes `Cross-Origin-Opener-Policy` et
 * `Cross-Origin-Embedder-Policy`, que GitHub Pages ne permet pas de définir.
 * `lite-single` tourne sans isolation d'origine.
 *
 * Les requêtes sont sérialisées : un seul `go` à la fois, les suivantes
 * attendent leur tour. Stockfish est monoprocessus et n'accepte pas deux
 * recherches simultanées.
 */
import { emptyAccumulator, readBestMove, readInfo, toAnalysis, type UciAccumulator } from './uci';
import { ELO_MAX, ELO_MIN, type Analysis, type AnalyseOptions, type AnalysisEngine } from './types';

/**
 * Chemin du worker, préfixé par la base de déploiement.
 *
 * `process.env.EXPO_BASE_URL` vaut le sous-dossier déclaré dans `app.json`
 * (`experiments.baseUrl`) et est remplacé par sa valeur littérale à la
 * construction. Il faut l'écrire sous cette forme exacte : avec un `?.` ou
 * une variable intermédiaire la substitution n'a pas lieu, et le worker
 * serait cherché à la racine du domaine.
 */
function workerUrl(): string {
  const base = process.env.EXPO_BASE_URL || '';
  return `${base.replace(/\/$/, '')}/engine/stockfish-18-lite-single.js`;
}

interface Pending {
  resolve: (a: Analysis) => void;
  reject: (e: Error) => void;
  acc: UciAccumulator;
}

export function createStockfishEngine(url: string = workerUrl()): AnalysisEngine {
  let worker: Worker | null = null;
  let ready: Promise<void> | null = null;
  let current: Pending | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  const send = (cmd: string) => worker?.postMessage(cmd);

  /** Démarre le worker et attend `uciok` puis `readyok`. */
  function boot(): Promise<void> {
    if (ready) return ready;
    ready = new Promise<void>((resolve, reject) => {
      worker = new Worker(url);
      let uciSeen = false;
      worker.onmessage = (event: MessageEvent) => {
        const line = typeof event.data === 'string' ? event.data : String(event.data);
        if (!uciSeen) {
          if (line.startsWith('uciok')) {
            uciSeen = true;
            send('isready');
          }
          return;
        }
        if (line.startsWith('readyok') && current === null) {
          resolve();
          return;
        }
        if (!current) return;
        current.acc = readInfo(current.acc, line);
        if (line.startsWith('bestmove')) {
          const pending = current;
          current = null;
          pending.resolve(toAnalysis(pending.acc, readBestMove(line), 'stockfish'));
        }
      };
      worker.onerror = (event: ErrorEvent) => {
        const error = new Error(`Stockfish indisponible : ${event.message ?? 'erreur du worker'}`);
        current?.reject(error);
        current = null;
        reject(error);
      };
      send('uci');
    });
    return ready;
  }

  async function run(fen: string, options: AnalyseOptions): Promise<Analysis> {
    await boot();
    return new Promise<Analysis>((resolve, reject) => {
      current = { resolve, reject, acc: emptyAccumulator() };
      send('ucinewgame');
      // la force se règle avant chaque recherche : la même instance sert tour
      // à tour d'adversaire bridé et d'analyste à pleine force
      if (options.elo === undefined) {
        send('setoption name UCI_LimitStrength value false');
      } else {
        const elo = Math.min(ELO_MAX, Math.max(ELO_MIN, Math.round(options.elo)));
        send('setoption name UCI_LimitStrength value true');
        send(`setoption name UCI_Elo value ${elo}`);
      }
      send(`position fen ${fen}`);
      send(options.movetime ? `go movetime ${options.movetime}` : `go depth ${options.depth ?? 12}`);
    });
  }

  return {
    name: 'stockfish',
    analyse(fen: string, options: AnalyseOptions = {}): Promise<Analysis> {
      // une recherche à la fois : Stockfish ignorerait la seconde
      const next = queue.then(
        () => run(fen, options),
        () => run(fen, options),
      );
      queue = next.catch(() => undefined);
      return next;
    },
    dispose() {
      worker?.terminate();
      worker = null;
      ready = null;
      current = null;
    },
  };
}
