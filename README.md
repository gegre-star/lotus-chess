# Lotus Chess

Application d'apprentissage des échecs, en français. Leçons guidées par des
coachs, problèmes tactiques, sprint de problèmes, pratique des finales, parties
chronométrées contre l'ordinateur et revue de partie avec courbe d'évaluation.

Elle fonctionne comme application web installable (PWA, voir
`docs/livraison.md`) et comme application Expo. Une fois chargée, elle
reste utilisable hors ligne ; les adversaires et la revue de partie utilisent
alors le moteur maison, Stockfish s'ajoutant quand il est disponible sur le web.

## Lancer sur un iPhone

Il te faut [Node.js 22](https://nodejs.org) sur ton ordinateur et l'application
**Expo Go** sur ton téléphone. Les deux doivent être sur le même réseau Wi‑Fi.

```bash
npm install
npx expo start
```

Scanner le QR code avec l'appareil photo de l'iPhone : une notification propose
de l'ouvrir dans Expo Go.

Si le QR code ne fonctionne pas, ton réseau bloque sans doute la connexion
locale — essayer `npx expo start --tunnel`.

## Contenu

28 leçons réparties en trois niveaux, 33 problèmes classés de 600 à 1550 sur
17 thèmes tactiques, 19 exercices guidés, 17 ouvertures, 5 adversaires de 500 à 1900 Elo et
12 trophées.

Les textes, les positions et les personnages sont originaux. Les parties
historiques citées sont des relevés de parties réelles (Morphy 1858,
Anderssen 1851, Byrne–Fischer 1956).

## Organisation

| Dossier | Rôle |
| --- | --- |
| `src/chess/engine.ts` | Règles : coups légaux, roque, prise en passant, promotion, mat, pat |
| `src/chess/brain/` | Moteur maison « Cerveau » : plateau, recherche, évaluation, niveaux calibrés |
| `src/chess/adversaire.ts` | Choix du coup de l'adversaire : répertoire, Stockfish ou Cerveau |
| `src/chess/partie.ts`, `pendule.ts` | État d'une partie (valeur pure), pendules, sauvegarde |
| `src/analysis/` | Analyse : Stockfish (web) ou Cerveau, revue de partie, statistiques |
| `src/chess/ai.ts` | Aides matérielles (`material`, `stableMaterial`), classement Elo |
| `src/chess/content.ts` | Leçons, problèmes, ouvertures, bots, parties célèbres |
| `src/chess/progress.ts` | Points, trophées, sauvegarde locale |
| `src/components/` | Échiquier, pièces vectorielles, coachs, éléments d'interface |
| `app/` | Les écrans : accueil, problèmes, apprendre, exercices, jouer, finales, réglages |

## Vérification

```bash
npm test        # moteur, contenu et progression
npm run typecheck
```

Le moteur est validé par `perft` sur trois positions de référence, dont
« Kiwipete », qui piège les implémentations approximatives du roque et de la
prise en passant.

Chaque position du contenu est contrôlée automatiquement : positions licites
(les deux rois présents, le camp qui n'a pas le trait n'est jamais en échec),
coups demandés réellement jouables, et solutions de problèmes qui atteignent
bien leur objectif — mat annoncé ou gain de matériel.

## Choix de conception

**Les problèmes acceptent toute solution équivalente.** Plutôt que d'exiger le
coup exact enregistré, l'application compare le coup de l'élève au meilleur
coup trouvé par le moteur. Sur un problème de mat, la tolérance est nulle :
les scores de mat encodent la rapidité, donc un mat plus lent est refusé — un
entraîneur doit demander le mat le plus court.

**La force des bots est calibrée, pas déclarée.** Chaque adversaire a été mesuré en
jouant contre Stockfish bridé, et sa faiblesse est humaine : il cherche moins
profond, voit moins de reprises et hésite entre des coups plausibles. Il ne
joue jamais un coup tiré au sort. Les mesures, leurs limites (environ ±100 Elo,
échelle de Stockfish et non de chess.com) et la comparaison avec l'ancien
système sont dans `docs/auto-evaluation/adversaires.md`.
