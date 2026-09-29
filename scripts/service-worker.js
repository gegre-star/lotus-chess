/**
 * Génération du service worker : logique pure, sans accès au disque hors du
 * modèle, pour pouvoir la tester avec une liste de fichiers factice.
 *
 * Écrit en CommonJS parce que jest-expo ne sait pas charger un module `.mjs`
 * (ni le transformer) : `finaliser-web.mjs` l'importe, les tests le `require`.
 */
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Sous-dossier de déploiement : vide (racine) ou `/nom`, sans barre finale. */
function normaliserBase(brut) {
  const base = String(brut ?? '').replace(/\/+$/, '');
  if (base === '') return '';
  const avecBarre = base.startsWith('/') ? base : `/${base}`;
  // La base est injectée telle quelle dans du HTML et du JavaScript : on
  // refuse d'emblée tout ce qui pourrait en sortir (guillemet, chevron…).
  if (!/^(\/[A-Za-z0-9._~-]+)+$/.test(avecBarre)) {
    throw new Error(`LOTUS_BASE_URL invalide : « ${brut} » (attendu : /nom-du-depot ou vide)`);
  }
  return avecBarre;
}

/** Fichiers qu'on ne précache jamais : inutiles au fonctionnement de l'application. */
const EXCLUS = /(^|\/)(sw\.js|404\.html|metadata\.json|\.DS_Store)$|\.(md|map|txt)$/i;

const RACINE_APP = /^(index\.html|manifest\.webmanifest|[^/]+\.(png|ico|svg))$/;
const DOSSIERS_APP = /^(_expo\/static|assets)\//;
// Le dossier du moteur voyage avec sa licence et son offre de code source
// (README.md, LICENSE-*.txt) : la GPL demande que ces textes accompagnent le
// binaire, et hors ligne aussi.
const MOTEUR = /^engine\/[^/]+\.(js|wasm|nnue|md|txt)$/;

/**
 * Chemin -> URL, normalisée comme le navigateur le fera pour la requête.
 * `encodeURIComponent` ne convient pas : il transforme `@` en `%40`, or le
 * bundle demande `.../@react-navigation/...` tel quel, et le cache compare les
 * URL caractère par caractère. On laisse donc `URL` appliquer la règle du
 * navigateur, après avoir protégé les trois caractères qu'il interpréterait
 * (`%`, `?`, `#`) plutôt que de les encoder.
 */
const versUrl = (base, chemin) =>
  new URL(`${base}/${chemin.replace(/[%?#]/g, encodeURIComponent)}`, 'http://hote.invalide').pathname;

/**
 * Répartit les chemins (relatifs au dossier de sortie, séparés par « / »)
 * entre le précache de l'application et celui du moteur.
 *
 * Les chemins Expo contiennent des `@` et des sous-dossiers issus de
 * `node_modules` : les URL sont écrites exactement comme le navigateur les
 * demandera (voir `versUrl`).
 */
function classer(chemins, base) {
  const app = [];
  const moteur = [];
  for (const chemin of chemins) {
    if (MOTEUR.test(chemin)) moteur.push(chemin);
    else if (EXCLUS.test(chemin)) continue;
    else if (RACINE_APP.test(chemin) || DOSSIERS_APP.test(chemin)) app.push(chemin);
  }
  // ordre fixe : le même dossier doit toujours donner le même service worker
  app.sort();
  moteur.sort();
  const url = (c) => versUrl(base, c);
  return { app, moteur, urlsApp: app.map(url), urlsMoteur: moteur.map(url) };
}

/** Hache des fichiers (nom ET contenu), indépendamment de l'ordre reçu. */
function hacher(fichiers, graine) {
  const h = createHash('sha256');
  h.update(String(graine));
  for (const { chemin, contenu } of [...fichiers].sort((a, b) => (a.chemin < b.chemin ? -1 : 1))) {
    // la longueur évite qu'un contenu « avale » le nom du fichier suivant
    h.update(`\0${chemin}\0${Buffer.byteLength(contenu)}\0`);
    h.update(contenu);
  }
  return h.digest('hex').slice(0, 16);
}

const MARQUEUR = '/*CONFIG*/ {}';

function verifierModele(modele) {
  // Un modèle sans marqueur produirait un service worker sans configuration,
  // qui échouerait sans bruit dans le navigateur : on préfère échouer ici.
  if (modele.split(MARQUEUR).length !== 2) {
    throw new Error(`sw-modele.js doit contenir exactement un marqueur « ${MARQUEUR} »`);
  }
  return modele;
}

const lireModele = () => readFileSync(join(__dirname, 'sw-modele.js'), 'utf8');

/**
 * @param {{ base: string, fichiers: { chemin: string, contenu: Buffer | string }[] }} entree
 *   `fichiers` : tout le dossier de sortie, tel qu'il sera publié.
 */
function genererServiceWorker({ base: baseBrute, fichiers, modele: modeleBrut = lireModele() }) {
  const modele = verifierModele(modeleBrut);
  const base = normaliserBase(baseBrute);
  const { app, moteur, urlsApp, urlsMoteur } = classer(
    fichiers.map((f) => f.chemin),
    base,
  );
  const index = `${base}/index.html`;
  if (!urlsApp.includes(index)) throw new Error('service worker : index.html absent du dossier de sortie');
  if (!app.some((c) => c.startsWith('_expo/static/') && c.endsWith('.js'))) {
    throw new Error('service worker : aucun bundle JavaScript sous _expo/static/ — l\'export a-t-il réussi ?');
  }
  if (!moteur.some((c) => c.endsWith('.wasm')) || !moteur.some((c) => c.endsWith('.js'))) {
    throw new Error('service worker : moteur Stockfish (engine/*.js et *.wasm) absent — sans lui, pas d\'analyse hors ligne');
  }

  const parChemin = new Map(fichiers.map((f) => [f.chemin, f]));
  const de = (liste) => liste.map((c) => parChemin.get(c));
  // Le modèle entre dans le hachage : changer la stratégie de cache doit
  // aussi produire une nouvelle version, même si l'application n'a pas bougé.
  const version = hacher(de(app), `${base}\n${modele}`);
  const versionMoteur = hacher(de(moteur), base);

  const config = { base, version, versionMoteur, index, urlsApp, urlsMoteur };
  return {
    source: modele.replace(MARQUEUR, () => JSON.stringify(config, null, 2)),
    version,
    versionMoteur,
    urlsApp,
    urlsMoteur,
  };
}

/**
 * Script d'enregistrement, injecté dans le HTML.
 *
 * - Attend `load` : le précache (7 Mo de moteur) ne doit pas concurrencer le
 *   premier affichage.
 * - `updateViaCache: 'none'` : la vérification de `sw.js` ignore le cache
 *   HTTP, sinon GitHub Pages (`max-age=600`) retarde la mise à jour.
 * - Une PWA iOS reprise depuis l'arrière-plan ne recharge pas la page : on
 *   redemande donc une vérification à chaque retour au premier plan.
 * - La portée est le sous-dossier : `sw.js` est servi depuis sa racine, un
 *   worker ne pouvant contrôler que ce qui se trouve sous son propre chemin.
 */
function scriptEnregistrement(baseBrute) {
  const base = normaliserBase(baseBrute);
  return (
    "if('serviceWorker' in navigator){addEventListener('load',function(){" +
    `navigator.serviceWorker.register('${base}/sw.js',{scope:'${base}/',updateViaCache:'none'})` +
    '.then(function(r){document.addEventListener(\'visibilitychange\',function(){' +
    "if(document.visibilityState==='visible')r.update().catch(function(){})})})" +
    ".catch(function(e){console.warn('Hors ligne indisponible :',e)})})}"
  );
}

module.exports = { normaliserBase, classer, hacher, genererServiceWorker, scriptEnregistrement, MARQUEUR };
