# Contrôle du centre

## Problèmes

Le thème était traité comme un principe à énoncer — « occupe le centre » —
sans que l'élève ait jamais à choisir entre un coup central et un coup passif.
Un principe qu'on ne met pas en balance ne s'apprend pas : il se récite.

Le risque particulier ici est le faux négatif pédagogique. Au premier coup
d'une partie, Cf3 et Cc3 valent exactement e4 pour un moteur. Un exercice qui
répondrait « faux » à Cc3 punirait un bon coup, et l'élève en retiendrait
l'inverse de ce qu'on veut lui apprendre.

Lichess traite la question par l'explication comparative plutôt que par le
verdict binaire : le coup joué est situé par rapport à l'idée du moment.

## Apprendre

**Objectif mesurable** : choisir le coup qui occupe ou attaque le centre dans
4 cas sur 5.

| Exercice | Niveau | Ce qu'il isole |
| --- | --- | --- |
| `cc-premier-coup` | 1 | Occuper le centre avec un pion |
| `cc-cavalier-au-bord` | 1 | f3 plutôt que h3 |
| `cc-pousse-ou-defends` | 2 | Épauler le pion central plutôt que jouer sur l'aile |

La réponse au faux négatif est le champ `toleres` : les coups objectivement
bons qui ne répondent pas à la consigne y sont listés. L'élève qui joue Cc3
lit « Bon coup — mais ce n'est pas la question ici », ne perd pas de point, et
ne déclenche pas d'indice. Refuser sèchement un coup fort décourage sans rien
apprendre.

Les coups passifs, eux, sont sanctionnés par le verdict ordinaire : a3 au
premier coup reçoit une note d'imprécision, avec l'écart chiffré.

## Observer

| Critère | Test |
| --- | --- |
| Les mêmes cinq critères de validité que les autres thèmes | `exercises.test.ts` (par exercice) |
| Tout coup équivalent au meilleur est attendu **ou** toléré | › « reconnaît tout coup aussi bon que le meilleur » |
| Les coups tolérés sont jouables et distincts des attendus | › « ne tolère que des coups jouables et distincts des attendus » |
| Un coup toléré ne compte pas comme une faute | `exerciseState.test.ts` › « ne compte pas d'erreur pour un bon coup hors sujet » |
| Un coup toléré ne débloque pas d'indice | › « n'en débloque pas après un simple hors-sujet » |

**Limite assumée** : la validation utilise le minimax intégré à profondeur 3,
pas Stockfish, parce que Stockfish ne tourne que dans un navigateur. À cette
profondeur le moteur préfère Cc3 à d4 dans la Philidor, alors que d4 est le
coup de manuel. La tolérance est donc fixée à un pion entier — assez serré
pour rejeter une bévue, assez large pour absorber ce bruit. Un exercice dont
le coup attendu serait mauvais de plus d'un pion échouerait.
