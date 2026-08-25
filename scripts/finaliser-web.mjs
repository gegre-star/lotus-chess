/**
 * Finalise l'export web.
 *
 * Expo produit une page minimale : ni manifeste, ni métadonnées Apple. Sans
 * elles, « Sur l'écran d'accueil » ne crée qu'un raccourci qui rouvre Safari.
 * L'application n'est pas considérée comme installée, et iOS traite alors son
 * stockage comme celui d'un site ordinaire — effaçable après sept jours sans
 * visite. Pour qui joue tous les jours, c'est la différence entre garder sa
 * progression et la perdre.
 *
 * Ce travail ne peut pas se faire depuis `app/+html.tsx` : ce fichier est
 * ignoré quand `web.output` vaut « single », l'export utilise alors son
 * gabarit interne. D'où cette étape après construction.
 *
 * Usage : node scripts/finaliser-web.mjs <dossier-de-sortie>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const sortie = process.argv[2] ?? 'dist';
// même convention que app.config.js : vide = déploiement à la racine
const base = (process.env.LOTUS_BASE_URL ?? '/lotus-chess').replace(/\/$/, '');

const chemin = (f) => `${base}/${f}`;

const manifeste = {
  name: 'Lotus Chess',
  short_name: 'Lotus',
  description: 'Apprendre les échecs en français, hors ligne.',
  lang: 'fr',
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#262421',
  theme_color: '#262421',
  icons: [
    { src: chemin('icone-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: chemin('icone-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};

const TETE = `
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
  `;

const index = join(sortie, 'index.html');
if (!existsSync(index)) {
  console.error(`introuvable : ${index} — la construction a-t-elle échoué ?`);
  process.exit(1);
}

let html = readFileSync(index, 'utf8');

if (html.includes('apple-mobile-web-app-capable')) {
  console.error('index.html porte déjà les métadonnées : rien à faire');
} else {
  html = html.replace('<html lang="en">', '<html lang="fr">');
  // `viewport-fit=cover` étend la page sous l'encoche et la barre d'accueil
  html = html.replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"',
  );
  html = html.replace('</head>', `${TETE}</head>`);
  writeFileSync(index, html);
}

writeFileSync(join(sortie, 'manifest.webmanifest'), `${JSON.stringify(manifeste, null, 2)}\n`);

// GitHub Pages n'a pas de routeur : il sert 404.html sur une URL inconnue,
// et l'application y reprend la main côté navigateur
writeFileSync(join(sortie, '404.html'), html);

console.error(`finalisé : ${sortie} (base « ${base || '/'} »)`);
