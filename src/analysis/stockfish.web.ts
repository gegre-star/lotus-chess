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
 *
 * **Un worker muet ne doit jamais faire attendre l'interface.** Le fichier
 * `.wasm` peut être introuvable, bloqué ou tronqué par le réseau : le worker
 * se charge alors sans jamais répondre, et sans délai la promesse d'analyse
 * ne se réglerait jamais — l'écran de revue resterait sur « Analyse en
 * cours… » pour toujours. Trois délais y répondent : au démarrage
 * (`uciok`), par recherche (`movetime` + marge, ou une valeur par défaut
 * pour `depth`), et à l'arrêt (`dispose()` rejette la requête en cours).
 * Un délai dépassé ou une erreur du worker rend le moteur **cassé** : les
 * appels suivants échouent aussitôt, et `provider.web.ts` bascule sur le
 * moteur local sans attendre à chaque position.
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

/** Ce que le moteur attend d'un Worker : de quoi le remplacer par un faux dans les tests. */
export interface WorkerLike {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

/** Fabrique de worker, injectable : les tests n'ont ni navigateur ni WebAssembly. */
export type CreerWorker = (url: string) => WorkerLike;

const creerWorkerNavigateur: CreerWorker = (url) => new Worker(url) as unknown as WorkerLike;

/** Délais au-delà desquels le moteur est jugé muet, en millisecondes. */
export interface DelaisStockfish {
  /** Attente de `uciok` puis `readyok` : charger le wasm prend de 1 à 3 s, 10 s est déjà un échec. */
  demarrageMs: number;
  /** Marge ajoutée à `movetime` : le moteur peut dépasser un peu, jamais de plusieurs secondes. */
  margeRechercheMs: number;
  /** Plafond d'une recherche `go depth`, où aucune durée n'est annoncée. */
  rechercheDepthMs: number;
}

export const DELAIS_DEFAUT: DelaisStockfish = {
  demarrageMs: 10_000,
  margeRechercheMs: 4_000,
  rechercheDepthMs: 20_000,
};

interface Pending {
  resolve: (a: Analysis) => void;
  reject: (e: Error) => void;
  acc: UciAccumulator;
}

const messageDe = (event: { message?: string }): string => event.message ?? 'erreur du worker';

export function createStockfishEngine(
  url: string = workerUrl(),
  creerWorker: CreerWorker = creerWorkerNavigateur,
  delais: Partial<DelaisStockfish> = {},
): AnalysisEngine {
  const d: DelaisStockfish = { ...DELAIS_DEFAUT, ...delais };
  let worker: WorkerLike | null = null;
  let ready: Promise<void> | null = null;
  let current: Pending | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  /** Non nul quand le moteur est cassé : tout appel échoue aussitôt avec cette erreur. */
  let casse: Error | null = null;
  /** Fait échouer le démarrage en cours, s'il y en a un. */
  let echecDemarrage: ((e: Error) => void) | null = null;
  let minuteurRecherche: ReturnType<typeof setTimeout> | null = null;
  /**
   * Compte les `dispose()`. Une requête mise en file avant l'arrêt le sait en
   * comparant sa génération à la courante : sans cela, chacune relancerait un
   * worker tout neuf juste après que l'écran l'a démonté.
   */
  let generation = 0;

  const send = (cmd: string) => worker?.postMessage(cmd);

  const finRecherche = () => {
    if (minuteurRecherche) clearTimeout(minuteurRecherche);
    minuteurRecherche = null;
  };

  /** Coupe le worker et fait échouer tout ce qui l'attendait, recherche comme démarrage. */
  function arreter(erreur: Error): void {
    finRecherche();
    const w = worker;
    worker = null;
    ready = null;
    try {
      w?.terminate();
    } catch {
      // un worker déjà mort ne doit pas empêcher de rejeter les requêtes
    }
    const pending = current;
    current = null;
    pending?.reject(erreur);
    const demarrage = echecDemarrage;
    echecDemarrage = null;
    demarrage?.(erreur);
  }

  /** Le moteur ne répond plus : on le coupe, et les appels suivants échouent sans attendre. */
  function casser(erreur: Error): void {
    casse = erreur;
    arreter(erreur);
  }

  /** Démarre le worker et attend `uciok` puis `readyok`. */
  function boot(): Promise<void> {
    if (casse) return Promise.reject(casse);
    if (ready) return ready;
    ready = new Promise<void>((resolve, reject) => {
      let w: WorkerLike;
      try {
        w = creerWorker(url);
      } catch (e) {
        const erreur = new Error(`Stockfish indisponible : ${e instanceof Error ? e.message : String(e)}`);
        casse = erreur;
        ready = null;
        reject(erreur);
        return;
      }
      worker = w;
      // un worker dont le wasm ne se charge pas se tait : sans ce délai,
      // `uciok` ne vient jamais et l'appelant attend sans fin
      const minuteurDemarrage = setTimeout(
        () => casser(new Error('Stockfish indisponible : délai de démarrage dépassé')),
        d.demarrageMs,
      );
      echecDemarrage = (erreur) => {
        clearTimeout(minuteurDemarrage);
        reject(erreur);
      };
      let uciSeen = false;
      w.onmessage = (event) => {
        if (w !== worker) return; // message tardif d'un worker déjà arrêté
        const line = typeof event.data === 'string' ? event.data : String(event.data);
        if (!uciSeen) {
          if (line.startsWith('uciok')) {
            uciSeen = true;
            send('isready');
          }
          return;
        }
        if (line.startsWith('readyok') && current === null) {
          clearTimeout(minuteurDemarrage);
          echecDemarrage = null;
          resolve();
          return;
        }
        if (!current) return;
        current.acc = readInfo(current.acc, line);
        if (line.startsWith('bestmove')) {
          const pending = current;
          current = null;
          finRecherche();
          pending.resolve(toAnalysis(pending.acc, readBestMove(line), 'stockfish'));
        }
      };
      w.onerror = (event) => {
        if (w !== worker) return;
        // une erreur en cours de session laisse le worker dans un état
        // inconnu : mieux vaut le déclarer cassé que d'attendre une réponse
        casser(new Error(`Stockfish indisponible : ${messageDe(event)}`));
      };
      send('uci');
    });
    return ready;
  }

  const arrete = () => new Error('Stockfish arrêté');

  async function run(fen: string, options: AnalyseOptions, gen: number): Promise<Analysis> {
    if (gen !== generation) throw arrete();
    await boot();
    if (gen !== generation) throw arrete();
    return new Promise<Analysis>((resolve, reject) => {
      current = { resolve, reject, acc: emptyAccumulator() };
      // `movetime` fixe la durée de la recherche : on n'attend que la marge en
      // plus. Sans lui, `depth` n'annonce aucune durée, d'où un plafond fixe.
      const delai = options.movetime ? options.movetime + d.margeRechercheMs : d.rechercheDepthMs;
      minuteurRecherche = setTimeout(
        () => casser(new Error('Stockfish indisponible : délai de recherche dépassé')),
        delai,
      );
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
      const gen = generation;
      // une recherche à la fois : Stockfish ignorerait la seconde
      const next = queue.then(
        () => run(fen, options, gen),
        () => run(fen, options, gen),
      );
      queue = next.catch(() => undefined);
      return next;
    },
    dispose() {
      generation += 1;
      // la requête en cours est rejetée plutôt qu'abandonnée : sa promesse
      // resterait sinon en suspens, avec l'écran de revue qui l'attend
      arreter(arrete());
      // un moteur libéré peut resservir : le prochain appel repart d'un worker neuf
      casse = null;
    },
  };
}
