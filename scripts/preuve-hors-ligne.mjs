/**
 * Preuve, dans un vrai Chromium, que la version web se lance et joue sans
 * réseau, puis qu'une nouvelle version remplace l'ancienne.
 *
 * Usage :
 *   node scripts/preuve-hors-ligne.mjs <dist> [<dist-nouvelle-version>]
 *
 * Étapes :
 *  1. sert `dist` sous /lotus-chess/ avec les en-têtes de GitHub Pages
 *     (max-age=600, 404.html sur URL inconnue) ;
 *  2. charge la page, attend l'activation du service worker et le précache ;
 *  3. coupe le réseau, recharge : l'accueil doit s'afficher ; ouvre « Jouer »
 *     directement par son URL ; le moteur Stockfish doit répondre depuis le
 *     cache ; une partie contre Stockfish doit se jouer ;
 *  4. avec un second dossier : le publie à la place du premier, revient en
 *     ligne, attend la mise à jour, vérifie que l'ancien cache a disparu et
 *     que, hors ligne, c'est la NOUVELLE version qui s'affiche.
 *
 * Playwright n'est pas une dépendance du projet (rien de nouveau en
 * production) : PLAYWRIGHT_MODULE pointe vers son `index.mjs`, CHROMIUM_PATH
 * vers un binaire Chromium, PORT vers un port libre (8231 par défaut).
 * Code de sortie 1 au moindre écart.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [distA, distB] = process.argv.slice(2).map((d) => resolve(d));
if (!distA) {
  console.error('usage : node scripts/preuve-hors-ligne.mjs <dist> [<dist-nouvelle-version>]');
  process.exit(2);
}
const PORT = Number(process.env.PORT ?? 8231);
const BASE = `http://127.0.0.1:${PORT}/lotus-chess/`;

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

// ---- serveur imitant GitHub Pages (python3 -m http.server + en-têtes) ----
const racine = mkdtempSync(join(tmpdir(), 'lotus-preuve-'));
const site = join(racine, 'lotus-chess');
const publier = (dist) => {
  rmSync(site, { recursive: true, force: true });
  mkdirSync(racine, { recursive: true });
  cpSync(dist, site, { recursive: true });
};
publier(distA);

const SERVEUR_PY = `
import http.server, os, sys
os.chdir(sys.argv[1])
class Pages(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "max-age=600")
        super().end_headers()
    def send_error(self, code, message=None, explain=None):
        if code == 404 and os.path.exists("lotus-chess/404.html"):
            corps = open("lotus-chess/404.html", "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(corps)))
            self.end_headers()
            if self.command != "HEAD": self.wfile.write(corps)
            return
        super().send_error(code, message, explain)
    def log_message(self, *a): pass
Pages.extensions_map[".wasm"] = "application/wasm"
Pages.extensions_map[".webmanifest"] = "application/manifest+json"
http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[2])), Pages).serve_forever()
`;
const serveur = spawn('python3', ['-c', SERVEUR_PY, racine, String(PORT)], { stdio: 'inherit' });
const arreter = async (navigateur) => {
  await navigateur?.close().catch(() => {});
  serveur.kill();
  rmSync(racine, { recursive: true, force: true });
};

let echecs = 0;
const verifier = (ok, message, detail = '') => {
  console.log(`${ok ? 'OK    ' : 'ÉCHEC '} ${message}${detail ? ` — ${detail}` : ''}`);
  if (!ok) echecs++;
};
const attendre = async (condition, ms = 20000, pas = 100) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await condition()) return true;
    await new Promise((r) => setTimeout(r, pas));
  }
  return false;
};
await attendre(async () => (await fetch(BASE).catch(() => null))?.ok, 10000);

let navigateur;
try {
  navigateur = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const contexte = await navigateur.newContext({ viewport: { width: 420, height: 940 } });
  const page = await contexte.newPage();

  const erreursPage = [];
  page.on('pageerror', (e) => erreursPage.push(e.message));
  const workers = [];
  page.on('worker', (w) => workers.push(w.url()));
  // réponses servies par le service worker, et requêtes échouées (réseau coupé)
  const parSw = new Set();
  const echouees = [];
  contexte.on('response', (r) => r.fromServiceWorker() && parSw.add(new URL(r.url()).pathname));
  contexte.on('requestfailed', (r) => echouees.push(new URL(r.url()).pathname));

  // Toute violation de la politique de sécurité du contenu doit se voir : le
  // navigateur ne fait que la journaliser, et l'application « marcherait » à
  // moitié sans que rien n'échoue franchement.
  const violations = [];
  await contexte.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sample ?? ''}`),
    );
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && /CSP-VIOLATION|Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });

  const texte = () => page.locator('body').innerText();
  const caches = () =>
    page.evaluate(async () => {
      const noms = await self.caches.keys();
      const sortie = {};
      for (const nom of noms) sortie[nom] = (await (await self.caches.open(nom)).keys()).length;
      return sortie;
    });
  const occupees = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="square-"]')]
        .filter((c) => c.querySelector('svg'))
        .map((c) => c.getAttribute('data-testid'))
        .sort()
        .join(','),
    );

  // ---- 1. premier chargement, en ligne ----
  console.log('\n== 1. Premier chargement (en ligne) ==');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  verifier((await texte()).includes('Leçon suivante'), "l'accueil s'affiche en ligne");
  const enregistre = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { portee: r.scope, script: r.active?.scriptURL };
  });
  verifier(enregistre.portee === BASE, 'portée du service worker = le sous-dossier', enregistre.portee);
  verifier(enregistre.script === `${BASE}sw.js`, 'script servi depuis la racine de sa portée', enregistre.script);
  verifier(
    await attendre(() => page.evaluate(() => navigator.serviceWorker.controller !== null)),
    'le service worker contrôle la page (clients.claim)',
  );
  const cachesA = await caches();
  console.log('   caches :', JSON.stringify(cachesA));
  const nomsA = Object.keys(cachesA);
  verifier(nomsA.length === 2 && nomsA.every((n) => n.startsWith('lotus-chess:')), 'deux caches Lotus : application et moteur');
  const versionA = nomsA.find((n) => n.includes(':app:'));
  const moteurA = nomsA.find((n) => n.includes(':moteur:'));
  const urlsMoteur = await page.evaluate(
    async (nom) => (await (await self.caches.open(nom)).keys()).map((r) => new URL(r.url).pathname).sort(),
    moteurA,
  );
  console.log('   cache du moteur :', urlsMoteur.join(', '));
  verifier(
    ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm', 'README.md', 'LICENSE-stockfish.txt'].every((f) =>
      urlsMoteur.includes(`/lotus-chess/engine/${f}`),
    ),
    'le cache du moteur contient le .js, le .wasm (7 Mo), la licence GPL et l\'offre de source',
  );

  // Politique de sécurité du contenu : présente, et réellement appliquée
  const csp = await page.evaluate(
    () => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null,
  );
  if (csp === null) {
    console.log('   (aucune balise CSP dans cette version : contrôles CSP ignorés)');
  } else {
    console.log(`   CSP : ${csp}`);
    // Playwright exempte de la CSP le code qu'il évalue lui-même (y compris
    // un `eval` écrit directement dedans) : on programme donc les tentatives
    // pour qu'elles s'exécutent plus tard, dans le contexte ordinaire de la page.
    await page.evaluate(() => {
      window.__intrus = 0;
      const s = document.createElement('script');
      s.textContent = 'window.__intrus += 1';
      document.head.appendChild(s);
      setTimeout(() => {
        try {
          new Function('window.__intrus += 10')();
        } catch {
          window.__evalRefuse = true;
        }
      }, 0);
    });
    await page.waitForTimeout(300);
    const effet = await page.evaluate(() => ({ valeur: window.__intrus, evalRefuse: window.__evalRefuse === true }));
    verifier(effet.valeur % 10 === 0, "la CSP est effective : un script en ligne injecté ne s'exécute pas", `__intrus=${effet.valeur}`);
    verifier(effet.evalRefuse && effet.valeur < 10, 'la CSP est effective : new Function / eval sont refusés');
    violations.length = 0; // ces deux tentatives sont volontaires
  }

  // ---- 2. hors ligne ----
  console.log('\n== 2. Réseau coupé ==');
  await contexte.setOffline(true);
  parSw.clear();
  echouees.length = 0;
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  verifier((await texte()).includes('Leçon suivante'), "rechargement hors ligne : l'accueil s'affiche");
  verifier(parSw.has('/lotus-chess/index.html') || parSw.has('/lotus-chess/'), 'la page vient du service worker', [...parSw].find((p) => p.endsWith('/') || p.endsWith('.html')));
  verifier([...parSw].some((p) => p.includes('/_expo/static/js/')), 'le bundle JS vient du cache');
  verifier(echouees.length === 0, 'aucune requête en échec après rechargement', echouees.join(', '));

  await page.goto(`${BASE}play`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  verifier((await texte()).includes('Choisis ton adversaire'), "ouverture directe de /play hors ligne (navigation → index du cache)");

  // Le moteur, isolément : un Worker créé comme le fait l'application
  const uci = await page.evaluate(
    (url) =>
      new Promise((resolve) => {
        const w = new Worker(url);
        const lignes = [];
        const t = setTimeout(() => resolve({ delai: true, lignes }), 30000);
        w.onerror = (e) => resolve({ erreur: e.message, lignes });
        w.onmessage = (e) => {
          lignes.push(String(e.data));
          if (String(e.data).startsWith('uciok')) w.postMessage('isready');
          if (String(e.data).startsWith('readyok')) {
            w.postMessage('position startpos moves e2e4');
            w.postMessage('go depth 8');
          }
          if (String(e.data).startsWith('bestmove')) {
            clearTimeout(t);
            w.terminate();
            resolve({ lignes });
          }
        };
        w.postMessage('uci');
      }),
    `${BASE}engine/stockfish-18-lite-single.js`,
  );
  const best = uci.lignes?.find((l) => l.startsWith('bestmove'));
  verifier(Boolean(best), 'Stockfish (Worker + wasm) répond hors ligne', best ?? JSON.stringify(uci).slice(0, 200));
  verifier(uci.lignes?.some((l) => /^info depth \d+/.test(l)), 'il a bien calculé (lignes « info depth »)');
  verifier(parSw.has('/lotus-chess/engine/stockfish-18-lite-single.wasm'), 'le .wasm de 7 Mo est servi par le service worker');
  verifier(parSw.has('/lotus-chess/engine/stockfish-18-lite-single.js'), 'le script du worker passe par le service worker');

  // Une vraie partie contre Stockfish, dans l'application
  await page.getByText('Solide · 1700', { exact: true }).click();
  await page.waitForTimeout(600);
  const avant = workers.length;
  const coups = [['a2', 'a3'], ['h2', 'h3'], ['b2', 'b3'], ['g2', 'g3'], ['c2', 'c3'], ['d2', 'd3']];
  let reponses = 0;
  for (const [de, vers] of coups) {
    const dejaOccupees = await occupees();
    await page.getByTestId(`square-${de}`).click();
    await page.getByTestId(`square-${vers}`).click();
    const apresMonCoup = await occupees();
    if (apresMonCoup === dejaOccupees) continue; // coup refusé : on passe au suivant
    // l'adversaire répond quand la position change de nouveau
    const repondu = await attendre(async () => (await occupees()) !== apresMonCoup, 15000, 200);
    if (repondu) reponses++;
    if (workers.length > avant && reponses >= 3) break;
  }
  verifier(reponses >= 3, 'l\'adversaire répond hors ligne, coup après coup', `${reponses} réponses`);
  verifier(
    workers.some((u) => u.endsWith('/engine/stockfish-18-lite-single.js')),
    "l'application a démarré le Worker Stockfish hors ligne",
    workers.join(', '),
  );
  verifier(echouees.length === 0, 'aucune requête en échec pendant la partie', echouees.join(', '));
  verifier(erreursPage.length === 0, 'aucune erreur JavaScript dans la page', erreursPage.join(' | '));
  verifier(violations.length === 0, 'aucune violation de la politique de sécurité du contenu', violations.join(' | '));

  // Tour de tous les écrans, toujours hors ligne : une violation de CSP ou une
  // erreur qui ne survient que sur un écran rarement ouvert se verrait ici.
  const ecrans = [
    ['learn', /Apprendre|leçon/i],
    ['puzzles', /Problèmes|problème/i],
    ['train', /entraîne|Entraîne/i],
    ['games', /Parties de maîtres|Morphy/i],
    ['', /Leçon suivante/],
    ['route-inexistante', /introuvable|n'existe pas|Leçon suivante|Accueil/i],
  ];
  for (const [route, attendu] of ecrans) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    verifier(attendu.test(await texte()), `écran /${route} affiché hors ligne`);
  }
  // Un problème tactique : coup du joueur, puis réponse adverse
  await page.goto(`${BASE}puzzles`, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.getByText('Gain de la dame', { exact: false }).first().click();
  await page.waitForTimeout(500);
  await page.getByTestId('square-d1').click();
  await page.getByTestId('square-d8').click();
  await page.waitForTimeout(1500);
  console.log('   (un coup a été joué dans un problème tactique ; il ne doit provoquer ni erreur ni violation)');
  verifier(erreursPage.length === 0, 'aucune erreur JavaScript après le tour des écrans', erreursPage.join(' | '));
  verifier(violations.length === 0, 'aucune violation de CSP après le tour des écrans', violations.join(' | '));
  verifier(echouees.length === 0, 'aucune requête en échec après le tour des écrans', echouees.join(', '));

  // ---- 3. mise à jour ----
  if (distB) {
    console.log('\n== 3. Nouvelle version ==');
    await contexte.setOffline(false);
    publier(distB);
    // Le navigateur revérifie sw.js à chaque navigation ; le nouveau contenu
    // d'index.html est précaché à l'installation du nouveau worker.
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const remplace = await attendre(async () => {
      const c = await caches();
      return !(versionA in c) && Object.keys(c).some((n) => n.includes(':app:'));
    }, 20000, 200);
    const cachesB = await caches();
    console.log('   caches :', JSON.stringify(cachesB));
    const nomsB = Object.keys(cachesB);
    const versionB = nomsB.find((n) => n.includes(':app:'));
    verifier(remplace && versionB !== versionA, "l'ancien cache d'application est supprimé, le nouveau prend sa place", `${versionA} -> ${versionB}`);
    const moteurB = nomsB.find((n) => n.includes(':moteur:'));
    verifier(moteurB === moteurA, 'le cache du moteur, inchangé, est conservé (pas de retéléchargement de 7 Mo)', moteurB);
    verifier(nomsB.length === 2, 'il ne reste que deux caches', nomsB.join(', '));

    await contexte.setOffline(true);
    parSw.clear();
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    const corps = await texte();
    const marque = process.env.MARQUE_NOUVELLE_VERSION;
    verifier(corps.includes('Leçon suivante'), 'la nouvelle version se lance hors ligne');
    if (marque) verifier(corps.includes(marque), `hors ligne, la page affiche le contenu de la NOUVELLE version (« ${marque} »)`);
    verifier(!marque || !corps.includes('Bienvenue ! Commence'), "l'ancien contenu a disparu");
    verifier(erreursPage.length === 0, 'aucune erreur JavaScript après la mise à jour', erreursPage.join(' | '));
    verifier(violations.length === 0, 'aucune violation de la politique de sécurité du contenu après la mise à jour', violations.join(' | '));
  }

  // ---- témoin : sans service worker, le même test échoue ----
  // Prouve que « hors ligne » est bien réel : un contexte vierge, sans
  // service worker installé, ne peut pas charger la page réseau coupé.
  console.log('\n== Témoin : contexte vierge, réseau coupé d\'emblée ==');
  const vierge = await navigateur.newContext();
  await vierge.setOffline(true);
  const p2 = await vierge.newPage();
  const refuse = await p2.goto(BASE).then(
    () => false,
    (e) => e.message.split('\n')[0],
  );
  verifier(Boolean(refuse), 'sans service worker, la page est inaccessible hors ligne', refuse || 'a chargé !');
  await vierge.close();
} catch (erreur) {
  console.log(`ÉCHEC  exception : ${erreur.stack ?? erreur}`);
  echecs++;
} finally {
  await arreter(navigateur);
}
console.log(echecs === 0 ? '\nTOUT EST OK' : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
