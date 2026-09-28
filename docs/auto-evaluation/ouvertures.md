# Ouvertures

## Problèmes

Signalement de l'élève : « en mode jouer, les ouvertures des adversaires sont
systématiquement identiques ».

C'est exact, et c'était mécanique. Le choix du coup vient d'un minimax à
profondeur fixe : depuis la position de départ, la même profondeur donne le
même coup. `chooseMove` tirait déjà au sort **parmi les coups équivalents**,
à quinze centièmes de pion près — mais dans l'ouverture les évaluations sont
justement tranchées, et il n'y avait presque jamais d'ex æquo. Restait la
probabilité de gaffe : 3 % chez Cyrano, donc une partie sur trente-trois qui
commençait autrement.

Conséquence pour l'apprentissage : on ne voyait qu'une position, jouée encore
et encore, alors que l'ouverture est précisément le moment où un débutant a le
plus besoin de variété.

## Apprendre

Deux choses à la fois, plutôt qu'un simple tirage au hasard :

- **Varier** les débuts de partie, pour rencontrer des structures différentes ;
- **les nommer**, parce qu'une défense française reconnue et révisable vaut
  mieux qu'un coup au hasard qui ne s'appelle pas.

Le répertoire couvre trente ouvertures réelles, de la partie italienne à la
Grünfeld, sur huit à dix demi-coups. Le tirage est pondéré : 1.e4 et 1.d4
sortent plus souvent que 1.Cf3, comme dans les parties réelles.

Les faibles en sortent plus souvent que les forts — la probabilité de suivre
le répertoire est `1 - gaffe`, soit 45 % pour Pixou et 97 % pour Cyrano. Un
débutant qui joue mal l'ouverture, c'est aussi ce qu'on rencontre autour d'un
échiquier.

Le nom ne s'affiche que lorsqu'il est certain. Après 1.e4 e5 2.Cf3, l'italienne,
l'espagnole, l'écossaise et la philidor restent possibles : l'application se
tait. Après 1.e4 c5 2.Cf3, elle annonce « Défense sicilienne », et attend
...g6 pour dire « variante du dragon ».

## Observer

| Critère | Test |
| --- | --- |
| Chaque coup de chaque ligne est légal depuis le début | `ouvertures.test.ts` › une ligne par test (30) |
| Les noms sont uniques et les poids positifs | › « les poids sont positifs et les noms uniques » |
| Le premier coup des blancs varie sur au moins quatre coups | › « n'est plus toujours le même » |
| Vingt parties donnent au moins huit débuts distincts | › « vingt parties de livre » |
| Hors répertoire, le livre se tait et laisse jouer le moteur | › « hors répertoire, le livre se tait » |
| Un coup partagé par plusieurs lignes cumule leurs poids | › « les poids se cumulent » |
| L'ouverture n'est nommée que lorsqu'elle est distinguable | › « on se tait tant que rien ne distingue » |
| La variante ne masque pas l'ouverture, ni l'inverse | › « la sicilienne avant que le dragon ne se distingue » |

**Vérifié dans le navigateur**, sur l'export réellement publié : huit parties
lancées contre Cyrano donnent quatre premières réponses différentes à 1.e4
(e5, e6, c5, c6, d5, d6, Cf6 selon les tirages), et le titre affiche bien
« Défense sicilienne », « Défense Caro-Kann », « Défense Petrov » — ou
« Coups » tant que la ligne reste ambiguë.
