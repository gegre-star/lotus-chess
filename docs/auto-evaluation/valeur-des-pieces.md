# Valeur des pièces

## Problèmes

Avant ce lot, le thème n'existait que sous forme de leçon : le coach énonçait
les valeurs (pion 1, cavalier 3, fou 3, tour 5, dame 9) et l'élève passait à
l'étape suivante. Aucune position à jouer, aucun retour.

Le risque n'est pas théorique. Connaître le barème ne dit pas quoi en faire :
en partie, la question n'est jamais « combien vaut un cavalier » mais « cette
prise me rapporte-t-elle quelque chose une fois la reprise jouée ». C'est
exactement la marche que la leçon ne faisait pas franchir.

Chess Coach et Chessimo traitent ce thème par des séries de positions où l'on
choisit entre deux captures, avec le décompte affiché après coup. C'est cette
forme qui manquait ici.

## Apprendre

**Objectif mesurable** : reconnaître l'échange gagnant dans 4 positions sur 5.

Trois exercices, du plus simple au moins simple :

| Exercice | Niveau | Ce qu'il isole |
| --- | --- | --- |
| `vp-tour-ou-pion` | 1 | Une prise défendue contre une prise libre |
| `vp-dame-gratuite` | 1 | Deux prises libres de valeurs différentes |
| `vp-mauvaise-reprise` | 2 | Reprendre avec la pièce la moins chère |

Le retour est double, et c'est délibéré. Le **verdict** vient du moteur et
compare le coup au meilleur disponible. Le **calcul matériel** vient du
plateau et s'écrit en points : « Tu prends un pion (+1) mais ta pièce peut
être reprise (−3) → −2 points ». Les deux peuvent diverger — un sacrifice
correct perd du matériel tout en étant le meilleur coup — et c'est ce qui
permet de nommer « brillant » autre chose qu'un bon coup ordinaire.

Les indices suivent les trois paliers demandés : surligner les cases en jeu,
poser la question utile (« ce pion est défendu par lequel ? »), puis donner le
coup.

## Observer

| Critère | Test |
| --- | --- |
| Position légale, deux rois, camp adverse pas en échec | `exercises.test.ts` › « part d'une position légale » |
| Tous les coups attendus sont jouables | › « propose des coups attendus tous jouables » |
| Aucun coup attendu n'est une faute (≤ 1 pion du meilleur) | › « n'accepte que des coups réellement parmi les meilleurs » |
| Aucun coup fort n'est traité comme une faute | › « reconnaît tout coup aussi bon que le meilleur » |
| L'exercice refuse au moins un coup | › « distingue vraiment une bonne réponse d'une mauvaise » |
| Le calcul matériel est exact, reprise comprise | `coaching.test.ts` › « calcul matériel » |
| Le barème correspond à la perte réelle | `coaching.test.ts` › « gradue les pertes » |

**Ce que la vérification a rattrapé** : `vp-tour-ou-pion` et `vp-dame-gratuite`
sont passés du premier coup, mais le même dispositif a trouvé quatre erreurs
dans les autres thèmes — dont un cavalier cloué pour lequel j'avais listé huit
coups tous illégaux.
