# Parties historiques

## Problèmes

La demande initiale portait sur un soupçon précis : la position finale de la
partie de l'Opéra ne serait pas un mat légal, ou l'interface refuserait le
coup qui la produit.

**Ce soupçon est infondé dans ce code, et c'est vérifié plutôt qu'affirmé.**
Le rejeu moteur des trente-trois demi-coups donne `Td8#` avec le statut
`mate`, et le roi noir n'a aucun coup légal — donc aucune capture de la tour
en d8. Le test `mat de l'Opéra : le roi noir n'a aucune réponse` fige ce
résultat.

En revanche, le même dispositif a trouvé un défaut réel que personne ne
cherchait : **la Partie du siècle s'arrêtait à 17...Fe6**, c'est-à-dire juste
avant le sacrifice de dame qui fait sa célébrité. L'élève rejouait dix-sept
coups et l'écran s'arrêtait au milieu de la combinaison, sans mat et sans
explication. Elle va maintenant jusqu'à 41...Tc2#.

C'est la leçon de ce thème : le bug signalé n'existait pas, un autre existait
à côté, et seule une vérification systématique pouvait faire la différence
entre les deux.

## Apprendre

L'objectif est l'observation guidée : rejouer une partie modèle du premier au
dernier coup, sans jamais buter sur un coup que le moteur refuse.

Trois parties : l'Opéra (Morphy, 1858), l'Immortelle (Anderssen, 1851) et la
Partie du siècle (Byrne — Fischer, 1956).

## Observer

| Critère | Test |
| --- | --- |
| Chaque coup de chaque partie est légal | `games.test.ts` › « enchaîne uniquement des coups légaux » |
| Chaque partie finit sur le coup annoncé, en notation française | › « se termine sur le coup et le statut annoncés » |
| La position finale de l'Opéra est un mat, sans réponse possible | › « mat de l'Opéra : le roi noir n'a aucune réponse » |
| Aucune partie n'est ajoutée sans coup final attendu | › « couvre exactement les parties attendues » |

Le tableau `EXPECTED` est ce qui empêche la troncature de revenir : une partie
raccourcie ne finirait plus sur le coup déclaré, et le test tomberait. Le
premier jet se contentait de journaliser le statut — ce qui n'aurait jamais
rien signalé.

**Reste à faire** : les infobulles « pourquoi ce coup » et le mode « essaie un
autre coup » avec comparaison moteur ne sont pas implémentés. Le replay est
correct et complet, mais encore muet.
