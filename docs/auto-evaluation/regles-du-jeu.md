# Règles du jeu

## Problèmes

Le moteur couvrait le roque, la prise en passant, la promotion, le clouage,
l'échec, le mat et le pat, avec une justesse vérifiée par `perft` sur trois
positions de référence dont Kiwipete.

Il lui manquait **toutes les nulles de règle** : cinquante coups, matériel
insuffisant, triple répétition. La position ne portait même pas la pendule des
demi-coups, et `toFEN` écrivait un « 0 1 » constant à la place — le FEN
produit n'était donc pas fidèle à celui qu'on avait lu.

Conséquence directe : une partie objectivement nulle continuait indéfiniment,
et le moteur croyait gagner une finale morte parce qu'il l'évaluait au
matériel.

## Apprendre

Rien de visible pour l'élève dans ce lot — c'est un socle. Il rend possibles
les leçons de finale, où « roi et fou contre roi » doit s'annoncer nulle au
lieu de laisser espérer un mat.

## Observer

| Critère | Test |
| --- | --- |
| Nulle à 100 demi-coups, et pas à 99 | `rules.test.ts` › « pendule des cinquante coups » |
| Le mat prime sur la pendule | › « laisse le mat primer sur la pendule » |
| La pendule repart à zéro sur prise et sur poussée de pion | › deux tests dédiés |
| Les quatre positions mortes de la FIDE sont reconnues | › « matériel insuffisant » (4 cas) |
| Deux cavaliers, un pion ou une tour ne sont pas une position morte | › 4 cas négatifs |
| La triple répétition est détectée, trait et pendules compris | › « triple répétition » (3 tests) |
| Mats et pats de référence, sans faux positif | › « mats et pats de référence » |
| Le FEN conserve les pendules à l'aller-retour | › « conserve les pendules » |
| `perft` reste juste sur les trois positions de référence | `engine.test.ts` (inchangé) |

**Effets de bord traités** : `toSAN` et l'échiquier lisaient `gameStatus` pour
détecter l'échec. Un statut de nulle aurait masqué le « + » d'un coup qui
donne pourtant échec, et le surlignage du roi. Les deux interrogent maintenant
`inCheck` directement — ce qui évite au passage de générer tous les coups
légaux à chaque rendu.

`search` a dû être corrigé dans la foulée : il ne reconnaissait que `mate` et
`stalemate`, et serait tombé dans l'évaluation matérielle sur les trois
nouveaux statuts.

## Sur Stockfish et chess.js

La demande mentionnait `chess.js` pour la validation des coups. Ce moteur-ci
est conservé : il est vérifié par `perft`, il n'a aucune dépendance, et le
remplacer signifierait réécrire le contenu qui s'appuie sur son API sans rien
gagner de mesurable.

Stockfish, lui, est intégré — mais seulement là où il peut tourner. Hermes,
le moteur JavaScript de React Native, n'exécute ni WebAssembly ni Web Worker :
sur iPhone et Android, l'analyse retombe sur le minimax intégré. Sur le web,
c'est bien Stockfish 18 Lite qui note les coups.

Le build `lite-single` est le seul utilisable sur GitHub Pages : les autres
réclament `SharedArrayBuffer`, donc des en-têtes COOP/COEP qu'un site Pages ne
peut pas définir. Vérifié dans un navigateur avec `crossOriginIsolated` à
`false`.

Stockfish est sous **GPL v3** : distribuer l'application avec ce moteur soumet
la distribution aux obligations de cette licence.
