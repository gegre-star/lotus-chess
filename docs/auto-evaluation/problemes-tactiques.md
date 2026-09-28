# Problèmes tactiques

## Problèmes

Audit de l'écran des problèmes et des trente-trois positions qu'il sert. Quatre
défauts, tous invisibles à l'usage — rien ne plantait, rien ne s'affichait en
rouge.

**1. Une position illégale.** `tour-dame` n'avait pas de roi noir :
`3q4/8/8/8/8/8/8/3R2K1`. Tout ce qui se calcule sur une position — échec,
mat, coups légaux, matériel — devient faux sans les deux rois. C'est d'ailleurs
ce qui m'a d'abord fait croire à tort que le problème annonçait un gain de neuf
pions pour quatre : l'erreur venait de la position, pas de l'énoncé.

**2. La moitié des lignes de solution étaient du remplissage.** Les variantes
avaient été calculées à profondeur fixe, et le moteur, n'ayant plus rien à
jouer, faisait la navette avec son roi :

```
promotion   b8=D Rd7 Rh1 Re7 Rh2 Rf7
decouverte  Fxb7+ Rf8 Tf1+ Rg8 Te1 Rh8
```

Le bouton « Solution » dessinait des flèches vers ces coups-là. Un élève qui le
consulte apprend donc que la solution consiste à promouvoir, puis à promener
son roi.

**3. La réussite se mesurait à l'évaluation du moteur**, qui mêle le matériel à
des bonus de position : un cavalier revenu au centre valait jusqu'à un pion de
plus. Et elle se lisait **juste après le coup de l'élève, avant la reprise
adverse** — « +9 » une demi-seconde avant de rendre la dame.

**4. Un problème enseignait autre chose que son titre.** `Interférence`,
difficulté 1250, se résolvait par `Rxb2` : le roi blanc prend une tour laissée
en prise à côté de lui. L'indice disait « Coupe la ligne de la tour noire » et
la description parlait d'une pièce qui s'interpose. Ni l'un ni l'autre ne
correspondait à la position.

Deux défauts hors des problèmes, trouvés au passage :

**5. Le bouton principal de l'accueil ne menait nulle part.** « Continuer »
appelait `router.push('/chess/learn')` ; la route est `/learn`. L'élève
atterrissait sur « page introuvable », donc, par la redirection, sur l'accueil
qu'il venait de quitter.

**6. Les points des leçons étaient refaisables à volonté.** Chaque étape
réussie créditait dix points, sans mémoire : refaire dix fois la même étape
rapportait cent points, et les niveaux comme les trophées s'obtenaient en
tapant deux cases en boucle.

## Apprendre

Un problème doit se terminer quand l'élève a fini sa combinaison — ni avant, ni
après.

- **Ni avant** : sur une fourchette, l'application ne doit pas annoncer
  « Résolu ! » dès l'échec, alors que la tour est encore sur l'échiquier. Prendre
  la pièce fait partie de ce qu'on apprend.
- **Ni après** : une fois le matériel gagné et hors de reprise, insister sur
  trois coups de roi n'apprend rien.

D'où la règle, en deux conditions qui doivent être vraies ensemble : le
matériel est **réellement pris** (on compte les pièces sur l'échiquier), et
l'adversaire **ne peut pas le reprendre** (recherche des prises jusqu'à
épuisement, du point de vue adverse). Mesurer le gain à venir serait plus
« intelligent » et serait une faute : c'est précisément ce qui finissait la
combinaison à la place de l'élève.

Les trente-trois lignes ont été retaillées au dernier coup utile, et les gains
annoncés recalculés sur cette base : seize d'entre eux étaient faux, de 0,2 à
un pion et demi.

## Observer

| Critère | Test |
| --- | --- |
| Chaque problème place les deux rois | `puzzles.test.ts` › « chaque problème place les deux rois » |
| Chaque étape de leçon aussi | › « chaque étape de leçon place les deux rois » |
| Aucune ligne ne traîne après le dernier coup utile | › « la ligne s'arrête au dernier coup utile » (33) |
| La ligne officielle résout le problème | › « la ligne officielle résout le problème » (33) |
| Rien n'est annoncé résolu avant le dernier coup | › « rien n'est annoncé résolu avant le dernier coup » |
| Le gain annoncé est le gain réel | › « le gain annoncé est le gain réel » |
| Un cas prouve que compter trop tôt surévaluerait | › « compter juste après le coup de l'élève… » |
| La reprise adverse est comptée | `materiel.test.ts` › « la reprise est comptée » |
| Sous échec, on ne peut pas passer son tour | › « sous échec, on ne peut pas “passer son tour” » |
| Le mat pèse plus que tout le matériel, des deux côtés | › « le mat pèse plus que tout le matériel » |
| Le pat vaut zéro quel que soit le matériel | › « le pat vaut zéro » |
| Chaque destination de `router.push` existe | `routes.test.ts` › « chaque destination existe » |

Le garde-fou des routes a été vérifié à l'envers : remis sur `/chess/learn`, il
échoue ; remis sur `/learn`, il passe. Un test qui n'échoue jamais ne garde
rien.

**Vérifié dans le navigateur**, sur l'export réellement publié : « Continuer »
mène à `/learn` et l'écran des leçons s'affiche ; sur la fourchette
`3r3k/8/7N/8/8/8/8/6K1`, `Cf7+` ne déclenche plus « Résolu ! », la réponse
adverse arrive après 850 ms avec son fantôme, et c'est `Cxd8` qui termine ; le
bouton « Solution » dessine deux flèches au lieu de trois.

## Ce qui reste à faire

L'application n'a plus de problème d'**interférence** : celui qui portait ce
nom n'en était pas un, et je préfère le dire plutôt que d'inventer une position
que je n'aurais pas validée comme réellement didactique. Il en manque donc un,
ainsi qu'un Novotny, si l'on veut couvrir le thème.
