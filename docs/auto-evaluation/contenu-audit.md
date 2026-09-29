# Audit du contenu par un maître FIDE

## Problèmes

Un maître FIDE a relu tout le contenu pédagogique avec Stockfish 16 (profondeur
18 à 25) et `chess.js` pour arbitres. Rien de ce qu'il a trouvé ne faisait
échouer un test : les positions étaient légales, les coups jouables, les
solutions reconnues par l'écran. C'était le *propos* qui était faux, et un
élève qui apprend une fausseté ne s'en aperçoit pas.

J'ai revérifié chaque constat moi-même, avec Stockfish 18 et avec un solveur
exact pour les finales de pions, avant de corriger. Les onze erreurs factuelles
se sont toutes confirmées.

**F1 · La tour était donnée.** Leçon « L'échec » : `Td8+` avec le roi noir en
e8 se prenait d'un coup (`Rxd8`). L'élève apprenait à donner échec en perdant
sa tour. Corrigé en `Ta8+` : le roi n'a plus que d7, e7 et f7.

**F2 · « Si tu joues n'importe quoi, c'est pat. »** Faux : sur vingt-six coups,
quatre mataient. La leçon promettait un piège qui n'existait pas. La position
est remplacée par celle où un seul coup mate (`Dg7#`) et où le piège cité,
`Dg6`, est réellement un pat.

**F3 · La fourchette gagnait… une nulle.** La leçon et le problème
`fourch-tour` gagnaient une tour pour finir avec un cavalier contre le roi :
nulle automatique. Des pions ont été ajoutés (`3r3k/6pp/7N/…/5PPP/6K1`).
L'étape 2 de la leçon montrait de surcroît un roi noir en f8, case inaccessible
depuis h8.

**F4 · Deux « victoires » finissaient roi contre roi.** `fourch-roi` : tous les
coups blancs valaient ≈ −0,3. `skewer-fou` : `Fxg7+` valait −0,28, un coup de
sauvetage présenté comme un gain. Le premier devient une vraie fourchette
protégée (`Ce7+` gagne une tour : +4,93 à la profondeur 22, contre −2,63 pour
le meilleur autre coup), le second un échange fou contre dame avec des pions de
chaque côté (+5,97, contre −5,86).

**F5 · `rayons-x` : « la seconde tour soutient l'invasion ».** `Txd8` mate
seule. Le texte le dit maintenant, et un test retire la seconde tour pour le
prouver.

**F6 · `deviation` : « la dame s'offre ».** `Da8+` est imprenable : c'est une
interposition forcée, mat en deux. Pire, la dame d7 était déjà en prise (de la
tour d1, de la dame a4) : `Txd7` gagnait, en mat en quatre, mais le problème le
refusait, la tolérance sur un mat étant nulle. La dame blanche part de a2 : plus
rien n'attaque d7.

**F7 · La découverte ne découvrait rien.** La dame b7 était déjà en prise du
fou e4 : `Fc6+` valait autant que `Fxb7+`. Le cavalier d8 défend maintenant la
dame — seul l'échec de la tour empêche la reprise (+7,29 contre +0,25).

**F8 · « L'opposition gagne des finales entières. »** Avec les blancs au trait,
la position de la leçon est nulle (+0,02) : les noirs ont l'opposition. Le
solveur exact le confirme. La leçon montre maintenant les noirs au trait, et
ajoute la même position blancs au trait pour dire qu'elle est nulle.

**F9 · « Le roi actif » avec deux rois seuls.** Nulle par construction. Un pion
noir en e5, sans défenseur, donne un roi à activer : `Re4` gagne (+12,83) et
aucun autre coup ne dépasse 0,00.

**F10 · « La tour attaque tous les pions. »** Elle n'attaque que f7. Et la
position de l'étape 2 montrait les blancs au trait, juste après leur propre
coup.

**F11 · Trois exercices faux.** `vp-mauvaise-reprise` annonçait deux reprises
là où il n'y en avait qu'une ; `pp-sauve-la-tour` disait « deux points » pour
une tour qui en vaut cinq ; `pp-defends-plutot` ne distinguait rien (quinze
coups sur seize à 0,00). Des pions ont donné un enjeu aux deux derniers. En
chemin : l'ancien `pp-sauve-la-tour` acceptait `Ta5`, qui perd la tour à
`…Fc3+`. La faute était invisible parce que perdre la tour laissait roi contre
roi et fou, donc nulle ; avec des pions, la sanction (−4,4) apparaît, et `Ta5`
sort des réponses.

Et des défauts qui trompaient sans être faux :

- **Positions aux compteurs impossibles** : le roque, le développement, l'échange
  montraient trois coups blancs, deux coups noirs, les blancs au trait. Le
  roque annonçait de plus des droits sans que rien n'en dise les conditions.
- **Textes qui mentaient** : « ses seules fuites sont occupées » (f8 et h8 étaient
  libres), « cavaliers et fous dehors » (Cb1 et Fc1 étaient chez eux).
- **`l-mat-dame` promettait « la technique »** et n'enseignait qu'un mat en un.
- **Noms qui se contredisaient** : « Partie anglaise » et « Ruy Lopez (espagnole) »
  dans la liste, « Ouverture anglaise » et « Partie espagnole » dans le
  répertoire ; et un « gambit dame » dont la note parlait d'un pion offert
  alors qu'il se reprend.
- **`nommerOuverture` donnait de faux noms** : `1.d4 d5 2.Cf3` s'appelait
  « Système de Londres » tant qu'aucune autre ligne ne partageait ce début ;
  `1.e4 c5 2.Cc3`, « Sicilienne fermée » ; `1.d4 Cf6 2.c4 e6 3.Cc3`,
  « nimzo-indienne » avant `Fb4`. Et le nom **disparaissait** dès qu'un coup
  quittait le répertoire : le gambit Evans n'avait plus de nom.
- **Des problèmes mal classés** : deux mats en un évidents à 1400 et 1500 ;
  `double-att` avec cinq dames gagnantes ; `gen5` où gagner un fou laissait les
  blancs à −2,8 ; `gen4` (huit pièces, une promotion avec échec) à 900 ; cinq
  promotions sur trente-trois, aucun clouage.

Ce que l'audit ne disait pas et que la vérification a fait apparaître, pour ne
pas le laisser passer en silence :

- **Les FEN proposés n'étaient pas tous bons.** Celui de `l-roi-actif`
  (`8/6p1/5k2/…/6P1/8`) est équilibré (+0,13) : je l'ai remplacé. Celui de la
  Philidor a déjà la tour noire en a6 : quatorze des dix-neuf coups noirs tiennent
  la nulle, et le texte « Ta6 ou Tg6 » ne peut pas désigner un unique coup.
  La version noire du mat du berger, avec les mêmes pièces, avait un cavalier de
  plus que les compteurs ne le permettaient.
- **Lucena se gagne de douze façons** sur quatorze coups. « Td1+ puis Td4 » est la
  méthode enseignée, non la seule qui gagne.
- **`inter` et `esc-b` ont plusieurs solutions** légitimes, à vitesse égale.

## Apprendre

Une position de contenu dit une chose à l'élève, et cette chose doit être
vraie. On ne peut pas la lire dans le FEN : il faut demander au moteur ce que
la position vaut, coup par coup, et lire le texte contre la réponse.

D'où quatre règles.

**La position tient sa promesse.** Quand le texte parle de gagner, le matériel
restant suffit à mater — ni roi seul, ni roi et cavalier, ni un gain qui laisse
l'adversaire mieux. Quand il parle de mater, un coup mate, et un seul.

**Le coup demandé est le seul coup.** Un problème ou une consigne de leçon qui
fait chercher une solution n'en a qu'une, à soixante centièmes de pion près ;
sinon la multiplicité est écrite, avec sa raison. Une consigne qui *dicte* le
coup (« Amène ta tour en a8 ») n'est pas une recherche, et ne prétend pas en
être une.

**Les finales se prouvent, elles ne se devinent pas.** Le minimax de
l'application voit trois demi-coups ; la règle du carré en demande six, la
défense Philidor vingt. Stockfish donne l'évaluation de chaque coup ; pour les
finales roi et pion contre roi, un solveur exact — sans heuristique — rend
gain ou nulle.

**Le nom d'une ouverture se mérite.** Il apparaît quand le coup qui la définit
est joué, pas avant, et il reste tant que la partie ne devient pas autre chose.

Le contenu a gagné, par la même occasion, ce qui manquait :

- une leçon d'introduction aux cases et à la notation (`R D T F C`), placée avant
  toutes les autres, parce que la première consigne disait déjà « en e4 » ;
- une vraie technique du roi et de la dame (le roi d'abord, le piège du pat) ;
- onze exercices, sur trois thèmes nouveaux : les mats de base, les finales, la
  sécurité du roi. Roi avant la dame, tour et roi, mat du couloir en deux, le
  coup simple d'abord ; règle du carré, case clé, Lucena, Philidor ; conditions
  du roque, mat du berger à donner et à parer ;
- deux problèmes qui manquaient à la collection : un clouage et une attaque à la
  découverte par un coup de pion.

## Observer

Chaque constat a son test, et un test qui garde une correction doit échouer
sans elle : je les ai rejoués sur le contenu d'avant correction. Les six
positions aux compteurs impossibles, les trois « victoires » qui finissaient
nulle (`fourch-tour`, `fourch-roi`, `skewer-fou`), les noms discordants, les
problèmes à plusieurs solutions (`gen5`, `decouverte`, `double-att`) et la
leçon de découverte échouent tous ; quarante et un tests de
`corrections-audit.test.ts` sur cinquante-huit.

| Critère | Test |
| --- | --- |
| Deux rois, personne en échec hors trait, camps plausibles | `positions-du-contenu.test.ts` › « deux rois, personne en échec hors trait » (leçons, problèmes, exercices) |
| Droits de roque cohérents, lus dans le FEN brut | › « droits de roque cohérents avec le placement » |
| Jamais de matériel insuffisant là où on parle de gagner | › « jamais de matériel insuffisant… » |
| La fin d'un problème n'est pas une nulle automatique | › « la fin d'un problème n'est jamais une nulle automatique » (F3, F4) |
| Les compteurs de coups d'ouverture collent aux pièces | › « le numéro de coup colle aux pièces » (roque, développement, échange) |
| Un problème a une seule solution, ou sa multiplicité est écrite | `unicite-des-solutions.test.ts` › « problèmes : une seule solution » (F7, `double-att`, `gen5`) |
| Une tâche de leçon est dictée, ou seule à convenir | › « leçons : le coup demandé est dicté… » |
| F1 à F7, F9, F10 et les défauts trompeurs, un par un | `corrections-audit.test.ts` (position, réponse adverse, matériel restant) |
| Un gain annoncé laisse les blancs nettement mieux | `puzzles.test.ts` › « les blancs sont nettement mieux à la fin de la ligne » |
| Les mats en un génériques sont faciles ; pas de motif dominant | › « un classement de difficulté cohérent » |
| Chaque exercice a une preuve de Stockfish qui décrit sa position | `preuves-exercices.test.ts` › « la preuve décrit bien la position » |
| Les coups attendus sont bons, et tout coup aussi bon est attendu ou toléré | › une suite par exercice |
| F8 : le trait décide de l'opposition | › « F8 » (solveur exact) |
| Le solveur est d'accord avec Stockfish | › « d'accord avec Stockfish sur chaque coup » |
| F11 : indices et positions des trois exercices | › « F11 » |
| Les exercices hors horizon du minimax sont déclarés, avec leur raison | `exercises.test.ts` › `HORS_HORIZON` |
| `nommerOuverture` : transpositions et sorties du répertoire | `ouvertures.test.ts` › « transpositions et sorties du répertoire » |
| Chaque ligne se reconnaît en entier, et pas avant son coup distinctif | › une ligne par test |

Les preuves de Stockfish sont figées dans `donnees/preuves-stockfish.json`, une
entrée par position d'exercice, avec l'évaluation de chaque coup légal. Le
fichier n'est jamais cru sur parole : les tests vérifient qu'il décrit la
position, coup légal pour coup légal, sinon ils demandent de relancer
`node src/chess/__tests__/donnees/generer-preuves.cjs`. Le solveur de finales,
lui, est dans le test même : il ne dépend d'aucun fichier.

Ce qui n'a pas pu être corrigé dans ce périmètre, et pourquoi :

- **`app/puzzles.tsx`, ligne 55**, affiche « thème · difficulté » avant la
  recherche, et le thème dévoile le motif (« Fourchette · 950 », « Clouage · 950 »).
  L'écran est hors périmètre ; il suffirait de n'afficher que la difficulté tant
  que le problème n'est pas résolu.
- **`app/train.tsx` note chaque coup avec le minimax à trois demi-coups.** Sur
  les exercices de finale, il ne voit pas la sanction ni la victoire : un coup
  attendu peut y recevoir une mention tiède. La résolution (`attendus`) ne
  dépend pas de ce verdict, mais `Cerveau` ferait un meilleur juge.
- **La liste `OPENINGS` n'est lue par aucun écran** : elle n'est vérifiée que par
  ses tests. Ses noms sont maintenant ceux du répertoire.
