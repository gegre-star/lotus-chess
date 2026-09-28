/**
 * Finalise l'export web.
 *
 * Expo produit une page minimale : ni manifeste, ni métadonnées Apple, ni
 * service worker. Sans les deux premiers, « Sur l'écran d'accueil » ne crée
 * qu'un raccourci qui rouvre Safari : l'application n'est pas considérée comme
 * installée, et iOS traite alors son stockage comme celui d'un site ordinaire
 * — effaçable après sept jours sans visite. Pour qui joue tous les jours,
 * c'est la différence entre garder sa progression et la perdre. Sans le
 * service worker, l'application ne se lance pas sans réseau, alors que le
 * manifeste le promet ; et le moteur Stockfish (7 Mo) serait retéléchargé.
 *
 * Ce travail ne peut pas se faire depuis `app/+html.tsx` : ce fichier est
 * ignoré quand `web.output` vaut « single », l'export utilise alors son
 * gabarit interne. D'où cette étape après construction.
 *
 * La logique est dans `finaliser-lib.js` (et `service-worker.js`), testable
 * sur un dossier factice. Ici : seulement la ligne de commande.
 *
 * Usage : node scripts/finaliser-web.mjs <dossier-de-sortie>
 * Code de sortie non nul au moindre problème, pour que le workflow s'arrête.
 */
import lib from './finaliser-lib.js';

const sortie = process.argv[2] ?? 'dist';
// même convention que app.config.js : vide = déploiement à la racine
const base = process.env.LOTUS_BASE_URL ?? '/lotus-chess';

// Interrupteur de secours : LOTUS_CSP=0 publie sans politique de sécurité du
// contenu, si un navigateur venait à la refuser (voir docs/livraison.md).
const csp = process.env.LOTUS_CSP !== '0';

try {
  const r = lib.finaliser(sortie, base, { csp });
  console.error(
    `finalisé : ${sortie} (base « ${r.base || '/'} »${r.deja ? ', HTML déjà retouché' : ''}${csp ? '' : ', SANS CSP'}) — ` +
      `hors ligne : ${r.precache} fichiers précachés, version ${r.version}, moteur ${r.versionMoteur}`,
  );
} catch (erreur) {
  console.error(`ÉCHEC de la finalisation : ${erreur.message}`);
  process.exit(1);
}
