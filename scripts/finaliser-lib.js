/**
 * Cœur de `finaliser-web.mjs`, séparé pour être testable sur un dossier de
 * sortie factice (voir `__tests__/finaliser.test.js`).
 *
 * Principe directeur : ce script retouche le HTML produit par Expo à coup de
 * remplacements de chaînes. Si Expo change son gabarit, un remplacement qui ne
 * trouve plus sa cible ne doit SURTOUT pas passer sous silence : on publierait
 * alors un site sans plein écran iOS, sans manifeste ou sans hors ligne, et
 * personne ne le verrait avant qu'un utilisateur s'en plaigne. Chaque
 * remplacement échoue donc bruyamment, en disant quoi et où.
 */
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { normaliserBase, genererServiceWorker, scriptEnregistrement } = require('./service-worker.js');

class ErreurFinalisation extends Error {}

/** Posé dans le HTML une fois retouché : rend le script rejouable sans doublon. */
const MARQUEUR_FINALISE = '<!-- lotus-finalise -->';

/**
 * Remplace `cible` par `remplacement`, à condition qu'elle figure exactement
 * une fois. Zéro occurrence : le gabarit d'Expo a changé. Plusieurs : on
 * ne sait plus laquelle viser.
 */
function remplacerOuEchouer(texte, cible, remplacement, { fichier, quoi }) {
  const occurrences = texte.split(cible).length - 1;
  if (occurrences !== 1) {
    const constat = occurrences === 0 ? 'est introuvable' : `apparaît ${occurrences} fois (une seule attendue)`;
    throw new ErreurFinalisation(
      `${fichier} : impossible de ${quoi} — « ${cible} » ${constat}. ` +
        "Le gabarit HTML de l'export Expo a sans doute changé : adapter scripts/finaliser-lib.js.",
    );
  }
  // une fonction, pas une chaîne : `$&` ou `$1` dans le remplacement seraient interprétés
  return texte.replace(cible, () => remplacement);
}

/** Icônes du manifeste : `any` pour l'écran d'accueil, `maskable` pour Android. */
const ICONES = [
  { fichier: 'icone-192.png', sizes: '192x192', purpose: 'any' },
  { fichier: 'icone-512.png', sizes: '512x512', purpose: 'any' },
  // Fond plein et pion dans la zone sûre (80 %) : Android la découpe en
  // cercle, en goutte ou en carré arrondi selon le lanceur. Une entrée
  // séparée, car « any maskable » dans une seule serait rognée aussi ailleurs.
  { fichier: 'icone-maskable-512.png', sizes: '512x512', purpose: 'maskable' },
];

function creerManifeste(base) {
  return {
    name: 'Lotus Chess',
    short_name: 'Lotus',
    description: 'Apprendre les échecs en français, hors ligne.',
    lang: 'fr',
    // l'identité de l'application ne doit pas changer si start_url change
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#262421',
    theme_color: '#262421',
    icons: ICONES.map((i) => ({
      src: `${base}/${i.fichier}`,
      sizes: i.sizes,
      type: 'image/png',
      purpose: i.purpose,
    })),
  };
}

function creerTete(base) {
  const chemin = (f) => `${base}/${f}`;
  return `
    ${MARQUEUR_FINALISE}
    <link rel="manifest" href="${chemin('manifest.webmanifest')}" />
    <meta name="theme-color" content="#262421" />
    <meta name="description" content="Apprendre les échecs en français, hors ligne." />
    <!-- iOS ignore le manifeste pour le plein écran : ces balises n'ont pas d'équivalent standard -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Lotus Chess" />
    <link rel="apple-touch-icon" href="${chemin('icone-180.png')}" />
    <link rel="icon" href="${chemin('icone-192.png')}" />
    <style>
      /* peint avant le premier rendu, sinon l'écran clignote en blanc au lancement */
      html, body { background-color: #262421; }
      body { overscroll-behavior: none; }
    </style>
    <script>${scriptEnregistrement(base)}</script>
  `;
}

/**
 * Politique de sécurité du contenu, posée par une balise `<meta>` : GitHub
 * Pages ne permet pas de définir d'en-têtes HTTP.
 *
 * Ce que l'application n'a PAS besoin de faire, et qu'on interdit donc :
 * charger quoi que ce soit hors de son origine (aucun appel réseau, aucune
 * police ou image distante), évaluer du texte comme du code (`eval` : le
 * bundle Expo en contient deux occurrences, dans des chemins morts — chargement
 * de bundles fractionnés et repli Node — vérifiées inertes dans Chromium),
 * embarquer des objets, changer la base des URL.
 *
 * Ce qu'elle doit autoriser :
 *  - `'sha256-…'` : le seul script en ligne, celui qui enregistre le service
 *    worker (le hachage est calculé sur le HTML final, voir `hachesScripts`) ;
 *  - `'wasm-unsafe-eval'` : compiler WebAssembly (Stockfish). Le Worker du
 *    moteur, chargé depuis une URL de même origine, a sa propre politique (ici
 *    aucune) et n'hérite pas de celle de la page ; la directive est gardée par
 *    prudence pour les navigateurs qui feraient autrement. Elle n'ouvre pas
 *    `eval` : seulement `WebAssembly.compile`/`instantiate` ;
 *  - `style-src 'unsafe-inline'` : react-native-web fabrique ses feuilles de
 *    style et ses attributs `style` à l'exécution.
 *
 * `frame-ancestors` et `report-uri` sont ignorés dans une balise `<meta>` :
 * on ne peut donc pas interdire l'inclusion du site dans un cadre.
 */
function politiqueCsp(hachages) {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${hachages.map((h) => `'sha256-${h}'`).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Hachages SHA-256 (base64) des scripts en ligne : ce que `script-src` doit nommer. */
function hachesScripts(html) {
  const hachages = [];
  for (const [, attributs, contenu] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(attributs)) continue;
    hachages.push(createHash('sha256').update(contenu).digest('base64'));
  }
  return hachages;
}

/**
 * Retouche le HTML d'Expo. Fonction pure : lève `ErreurFinalisation` si une
 * cible manque. `csp: false` omet la politique de sécurité (voir `LOTUS_CSP`).
 */
function finaliserHtml(html, base, fichier = 'index.html', { csp = true } = {}) {
  const ou = { fichier };
  let sortie = html;
  sortie = remplacerOuEchouer(sortie, '<html lang="en">', '<html lang="fr">', {
    ...ou,
    quoi: 'passer la page en français (attribut lang)',
  });
  // `viewport-fit=cover` étend la page sous l'encoche et la barre d'accueil
  sortie = remplacerOuEchouer(
    sortie,
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
    { ...ou, quoi: 'ajouter viewport-fit=cover (plein écran sous l\'encoche)' },
  );
  sortie = remplacerOuEchouer(sortie, '</head>', `${creerTete(base)}</head>`, {
    ...ou,
    quoi: 'insérer le manifeste, les métadonnées Apple et l\'enregistrement du service worker',
  });
  if (csp) {
    // Une balise CSP ne s'applique qu'à ce qui la suit : elle ouvre donc le
    // <head>, avant tout script. Les hachages sont pris sur le HTML final,
    // pour que tout script en ligne — le nôtre, ou un futur ajout d'Expo —
    // soit autorisé au lieu de faire échouer l'application en silence.
    const meta = `\n    <meta http-equiv="Content-Security-Policy" content="${politiqueCsp(hachesScripts(sortie))}" />`;
    sortie = remplacerOuEchouer(sortie, '<head>', `<head>${meta}`, {
      ...ou,
      quoi: 'poser la politique de sécurité du contenu (CSP) en tête du <head>',
    });
  }
  return sortie;
}

/** Chemins relatifs (séparés par « / ») de tous les fichiers sous `dossier`. */
function lister(dossier, prefixe = '') {
  const chemins = [];
  for (const entree of readdirSync(join(dossier, prefixe), { withFileTypes: true })) {
    const relatif = prefixe ? `${prefixe}/${entree.name}` : entree.name;
    if (entree.isDirectory()) chemins.push(...lister(dossier, relatif));
    else if (entree.isFile()) chemins.push(relatif);
  }
  return chemins;
}

/**
 * Finalise `sortie` (le dossier produit par `expo export`) pour un
 * déploiement sous `baseBrute`. Renvoie un résumé ; lève `ErreurFinalisation`
 * ou `Error` au moindre problème.
 */
function finaliser(sortie, baseBrute, { csp = true } = {}) {
  const base = normaliserBase(baseBrute);
  const index = join(sortie, 'index.html');
  if (!existsSync(index)) {
    throw new ErreurFinalisation(`${index} introuvable — la construction (expo export) a-t-elle échoué ?`);
  }

  let html = readFileSync(index, 'utf8');
  let deja = false;
  if (html.includes(MARQUEUR_FINALISE)) {
    // Rejeu : on ne retouche pas deux fois, mais la base doit être la même,
    // sinon le manifeste et le service worker viseraient un autre dossier.
    if (!html.includes(`register('${base}/sw.js'`)) {
      throw new ErreurFinalisation(
        `${index} a déjà été finalisé pour une autre base que « ${base || '/'} » : relancer expo export avant de finaliser.`,
      );
    }
    deja = true;
  } else {
    html = finaliserHtml(html, base, index, { csp });
    writeFileSync(index, html);
  }

  // Tout ce que le manifeste et le HTML promettent doit exister : une icône
  // manquante ne se voit qu'à l'installation, sur le téléphone de quelqu'un.
  const manquants = [...ICONES.map((i) => i.fichier), 'icone-180.png'].filter((f) => !existsSync(join(sortie, f)));
  if (manquants.length > 0) {
    throw new ErreurFinalisation(`icônes absentes de ${sortie} : ${manquants.join(', ')} (elles viennent de public/)`);
  }
  // Le bundle désigné par la page doit être là, sinon le précache ne le verrait pas
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  if (scripts.length === 0) {
    throw new ErreurFinalisation(`${index} : aucune balise <script src=…> — le bundle n'est pas référencé`);
  }
  for (const src of scripts) {
    const local = src.startsWith(`${base}/`) ? src.slice(base.length + 1) : null;
    if (local === null || !existsSync(join(sortie, decodeURIComponent(local)))) {
      throw new ErreurFinalisation(`${index} référence « ${src} », introuvable dans ${sortie} sous la base « ${base || '/'} »`);
    }
  }

  writeFileSync(join(sortie, 'manifest.webmanifest'), `${JSON.stringify(creerManifeste(base), null, 2)}\n`);

  // GitHub Pages n'a pas de routeur : il sert 404.html sur une URL inconnue,
  // et l'application y reprend la main côté navigateur
  writeFileSync(join(sortie, '404.html'), html);

  // En dernier : le hachage doit porter sur ce qui sera réellement publié,
  // index.html et manifeste retouchés compris.
  const fichiers = lister(sortie).map((chemin) => ({ chemin, contenu: readFileSync(join(sortie, chemin)) }));
  const sw = genererServiceWorker({ base, fichiers });
  writeFileSync(join(sortie, 'sw.js'), sw.source);

  return { base, deja, version: sw.version, versionMoteur: sw.versionMoteur, precache: sw.urlsApp.length + sw.urlsMoteur.length };
}

module.exports = {
  ErreurFinalisation,
  MARQUEUR_FINALISE,
  ICONES,
  remplacerOuEchouer,
  creerManifeste,
  finaliserHtml,
  politiqueCsp,
  hachesScripts,
  finaliser,
  lister,
};
