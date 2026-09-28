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
| Les coups légaux coïncident avec ceux de `chess.js`, de l'ouverture à la finale | `oracle.test.ts` › « parties aléatoires » |
| Idem sur des finales construites à deux à six pièces | › « finales construites » |
| Un roi en échec peut prendre un pion voisin non défendu, des deux couleurs | › « roi en échec et pion voisin » (6 cas) |
| Le geste « toucher le roi, toucher le pion » joue bien la prise | `interaction.test.ts` › 616 prises vérifiées |
| Les nulles de règle terminent la partie, pat et matériel compris | `interaction.test.ts` › « fin de partie » (7 tests) |
| La triple répétition n'est vue que si l'historique est transmis | › « la même position trois fois » |

**Effets de bord traités** : `toSAN` et l'échiquier lisaient `gameStatus` pour
détecter l'échec. Un statut de nulle aurait masqué le « + » d'un coup qui
donne pourtant échec, et le surlignage du roi. Les deux interrogent maintenant
`inCheck` directement — ce qui évite au passage de générer tous les coups
légaux à chaque rendu.

`search` a dû être corrigé dans la foulée : il ne reconnaissait que `mate` et
`stalemate`, et serait tombé dans l'évaluation matérielle sur les trois
nouveaux statuts.

## Ce que `perft` ne disait pas

Un signalement — « le roi blanc en échec ne peut pas prendre le pion voisin »
— a montré la limite de `perft` : il compte les coups, il ne les nomme pas.
Un générateur qui oublierait une prise et inventerait un autre coup dans la
même position passerait tous les totaux.

`chess.js` sert donc désormais d'arbitre, **dans les tests uniquement** : on
compare les listes de coups, position par position. Au dernier passage,
115 362 positions ont été comparées sans un seul écart, dont 5 723 finales et
594 positions où un roi en échec capture un pion. Le moteur de l'application
reste sans dépendance ; `chess.js` n'est pas embarqué dans le bundle.

Les règles étaient donc justes. Ce qui ne l'était pas, c'est le **silence** :
un coup refusé sans raison vérifiable se vit comme un bug, et l'élève a raison
de ne pas croire une application qui ne se justifie pas. `expliquerRefus`
nomme maintenant la pièce responsable — « Prise impossible en e2 : cette pièce
est défendue par le pion d3 » — et les trois écrans qui refusaient en silence
(jeu, exercices, parties de maîtres) passent par la même décision,
`toucherCase`, testable sans jouer une partie entière.

## Sur Stockfish

Ce moteur-ci est conservé pour l'application : il est vérifié par `perft` et
par `chess.js`, il n'a aucune dépendance, et le remplacer signifierait
réécrire le contenu qui s'appuie sur son API sans rien gagner de mesurable.

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
