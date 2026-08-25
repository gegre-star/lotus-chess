# Pièces en prise

## Problèmes

Rien ne couvrait le réflexe le plus rentable du débutant : avant de chercher
un beau coup, regarder ce que l'adversaire menace de prendre. Les leçons
enseignaient les motifs tactiques offensifs, jamais l'inventaire défensif.

Chessis construit son diagnostic sur cette statistique précise — la majorité
du matériel perdu par un joueur faible l'est sur des pièces simplement
laissées en prise, pas sur des combinaisons manquées.

## Apprendre

**Objectif mesurable** : repérer et sauver une pièce attaquée avant de jouer
autre chose.

| Exercice | Niveau | Ce qu'il isole |
| --- | --- | --- |
| `pp-sauve-la-tour` | 1 | Fuir : plusieurs cases conviennent |
| `pp-defends-plutot` | 2 | Fuir est impossible (clouage) : il faut défendre |

Le second exercice enseigne par contraste. Le cavalier est cloué devant son
roi ; aucun de ses coups n'est légal. L'élève qui cherche à le déplacer se
heurte au plateau, ce qui rend l'idée « une pièce clouée ne peut pas fuir »
plus solide qu'une phrase.

L'indice de premier niveau surligne les cases en jeu — c'est le surlignage
des pièces attaquées demandé, implémenté par `piecesEnPrise`, qui ne retient
que les pièces à la fois attaquées et non défendues.

## Observer

| Critère | Test |
| --- | --- |
| Les cinq critères de validité communs | `exercises.test.ts` (par exercice) |
| Une pièce attaquée et non défendue est repérée | `coaching.test.ts` › « repère une pièce attaquée et non défendue » |
| Une pièce défendue n'est pas signalée | › « ignore une pièce défendue » |
| Le roi n'est jamais compté comme en prise | › « ne compte jamais le roi » |

**Ce que la vérification a rattrapé, deux fois** :

1. `pp-sauve-la-tour` acceptait Ta7 — une case qui reste sur la diagonale du
   fou. L'exercice apprenait donc le contraire de son objectif. Le test l'a
   chiffré à 170 centièmes du meilleur coup. Le grand roque, lui, sauve
   réellement la tour et manquait à la liste.
2. `pp-defends-plutot` listait huit coups de cavalier, tous illégaux à cause
   du clouage que je n'avais pas vu. Puis, une fois la position corrigée, la
   tour blanche gagnait une seconde réponse parasite en donnant échec sur la
   rangée du roi noir — d'où le pion b7, qui bloque cette rangée. Le coup
   attendu est maintenant seul, à 340 centièmes du suivant.
