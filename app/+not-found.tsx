import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Route de repli.
 *
 * Sans elle, expo-router affiche un écran « Unmatched Route » sans issue dès
 * qu'une URL ne correspond à rien — ce qui arrive plus souvent qu'on ne croit
 * sur un hébergement statique : `…/index.html` tapé à la main, un lien
 * tronqué, un ancien signet. Le préfixe de déploiement est retiré de l'URL
 * avant la comparaison, et le reste ne correspond alors à aucune route.
 *
 * Plutôt qu'un cul-de-sac, on renvoie à l'accueil : l'application se répare
 * d'elle-même au lieu de laisser l'utilisateur devant une impasse.
 */
export default function NotFound() {
  return <Redirect href="/" />;
}
