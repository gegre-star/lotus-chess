/**
 * Génération et comportement du service worker.
 *
 * Deux niveaux : la génération (liste de fichiers -> source + version), et le
 * comportement, en exécutant la source générée dans un bac à sable qui simule
 * `caches`, `fetch` et les événements du worker. La preuve en vrai navigateur
 * est décrite dans docs/livraison.md ; ces tests, eux, tournent en CI.
 */
const vm = require('node:vm');
const {
  normaliserBase,
  classer,
  genererServiceWorker,
  scriptEnregistrement,
} = require('../service-worker.js');

const fichier = (chemin, contenu = chemin) => ({ chemin, contenu: Buffer.from(contenu) });

const DOSSIER = [
  fichier('index.html', '<html>v1</html>'),
  fichier('404.html', '<html>v1</html>'),
  fichier('manifest.webmanifest', '{}'),
  fichier('icone-192.png'),
  fichier('icone-512.png'),
  fichier('icone-maskable-512.png'),
  fichier('metadata.json'),
  fichier('_expo/static/js/web/entry-abc.js', 'bundle-1'),
  fichier('assets/__lotus/node_modules/@react-navigation/elements/lib/back-icon.png'),
  fichier('engine/stockfish-18-lite-single.js', 'sf-js'),
  fichier('engine/stockfish-18-lite-single.wasm', 'sf-wasm'),
  fichier('engine/README.md'),
  fichier('engine/LICENSE-stockfish.txt'),
];

const generer = (fichiers = DOSSIER, base = '/lotus-chess') => genererServiceWorker({ base, fichiers });

describe('normaliserBase', () => {
  it('retire la barre finale et accepte la racine', () => {
    expect(normaliserBase('/lotus-chess/')).toBe('/lotus-chess');
    expect(normaliserBase('')).toBe('');
    expect(normaliserBase('/')).toBe('');
    expect(normaliserBase(undefined)).toBe('');
    expect(normaliserBase('lotus-chess')).toBe('/lotus-chess');
  });

  it('refuse ce qui pourrait sortir d\'un attribut HTML ou d\'une chaîne JS', () => {
    for (const mauvaise of ['/a"b', "/a'b", '/a b', '/a<b', '/a\\b', '//x']) {
      expect(() => normaliserBase(mauvaise)).toThrow(/LOTUS_BASE_URL invalide/);
    }
  });
});

describe('classer', () => {
  it('précache l\'application et le moteur (licence comprise), pas le reste', () => {
    const { urlsApp, urlsMoteur } = classer(
      DOSSIER.map((f) => f.chemin),
      '/lotus-chess',
    );
    expect(urlsApp).toEqual([
      '/lotus-chess/_expo/static/js/web/entry-abc.js',
      '/lotus-chess/assets/__lotus/node_modules/@react-navigation/elements/lib/back-icon.png',
      '/lotus-chess/icone-192.png',
      '/lotus-chess/icone-512.png',
      '/lotus-chess/icone-maskable-512.png',
      '/lotus-chess/index.html',
      '/lotus-chess/manifest.webmanifest',
    ]);
    // avec sa licence et son offre de source : la GPL les veut à côté du binaire, hors ligne aussi
    expect(urlsMoteur).toEqual([
      '/lotus-chess/engine/LICENSE-stockfish.txt',
      '/lotus-chess/engine/README.md',
      '/lotus-chess/engine/stockfish-18-lite-single.js',
      '/lotus-chess/engine/stockfish-18-lite-single.wasm',
    ]);
  });

  it('encode les caractères qui le demandent, segment par segment', () => {
    const { urlsApp } = classer(['assets/un dossier/é#.png'], '/x');
    expect(urlsApp).toEqual(['/x/assets/un%20dossier/%C3%A9%23.png']);
  });

  it('sert à la racine quand la base est vide', () => {
    expect(classer(['index.html'], '').urlsApp).toEqual(['/index.html']);
  });
});

describe('genererServiceWorker', () => {
  it('produit du JavaScript valide qui porte sa configuration', () => {
    const { source, version } = generer();
    expect(() => new vm.Script(source)).not.toThrow();
    expect(source).toContain(`"version": "${version}"`);
    expect(source).toContain('"index": "/lotus-chess/index.html"');
    expect(source).not.toContain('/*CONFIG*/');
  });

  it('est déterministe et indépendant de l\'ordre des fichiers', () => {
    expect(generer([...DOSSIER].reverse()).source).toBe(generer().source);
  });

  it('change de version dès qu\'un fichier précaché change', () => {
    const v1 = generer().version;
    const modifie = DOSSIER.map((f) => (f.chemin === 'index.html' ? fichier('index.html', '<html>v2</html>') : f));
    expect(generer(modifie).version).not.toBe(v1);
    const renomme = DOSSIER.map((f) =>
      f.chemin.endsWith('entry-abc.js') ? fichier('_expo/static/js/web/entry-def.js', 'bundle-1') : f,
    );
    expect(generer(renomme).version).not.toBe(v1);
  });

  it('ignore ce qui n\'est pas précaché : notes à la racine, 404.html, sw.js précédent', () => {
    const v1 = generer().version;
    const avecBruit = [...DOSSIER, fichier('sw.js', 'ancien sw'), fichier('notes.md', 'x')].map((f) =>
      f.chemin === '404.html' ? fichier('404.html', 'autre') : f,
    );
    expect(generer(avecBruit).version).toBe(v1);
  });

  it('garde la version du moteur quand seule l\'interface change', () => {
    const a = generer();
    const modifie = DOSSIER.map((f) => (f.chemin.endsWith('entry-abc.js') ? fichier(f.chemin, 'bundle-2') : f));
    const b = generer(modifie);
    expect(b.version).not.toBe(a.version);
    expect(b.versionMoteur).toBe(a.versionMoteur);
    const moteurModifie = DOSSIER.map((f) => (f.chemin.endsWith('.wasm') ? fichier(f.chemin, 'sf-wasm-2') : f));
    expect(generer(moteurModifie).versionMoteur).not.toBe(a.versionMoteur);
  });

  it('change de version quand la base ou le modèle changent', () => {
    expect(generer(DOSSIER, '/autre').version).not.toBe(generer().version);
    const modele = 'const CONFIG = /*CONFIG*/ {};\n// stratégie A';
    const modeleB = 'const CONFIG = /*CONFIG*/ {};\n// stratégie B';
    const a = genererServiceWorker({ base: '/x', fichiers: DOSSIER, modele });
    const b = genererServiceWorker({ base: '/x', fichiers: DOSSIER, modele: modeleB });
    expect(a.version).not.toBe(b.version);
  });

  it('échoue bruyamment quand un élément indispensable manque', () => {
    const sans = (motif) => DOSSIER.filter((f) => !motif.test(f.chemin));
    expect(() => generer(sans(/^index\.html$/))).toThrow(/index\.html absent/);
    expect(() => generer(sans(/^_expo/))).toThrow(/aucun bundle/);
    expect(() => generer(sans(/\.wasm$/))).toThrow(/moteur Stockfish/);
    expect(() => generer(sans(/^engine\/.*\.js$/))).toThrow(/moteur Stockfish/);
  });

  it('refuse un modèle sans marqueur ou avec deux', () => {
    expect(() => genererServiceWorker({ base: '', fichiers: DOSSIER, modele: 'rien' })).toThrow(/exactement un marqueur/);
    expect(() =>
      genererServiceWorker({ base: '', fichiers: DOSSIER, modele: '/*CONFIG*/ {} /*CONFIG*/ {}' }),
    ).toThrow(/exactement un marqueur/);
  });
});

describe('scriptEnregistrement', () => {
  it('vise sw.js à la racine de la portée, sans dépendre du cache HTTP', () => {
    const script = scriptEnregistrement('/lotus-chess');
    expect(() => new vm.Script(script)).not.toThrow();
    expect(script).toContain("register('/lotus-chess/sw.js',{scope:'/lotus-chess/',updateViaCache:'none'})");
    expect(scriptEnregistrement('')).toContain("register('/sw.js',{scope:'/',updateViaCache:'none'})");
  });

  it('ne fait rien sans support des service workers, et n\'échoue jamais bruyamment', () => {
    const appels = [];
    const bac = {
      navigator: {},
      addEventListener: (nom) => appels.push(nom),
      document: {},
    };
    vm.runInNewContext(scriptEnregistrement('/x'), bac);
    expect(appels).toEqual([]);
  });

  it('enregistre au chargement puis redemande une mise à jour au retour au premier plan', async () => {
    const journal = [];
    const ecouteursDoc = {};
    const bac = {
      navigator: {
        serviceWorker: {
          register: (url, options) => {
            journal.push(['register', url, options]);
            return Promise.resolve({ update: () => (journal.push(['update']), Promise.resolve()) });
          },
        },
      },
      document: {
        visibilityState: 'visible',
        addEventListener: (nom, f) => (ecouteursDoc[nom] = f),
      },
      console,
    };
    let auChargement;
    bac.addEventListener = (nom, f) => nom === 'load' && (auChargement = f);
    vm.runInNewContext(scriptEnregistrement('/x'), bac);
    expect(journal).toEqual([]); // rien avant `load`
    auChargement();
    await Promise.resolve();
    await Promise.resolve();
    expect(journal[0]).toEqual(['register', '/x/sw.js', { scope: '/x/', updateViaCache: 'none' }]);
    ecouteursDoc.visibilitychange();
    expect(journal[1]).toEqual(['update']);
  });
});

/**
 * Bac à sable minimal d'un service worker : Cache Storage, fetch et
 * distribution des événements.
 */
function monterWorker({ fichiersServeur, cachesInitiaux = {}, base = '/lotus-chess' }) {
  const stockage = new Map(
    Object.entries(cachesInitiaux).map(([nom, entrees]) => [nom, new Map(Object.entries(entrees))]),
  );
  const cle = (r) => (typeof r === 'string' ? r : r.url).replace(/^https:\/\/exemple\.test/, '');
  const journalReseau = [];
  const reponse = (corps, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    type: 'basic',
    corps,
    clone() {
      return { ...this };
    },
  });
  const caches = {
    async open(nom) {
      if (!stockage.has(nom)) stockage.set(nom, new Map());
      const cache = stockage.get(nom);
      return {
        async match(r) {
          return cache.get(cle(r));
        },
        async put(r, rep) {
          cache.set(cle(r), rep);
        },
      };
    },
    async keys() {
      return [...stockage.keys()];
    },
    async delete(nom) {
      return stockage.delete(nom);
    },
  };
  class Request {
    constructor(url, options = {}) {
      this.url = url.startsWith('http') ? url : `https://exemple.test${url}`;
      this.method = options.method ?? 'GET';
      this.mode = options.mode ?? 'cors';
      this.cache = options.cache;
      this.headers = { has: (n) => (options.headers ?? {})[n.toLowerCase()] !== undefined };
    }
  }
  const ecouteurs = {};
  const etat = { skipWaiting: 0, claim: 0 };
  const self = {
    location: { origin: 'https://exemple.test' },
    addEventListener: (nom, f) => (ecouteurs[nom] = f),
    skipWaiting: async () => void etat.skipWaiting++,
    clients: { claim: async () => void etat.claim++ },
  };
  const fetch = async (requete) => {
    const r = typeof requete === 'string' ? new Request(requete) : requete;
    journalReseau.push({ url: cle(r), cache: r.cache });
    const contenu = fichiersServeur[cle(r)];
    return contenu === undefined ? reponse('introuvable', 404) : reponse(contenu);
  };
  const bac = { self, caches, fetch, Request, URL, Promise, Set, console };
  vm.runInNewContext(genererServiceWorker({ base, fichiers: DOSSIER }).source, bac);

  const evenement = (extra = {}) => {
    const attentes = [];
    return { attentes, waitUntil: (p) => attentes.push(p), ...extra };
  };
  return {
    stockage,
    etat,
    journalReseau,
    async lancer(nom) {
      const e = evenement();
      ecouteurs[nom](e);
      await Promise.all(e.attentes);
    },
    /** Renvoie la réponse fournie par le worker, ou `null` s'il laisse passer la requête. */
    async requete(url, options = {}) {
      const request = new Request(url, options);
      let promesse = null;
      const e = evenement({ request, respondWith: (p) => (promesse = p) });
      ecouteurs.fetch(e);
      const rep = promesse ? await promesse : null;
      await Promise.all(e.attentes);
      return rep;
    },
  };
}

const SERVEUR = Object.fromEntries([
  ...classer(DOSSIER.map((f) => f.chemin), '/lotus-chess').urlsApp.map((u) => [u, `contenu de ${u}`]),
  ...classer(DOSSIER.map((f) => f.chemin), '/lotus-chess').urlsMoteur.map((u) => [u, `contenu de ${u}`]),
  ['/lotus-chess/engine/LICENSE-stockfish.txt', 'GPL'],
  ['/lotus-chess/police.woff2', 'police'],
]);

describe('comportement du service worker généré', () => {
  it('précache tout à l\'installation, en contournant le cache HTTP, puis prend la main', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    const { version, versionMoteur, urlsApp, urlsMoteur } = generer();
    expect([...w.stockage.get(`lotus-chess:app:${version}`).keys()].sort()).toEqual(urlsApp);
    expect([...w.stockage.get(`lotus-chess:moteur:${versionMoteur}`).keys()].sort()).toEqual(urlsMoteur);
    expect(w.journalReseau.every((r) => r.cache === 'reload')).toBe(true);
    expect(w.etat.skipWaiting).toBe(1);
    await w.lancer('activate');
    expect(w.etat.claim).toBe(1);
  });

  it('échoue à l\'installation si un fichier manque : mieux vaut l\'ancienne version qu\'une version trouée', async () => {
    const incomplet = { ...SERVEUR };
    delete incomplet['/lotus-chess/engine/stockfish-18-lite-single.wasm'];
    const w = monterWorker({ fichiersServeur: incomplet });
    await expect(w.lancer('install')).rejects.toThrow(/précache impossible.*wasm.*404/);
    expect(w.etat.skipWaiting).toBe(0);
  });

  it('ne retélécharge pas le moteur quand son cache existe déjà', async () => {
    const { versionMoteur, urlsMoteur } = generer();
    const deja = Object.fromEntries(urlsMoteur.map((u) => [u, { ok: true, corps: 'déjà là' }]));
    const w = monterWorker({
      fichiersServeur: SERVEUR,
      cachesInitiaux: { [`lotus-chess:moteur:${versionMoteur}`]: deja },
    });
    await w.lancer('install');
    expect(w.journalReseau.some((r) => r.url.includes('/engine/'))).toBe(false);
  });

  it('sert d\'abord le cache, sans réseau, pour les fichiers précachés (dont le moteur)', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    w.journalReseau.length = 0;
    const wasm = await w.requete('/lotus-chess/engine/stockfish-18-lite-single.wasm');
    expect(wasm.corps).toBe('contenu de /lotus-chess/engine/stockfish-18-lite-single.wasm');
    const bundle = await w.requete('/lotus-chess/_expo/static/js/web/entry-abc.js', { mode: 'no-cors' });
    expect(bundle.corps).toContain('entry-abc.js');
    expect(w.journalReseau).toEqual([]);
  });

  it('répond à toute navigation vers une page par l\'index du cache (routes de l\'application)', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    w.journalReseau.length = 0;
    for (const chemin of ['/lotus-chess/', '/lotus-chess/play', '/lotus-chess/play?x=1', '/lotus-chess/404.html']) {
      const rep = await w.requete(chemin, { mode: 'navigate' });
      expect(rep.corps).toBe('contenu de /lotus-chess/index.html');
    }
    expect(w.journalReseau).toEqual([]);
  });

  it('laisse passer une navigation vers un vrai fichier au lieu de lui servir l\'application', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    const rep = await w.requete('/lotus-chess/engine/LICENSE-stockfish.txt', { mode: 'navigate' });
    expect(rep.corps).toBe('GPL');
  });

  it('garde en cache ce que le précache n\'avait pas prévu, mais pas les échecs', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    await w.requete('/lotus-chess/police.woff2');
    const { version } = generer();
    expect(w.stockage.get(`lotus-chess:app:${version}`).has('/lotus-chess/police.woff2')).toBe(true);
    const absent = await w.requete('/lotus-chess/absent.png');
    expect(absent.status).toBe(404);
    expect(w.stockage.get(`lotus-chess:app:${version}`).has('/lotus-chess/absent.png')).toBe(false);
  });

  it('ne se mêle ni des écritures, ni des requêtes à portion d\'octets, ni des autres origines, ni des autres dossiers', async () => {
    const w = monterWorker({ fichiersServeur: SERVEUR });
    await w.lancer('install');
    expect(await w.requete('/lotus-chess/play', { method: 'POST' })).toBeNull();
    expect(await w.requete('/lotus-chess/engine/x.wasm', { headers: { range: 'bytes=0-9' } })).toBeNull();
    expect(await w.requete('https://ailleurs.test/lotus-chess/index.html')).toBeNull();
    expect(await w.requete('/autre-depot/index.html', { mode: 'navigate' })).toBeNull();
  });

  it('à l\'activation, supprime les anciennes versions de Lotus et rien d\'autre', async () => {
    const w = monterWorker({
      fichiersServeur: SERVEUR,
      cachesInitiaux: {
        'lotus-chess:app:ancienne': { '/x': 1 },
        'lotus-chess:moteur:ancien': { '/x': 1 },
        'autre-application': { '/x': 1 },
      },
    });
    await w.lancer('install');
    await w.lancer('activate');
    const { version, versionMoteur } = generer();
    expect([...w.stockage.keys()].sort()).toEqual(
      ['autre-application', `lotus-chess:app:${version}`, `lotus-chess:moteur:${versionMoteur}`].sort(),
    );
  });

  it('ne sert jamais un fichier d\'une ancienne version, même encore présente', async () => {
    const w = monterWorker({
      fichiersServeur: SERVEUR,
      cachesInitiaux: { 'lotus-chess:app:ancienne': { '/lotus-chess/index.html': { corps: 'VIEUX' } } },
    });
    await w.lancer('install');
    const rep = await w.requete('/lotus-chess/', { mode: 'navigate' });
    expect(rep.corps).toBe('contenu de /lotus-chess/index.html');
  });
});
