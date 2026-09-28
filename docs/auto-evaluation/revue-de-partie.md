# Revue de partie

## Problèmes

Un audit a prouvé six défauts dans la couche d'analyse, dont deux qui rendaient
la revue inutilisable.

**Le moteur local gelait l'application.** `createLocalEngine` passait
`depth: 10` au minimax de `ai.ts`, sans plafond de temps : 12,5 s à profondeur 3
sur un milieu de partie, plus de trois minutes à profondeur 4. C'est le moteur
de tout iOS et Android (Hermes n'a ni WebAssembly ni Worker) et le repli du web.
Un calcul synchrone occupe l'unique fil d'exécution : pendant toute la revue,
l'écran ne se redessinait plus, barre de progression comprise.

**Stockfish sur le web pouvait faire attendre indéfiniment.** `boot()` attendait
`uciok` sans limite ; un worker muet (wasm introuvable, réseau tronqué) laissait
l'analyse suspendue pour toujours. `dispose()` abandonnait la requête en cours
au lieu de la rejeter, et après une erreur du worker en cours de session l'appel
suivant restait suspendu lui aussi.

**Le coach mentait de quatre façons.**

- Le texte « C'est le meilleur coup de la position » s'affichait pour toute perte
  de 0 à 50 cp, alors que 50 cp ne sont pas le meilleur coup.
- 4.Cxd4 en Écossaise était jugé « brillant : tu donnes du matériel… −2
  points » : le calcul matériel s'arrêtait à la première reprise et oubliait
  que le joueur reprend à son tour. Stockfish confirme pourtant que c'est
  simplement le meilleur coup (+0,38).
- « Une pièce reste en prise après ce coup » s'écrivait sous toute gaffe, y
  compris celles qui laissent une fourchette ou une menace et aucune pièce
  attaquée.
- Les seuils étaient en centipions fixes (50 / 120 / 300), donc incohérents :
  perdre trois pions à +10 était une « gaffe », alors que la partie est
  gagnée quoi qu'il arrive ; perdre 1,5 pion à égalité, une simple imprécision.

**`commenter` proclamait « objectivement meilleur »** à +30 cp d'écart avec
Stockfish profondeur 10. À cette profondeur, deux coups voisins diffèrent de
plusieurs dizaines de centipions sans que rien ne les sépare : c'est du bruit.

**La revue n'examinait que les coups de l'élève**, à raison de deux analyses par
coup, et concluait « X bons coups sur N » : pas de précision, pas de courbe, pas
de lecture de ce que faisait l'adversaire, pas de meilleure suite à montrer.

## Apprendre

L'objectif est celui d'une revue de chess.com ou de lichess : comprendre *où* la
partie a basculé, *pourquoi*, et *ce qu'il fallait jouer* — pour les deux camps,
puisqu'une gaffe adverse est aussi une leçon.

**Un verdict qui dépend de la position.** La perte se mesure en probabilité de
gain (formule de lichess, `probaGain`), pas en centipions :

| Perte de probabilité de gain | Verdict |
| --- | --- |
| ≤ 5 points | bon |
| ≤ 10 points | imprécision |
| ≤ 20 points | erreur |
| > 20 points | gaffe |

Les seuils sont ceux de chess.com. À égalité, la courbe est à peu près linéaire
(0,09 point par centipion) et les limites valent environ 55, 110 et 240 cp — les
anciens seuils fixes, là où ils avaient un sens. Ailleurs elle s'étire : à +10,
perdre trois pions coûte 1 point (« bon ») ; à égalité, 25 (« gaffe »). Deux
exceptions, parce qu'un mat ne se mesure pas en probabilité (100 % contre 97 % à
+10) : laisser échapper un mat est au moins une imprécision, en offrir un au
moins une erreur.

**« Brillant » reste rare.** Il faut être le meilleur coup *et* sacrifier du
matériel une fois toutes les reprises jouées (`soldeApresEchanges`, qui s'appuie
sur `stableMaterial`), et deux garde-fous tirés de chess.com : pas de brillant si
la position était déjà gagnée (> 90 %), ni si le coup laisse une position
mauvaise (< 40 %).

**Une revue en une passe.** Les N+1 positions sont analysées une fois chacune ;
tout le reste s'en déduit : perte des deux camps, meilleur coup et variante,
verdict et texte (à la deuxième personne pour l'élève, à la troisième pour
l'adversaire), précision de chaque joueur (formule de lichess, moyenne sur ses
coups), résumé par catégorie, courbe d'évaluation, moment critique. Le coup joué
est jugé sur l'évaluation de la position d'*après*, même quand le moteur le
recommandait : sur la partie de l'Opéra, Stockfish à profondeur 10 recommande
17...Cxd7 sans voir Db8+ (mat en deux) ; la recherche de la position suivante le
voit, et le coup devient la gaffe qu'il est.

**Un écran qui se lit comme celui de chess.com.** `RevueDePartie` montre la
position d'avant le coup (là où le coup joué, en rouge, et le meilleur coup, en
vert, sont tous deux valables), le texte du coach, la courbe cliquable, la
précision des deux camps, le tableau par catégorie, « Erreur suivante », la
liste colorée des coups, et « Voir la meilleure suite » qui déroule la variante
du moteur coup par coup.

## Observer

| Critère | Test |
| --- | --- |
| Le moteur local rend la main en moins de 1,5 s à profondeur 10 demandée | `local.test.ts` › « rend la main vite à profondeur 10 sur un milieu de partie » |
| Il ne dépasse jamais son plafond, même si on en réclame davantage | › « ne dépasse jamais le plafond, même si on en réclame davantage » |
| Il cède la main à la boucle d'événements avant de calculer | › « cède la main à la boucle d'événements avant de calculer » |
| Mat et pat d'une position terminée sont distingués | › « distingue le mat du pat sur une position terminée » |
| Un worker muet au démarrage échoue après 10 s, et les appels suivants aussitôt | `stockfish.web.test.ts` › « worker muet au démarrage » |
| Une recherche muette échoue à `movetime` + 4 s (20 s en profondeur) | › « worker qui ne répond pas à la recherche » |
| `dispose()` rejette la requête en cours et celles en file, sans minuteur résiduel | › « dispose » |
| Une erreur du worker en cours de session casse le moteur | › « erreur du worker » |
| La bascule Stockfish → local ne se rejoue pas à chaque position | `provider.web.test.ts` › « bascule sur le moteur local… » |
| « Meilleur coup » seulement jusqu'à 10 cp, « Bon coup. » de 11 à 50 (F12) | `coaching-verdict.test.ts` › « texte du verdict « bon » » |
| 4.Cxd4 n'est plus brillant, le solde après reprises vaut +1 (F13) | › « brillant et échanges de reprises » |
| « Une pièce reste en prise » n'est dit que si une pièce l'est (F14) | › « phrase d'une gaffe sans pièce en prise » |
| Les seuils valent 5 / 10 / 20 points, frontières incluses | › « seuils du verdict » › « place les frontières… » |
| Perdre trois pions à +10 n'est pas une gaffe, à égalité si | › « ne traite pas comme une gaffe… » / « traite comme une gaffe… » |
| Le verdict ne recule jamais quand la perte grandit | › « ne recule jamais quand la perte grandit » |
| `commenter` exige 100 cp d'écart et dit « selon le moteur » | `comparer.test.ts` |
| Une partie sans erreur donne ~100 % aux deux camps | `review.test.ts` › « donne une précision d'environ 100 %… » |
| Une gaffe ne fait baisser que la précision de son camp | › « une gaffe des noirs… » › « fait baisser la précision de son camp seulement » |
| Chaque position est analysée une fois : N+1 appels | › « analyse chaque position une seule fois » |
| Le coup qui mate n'est pas noté comme une gaffe | › « fin de partie » › « ne note pas le coup qui mate comme une gaffe » |
| Un coup conseillé par le moteur mais perdant est jugé sur la position d'après | › « juge le coup sur la position d'après… » |
| Précision, résumé, courbe, coup critique, évaluation lisible | `statistiques.test.ts` |
| « Erreur suivante », meilleure suite, retour à la partie | `navigation.test.ts` |
| L'écran montre les deux flèches sur une erreur, déroule la suite, tient à 320 px | `RevueDePartie.test.tsx` |
| La courbe place l'égalité au milieu et couvre toute la largeur de zones tactiles | `EvalGraph.test.tsx` |

**Ce que la vérification a rattrapé**, en comparant la revue du moteur local à
celle de Stockfish 18 sous Node (profondeur 10) sur l'Opéra et l'Immortelle :

1. Une première version forçait « meilleur coup = aucune perte » quand le coup
   joué était celui que le moteur recommandait. Stockfish recommande 17...Cxd7
   dans l'Opéra (il faut profondeur 20 pour trouver que Dxd7 seul évite Db8+) :
   la gaffe passait pour un bon coup, et Db8+ pour un sacrifice ordinaire. Le
   verdict suit désormais l'évaluation d'après.
2. Le moteur local est nettement plus faible : sur 78 demi-coups, il donne le même
   verdict que Stockfish 61 fois (78 %), atteint la profondeur 4 à 5 en 350 ms,
   et sa précision s'écarte de 2 à 5 points. Les deux moteurs désignent pourtant le
   même moment critique dans l'Immortelle (le 40e demi-coup) et à quatre demi-coups
   près dans l'Opéra. C'est un repli honnête, pas un substitut : l'écran l'annonce
   (« Analyse locale, moins précise »).

**Reste à faire** : la revue tient dans un composant, l'écran de jeu doit encore
l'appeler (`analyserPartie`, puis `RevueDePartie`). `ai.ts` garde un
`QUALITY_STEPS` et un `reviewGame` obsolètes, que plus rien n'appelle (ni écran, ni test) : à supprimer par qui possède ce fichier.
