/**
 * Configuration Expo.
 *
 * `experiments.baseUrl` doit correspondre au sous-dossier où le site est
 * servi. Sur GitHub Pages ce sous-dossier est le nom du dépôt : le figer dans
 * `app.json` casserait le déploiement dès que le dépôt change de nom, et tous
 * les fichiers — bundle, moteur Stockfish — seraient cherchés à la racine du
 * domaine. Le workflow de déploiement passe donc le nom réel du dépôt.
 *
 * Laisser la variable vide déploie à la racine, ce qu'il faut pour un domaine
 * dédié ou pour `utilisateur.github.io`.
 */
const app = require('./app.json');

const base = process.env.LOTUS_BASE_URL ?? '/lotus-chess';

module.exports = () => ({
  ...app.expo,
  experiments: { ...app.expo.experiments, baseUrl: base },
});
