# État du projet — Lotus Chess

Dernière mise à jour : 27/10/2026

## Avancement
- Application d'échecs en français (Expo, web + mobile, hors ligne) : leçons, problèmes, sprint, finales, parties chronométrées, revue de partie, statistiques, trophées.
- **Nouveau (branche `feat/bibliotheque-lichess`)** : écran « Bibliothèque » (`app/bibliotheque.tsx`), accessible depuis l'écran Problèmes.
  - 646 problèmes de la base libre de Lichess (CC0), de 600 à 2400, blancs ou noirs.
  - Correction coup par coup (`src/chess/lichess.ts`), niveau Elo de l'élève (monte/baisse, indice = demi-gain), série, filtre par thème.
  - Sauvegarde : champ `bibliotheque` dans la progression, compatible avec les anciennes sauvegardes.

## Décisions prises
- On reprend le **fonctionnement** de chess.com (niveau qui évolue, séries, thèmes), pas ses problèmes (protégés) : les positions viennent de Lichess.
- Le parcours de 33 problèmes et le sprint restent inchangés (mode de correction séparé).
- Données générées par `node scripts/importer-problemes.mjs` (sélection déterministe, versionnée).

## Vérifié
- `npx tsc --noEmit` et `npx jest` (tous les tests) passent.
- Essai dans le navigateur (Expo web) : problème noir et blanc, bon coup, mauvais coup, indice, solution, suivant, sauvegarde après rechargement.

## Prochaine étape
- Relire la branche, puis fusionner dans `main` (rien n'est poussé sur GitHub tant que ce n'est pas validé).
- Pistes ensuite : explications des coups dans la revue de partie, entraîneur pendant la partie, mode « Survie » façon Puzzle Rush.
