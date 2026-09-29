/**
 * Modèle du service worker de Lotus Chess.
 *
 * Ce fichier n'est PAS servi tel quel : `service-worker.js` remplace la
 * constante `CONFIG` ci-dessous par la configuration de la construction (base
 * de déploiement, version, liste des fichiers à précacher) et écrit le
 * résultat dans `dist/sw.js`. Il reste un vrai fichier JavaScript, valide tel
 * quel, pour qu'un éditeur le colore et qu'un test puisse l'exécuter.
 *
 * Ce qu'il garantit :
 *  - l'application se lance sans réseau, moteur Stockfish (7 Mo) compris ;
 *  - une nouvelle version ne se mélange jamais à l'ancienne : chaque version
 *    a son cache, nommé d'après un hachage du contenu, et l'ancien est
 *    supprimé à l'activation ;
 *  - le moteur a son propre cache, nommé d'après SES fichiers : une mise à
 *    jour de l'interface ne force pas à retélécharger 7 Mo inchangés.
 */
'use strict';

// Remplacé à la construction. Champs : base, version, versionMoteur, index,
// urlsApp, urlsMoteur.
const CONFIG = /*CONFIG*/ {};

// Préfixe commun : GitHub Pages partage le stockage entre tous les dépôts d'un
// même compte (`compte.github.io`). On ne supprime donc que nos propres caches.
const PREFIXE = 'lotus-chess:';
const CACHE_APP = `${PREFIXE}app:${CONFIG.version}`;
const CACHE_MOTEUR = `${PREFIXE}moteur:${CONFIG.versionMoteur}`;

/**
 * Télécharge dans `nom` les `urls` qui n'y sont pas déjà.
 *
 * `cache: 'reload'` contourne le cache HTTP : GitHub Pages répond avec
 * `max-age=600`, et sans cela une nouvelle version pourrait précacher un
 * `index.html` vieux de dix minutes, qui désigne un ancien bundle.
 * Une réponse non valide (404…) fait échouer l'installation : mieux vaut
 * rester sur l'ancienne version que d'en installer une incomplète.
 */
async function remplir(nom, urls) {
  const cache = await caches.open(nom);
  await Promise.all(
    urls.map(async (url) => {
      if (await cache.match(url)) return;
      const reponse = await fetch(new Request(url, { cache: 'reload' }));
      if (!reponse.ok) throw new Error(`précache impossible : ${url} (${reponse.status})`);
      await cache.put(url, reponse);
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await remplir(CACHE_MOTEUR, CONFIG.urlsMoteur);
      await remplir(CACHE_APP, CONFIG.urlsApp);
      // Sur iOS une PWA reste sur sa version tant qu'elle n'est pas fermée
      // complètement : inutile d'attendre que les anciens onglets se ferment.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const gardes = new Set([CACHE_APP, CACHE_MOTEUR]);
      for (const nom of await caches.keys()) {
        if (nom.startsWith(PREFIXE) && !gardes.has(nom)) await caches.delete(nom);
      }
      await self.clients.claim();
    })(),
  );
});

/** Cherche dans nos deux caches seulement, jamais dans ceux d'une autre version. */
async function chercher(requete) {
  for (const nom of [CACHE_APP, CACHE_MOTEUR]) {
    const reponse = await (await caches.open(nom)).match(requete);
    if (reponse) return reponse;
  }
  return undefined;
}

/**
 * Une navigation vers une « page » (racine, route de l'application, 404.html)
 * reçoit l'index : l'application est une page unique qui lit l'URL elle-même.
 * Une navigation vers un vrai fichier (LICENSE-stockfish.txt…) suit la voie
 * ordinaire, sinon on lui servirait l'application à sa place.
 */
function estUnePage(url) {
  const dernier = url.pathname.split('/').pop() ?? '';
  return dernier === '' || !dernier.includes('.') || dernier.endsWith('.html');
}

async function cacheDAbord(event) {
  const enCache = await chercher(event.request);
  if (enCache) return enCache;
  const reponse = await fetch(event.request);
  // On garde ce que le précache n'avait pas prévu (police, image tardive),
  // mais seulement les réponses complètes : 206 et opaques sont inutilisables.
  if (reponse.status === 200 && reponse.type === 'basic') {
    const copie = reponse.clone();
    event.waitUntil(caches.open(CACHE_APP).then((cache) => cache.put(event.request, copie)));
  }
  return reponse;
}

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  // Une requête à portion d'octets suppose un serveur : on ne la simule pas
  if (requete.headers.has('range')) return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(`${CONFIG.base}/`)) return;

  if (requete.mode === 'navigate' && estUnePage(url)) {
    event.respondWith(
      (async () => {
        const index = await (await caches.open(CACHE_APP)).match(CONFIG.index);
        return index ?? fetch(requete);
      })(),
    );
    return;
  }
  event.respondWith(cacheDAbord(event));
});
