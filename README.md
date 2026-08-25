# Lotus Chess

Application d'apprentissage des échecs : leçons guidées, problèmes tactiques et
parties contre l'ordinateur, en français, entièrement hors ligne.

> **À noter** : ce module est indépendant de l'application d'anglais. Il ne
> partage aucun code avec elle et peut être déplacé tel quel dans son propre
> dépôt (`src/chess`, `src/components/chess`, `app/chess`).

## Lancer sur un iPhone

```bash
npm install
npx expo start
```

Scanner le QR code avec l'appareil photo, qui propose d'ouvrir dans Expo Go,
puis naviguer vers `/chess`.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `engine.ts` | Règles du jeu : coups légaux, roque, prise en passant, promotion, mat, pat |
| `ai.ts` | Évaluation, recherche minimax, notation des coups, classement Elo |
| `content.ts` | Leçons, problèmes, ouvertures, bots, parties célèbres |
| `progress.ts` | Points, trophées, sauvegarde locale (AsyncStorage) |
| `ProgressContext.tsx` | Partage de la progression entre les écrans |

L'interface vit dans `src/components/chess` (échiquier, pièces, coachs) et
`app/chess` (les quatre onglets).

## Contenu

27 leçons réparties en trois niveaux, 33 problèmes classés de 600 à 1550 sur
16 thèmes tactiques, 17 ouvertures, 5 adversaires de 500 à 1900 Elo et
12 trophées.

Les textes, les positions et les personnages sont originaux. Les parties de
la section « Observer » sont des relevés historiques (Morphy 1858,
Anderssen 1851, Byrne–Fischer 1956).

## Vérification

```bash
npm test          # 189 tests sur le moteur, le contenu et la progression
npx tsc --noEmit  # typage strict
```

Le moteur est validé par `perft` sur trois positions de référence, dont
« Kiwipete », qui piège les implémentations approximatives du roque et de la
prise en passant.

Chaque position du contenu est vérifiée automatiquement : positions licites
(les deux rois présents, le camp qui n'a pas le trait n'est jamais en échec),
coups demandés réellement jouables, et solutions de problèmes qui atteignent
bien leur objectif — mat annoncé ou gain de matériel.

## Choix de conception

**Les problèmes acceptent toute solution équivalente.** Plutôt que d'exiger le
coup exact enregistré, l'application compare le coup de l'élève au meilleur
coup trouvé par le moteur. Sur un problème de mat, la tolérance est nulle :
les scores de mat encodent la rapidité, donc un mat plus lent est refusé — un
entraîneur doit demander le mat le plus court.

**La force des bots se règle sur deux axes** : la profondeur de recherche et
une probabilité de jouer au hasard. C'est ce second réglage qui rend les
adversaires faibles réellement battables par un débutant, au lieu de jouer
parfaitement mais sans vision.
