# Échiquier tactile

## Problèmes

Un audit UX de l'échiquier, sur iPhone Safari en PWA, a relevé quatre défauts.

1. **Pas de glisser-déposer.** Un vrai geste d2 → d4 ne jouait rien. Sur un
   téléphone, c'est le geste que fait spontanément quiconque a déjà joué aux
   échecs ailleurs ; le toucher-toucher se découvre, le glissement s'attend.
2. **Le glissement sélectionnait du texte.** Les repères de coordonnées (le
   « 3 » et le « 2 » des rangées) passaient en surbrillance bleue : le
   navigateur traitait le geste comme une sélection de texte.
3. **Aucune étiquette d'accessibilité.** Un lecteur d'écran annonçait
   64 boutons sans nom.
4. **Un échiquier entièrement redessiné à chaque rendu.** 64 `Pressable` et
   64 closures recréés à chaque tic de minuteur ou changement d'état de
   l'écran, alors que la plupart des cases n'avaient pas bougé.

## Apprendre

Ce n'est pas une notion à faire acquérir à l'élève : c'est une propriété du
composant. Le critère est que **le geste naturel marche, sans rien casser de
celui qui marchait déjà**.

Le choix structurant : un glissement **se comporte comme deux touchers**.
Les écrans ne connaissent que `onPressSquare(case)` et ne changent pas.

| Moment du geste | Appel à l'écran |
| --- | --- |
| Le doigt dépasse 6 px sur une pièce saisissable | `onPressSquare(départ)` : l'écran sélectionne, montre les cases d'arrivée |
| Relâchement sur une autre case | `onPressSquare(arrivée)` : l'écran joue, refuse en expliquant, ou change de sélection |
| Relâchement sur la case de départ | rien de plus : la pièce reste sélectionnée, comme après un toucher |
| Relâchement hors de l'échiquier, ou geste repris par le système | rien de plus : la pièce revient, l'écran garde l'état du premier toucher |

Le composant ne connaît pas les règles. Il ne décide jamais qu'un coup est
légal : il répète des touchers, l'écran juge.

**Qui peut glisser.** Deux gardes, complémentaires. `peutGlisser(case)`
(par défaut : une pièce du camp au trait) évite de saisir une pièce adverse,
ce qui, avec une pièce déjà sélectionnée, aurait joué une capture au premier
mouvement. Et surtout le glissement n'est suivi que **tant que `selected`
désigne la case de départ** : c'est le verdict de l'écran, seul juge de ce qui
est jouable (pas son tour, pièce qui ne peut pas bouger, exercice qui
n'autorise qu'une pièce). Une prop seule aurait dupliqué les règles dans le
composant ; l'écoute seule aurait laissé un premier toucher parasite sur les
pièces refusées. Ensemble, aucun état incohérent : si l'écran ne suit pas, la
pièce ne vole pas et aucun coup n'est envoyé à l'aveugle.

**Où tombe la pièce.** Sur écran tactile la pièce est remontée de 0,75 case
au-dessus du doigt pour ne pas être cachée par lui, et c'est elle, pas le bout
du doigt, qui désigne la case d'arrivée : la case surlignée est celle que l'on
voit, et la pièce tombe où elle est. À la souris le décalage est nul.

**Web et natif : un seul mécanisme.** Le système de « responder » de React
Native (`onStartShouldSetResponderCapture`, `onMoveShouldSetResponderCapture`,
`onResponderGrant/Move/Release/Terminate`) existe à l'identique dans
react-native-web, au-dessus des événements souris et tactiles. Un seul jeu de
gestionnaires sert donc iPhone Safari, Android, iOS natif et le bureau, et se
teste en l'appelant directement. Les pointer events auraient demandé un second
chemin pour le natif. Ce que le code ne peut pas régler, la configuration le
règle : sur le web `touch-action: none`, `user-select: none` et
`-webkit-touch-callout: none` sur l'échiquier ; sur le natif la prop
`onGlisser(actif)`, par laquelle l'écran fige sa `ScrollView`.

Les cases restent des `Pressable` : le toucher passe par elles, avec leur
clavier et leur accessibilité, et le glissement ne prend la main qu'après le
seuil de 6 px (la case reçoit alors un `terminate` et n'appelle pas `onPress`).

## Observer

### Tests unitaires

Trois fichiers, sous `src/components/__tests__/` (`npx jest src/components`).

| Critère | Test |
| --- | --- |
| Le glissement joue d2-d4 par deux touchers, départ puis arrivée | `ChessBoard.glisser` › « joue d2-d4 en glissant… » |
| Les cases d'arrivée sont montrées avant tout relâchement | › « montre les cases d'arrivée dès le début du geste… » |
| Sous le seuil, un toucher reste un toucher ; pile au seuil, un glissement ; la distance se mesure depuis l'appui | › `seuil` (3 tests) |
| Relâcher sur le départ ne rappelle rien | › « relâcher sur la case de départ… » |
| Hors échiquier, ou geste repris par le système : rien n'est joué, état propre | › « hors de l'échiquier… », « annulé par le système… » |
| Case illégale : rien n'est joué, l'écran explique comme après un toucher | › « vers une case illégale… » |
| Pièce adverse, case vide, `peutGlisser` | › `qui peut glisser` |
| L'écran refuse la sélection : aucun coup envoyé à l'aveugle | › « n'ajoute pas de coup si l'écran refuse… » |
| Pièce déjà sélectionnée : le départ n'est pas rappelé | › « n'appelle pas le départ une seconde fois… » |
| Deuxième doigt ignoré | › `plusieurs doigts` |
| Pièce en vol : suit la souris ; remontée au-dessus du doigt et désignant la case | › `pièce en vol` |
| Échiquier retourné | › `échiquier retourné` |
| Tailles 240 et 397 (non multiple de 8), 64 centres, frontières et bords au pixel près, les deux orientations | › `géométrie du glissement`, `taille 240`, `taille 397` |
| Le `click` tardif du navigateur sur la case de départ est ignoré | › `clic tardif du navigateur` |
| `onGlisser(true/false)`, y compris au démontage | › `avertit l'écran` |
| Réglages navigateur posés sur le web, absents ailleurs ; défilement de la page pris en compte | › `sur le web` |
| Après un coup, seules les cases modifiées re-rendent | `ChessBoard.rendu` › `mémoïsation des cases` |
| Un changement de `arrows` ne re-rend aucune case | › « un changement de flèches ne redessine aucune case » |
| Libellés « e4, pion blanc », « e5, vide », « sélectionnée », « coup possible », « roi en échec » ; 64 libellés distincts ; rôle `button` | `ChessBoard.rendu` › `accessibilité` |

**Mesures de rendu** (compteur injecté dans `Case`, `sondeRendu`) :

| Changement | Cases re-rendues |
| --- | --- |
| Montage | 64 |
| 1.e4 (coup seul) | 2 (e2, e4) |
| 1.e4 après sélection de e2 (pastilles effacées) | 3 (e2, e3, e4) |
| exd5 | 2 (e4, d5) |
| Tour donnant échec | 3 (départ, arrivée, roi en échec) |
| Changement de `arrows` (contenu) | 0 |
| Props identiques mais neuves (tableaux, fonction) | 0 |

Avant : 64 à chaque rendu, sans exception.

### Preuve navigateur

Chromium 1194 piloté par Playwright, application exportée en web
(`expo export`, base `/lotus-chess`), onglet « Jouer » contre Pixou.
Geste tactile : `Input.dispatchTouchEvent` (CDP), contexte `hasTouch` et
`isMobile`, viewport 390 × 844 puis 390 × 600 (la page y défile). 44
vérifications, 44 réussies.

| Vérification | Résultat |
| --- | --- |
| Glisser à la souris d2 → d4 (12 étapes) | 1.d4 joué ; liste des coups « 1. d4 » |
| Pièce en vol | centrée sous le curseur à 1 px près ; case de départ sélectionnée et cases d'arrivée visibles en plein geste |
| Sélection de texte, souris et doigt, pendant et après | aucune (`getSelection()` vide) |
| CSS de l'échiquier | `touch-action: none`, `user-select: none` calculés ; `WebkitTouchCallout: 'none'` transmis à l'élément |
| Tactile 390 × 844 : d2 → d4 | 1.d4 joué, pièce au-dessus du doigt (décalage 35,8 px), aucun défilement |
| Tactile 390 × 600 : d2 → d4 | idem, aucun défilement de la zone qui défile |
| Contrôle : balayage hors échiquier sur 390 × 600 | la page défile : l'absence de défilement pendant le glissement prouve donc quelque chose |
| Contre-épreuve : même geste, `touch-action` retiré | la page défile de 45 px pendant le geste |
| Glissement vers une case illégale (e2 → e5), souris et doigt | rien de joué ; rien de sélectionné, aucune pièce en vol |
| Lâcher hors de l'échiquier, souris et doigt | rien de joué ; le cavalier reste sélectionné, la pièce est reposée |
| Bord au pixel : lâcher 0,3 px avant / après la limite basse de e4 | e4 joué / e3 joué |
| Toucher-toucher, clic et tap tactile | d2 puis d4 joue d4 ; le premier toucher montre les coups |
| 64 cases | `role="button"` et `aria-label` dans le DOM réel |

Captures (regardées, non conservées) : en plein geste, à la souris comme au
doigt, la pièce flotte agrandie avec une ombre, la case survolée est encadrée
et surlignée, la case de départ garde la pièce estompée.

**Ce que le navigateur a changé.** Rien n'a échoué au premier essai sur le
geste lui-même ; les deux surprises étaient de méthode. `-webkit-touch-callout`
n'existe pas dans Chromium : on ne peut vérifier que sa transmission à
l'élément, pas son effet. Et l'export web ne trouvait aucune route depuis un
worktree sous `.claude/` (« No routes found ») : Metro ignore les dossiers
cachés. Construire depuis une copie hors de `.claude/` règle le problème.

### Ce qui n'est pas prouvé

- **iPhone Safari réel.** Chromium émule le tactile, pas le comportement de
  Safari face à `touch-action` ni son `click` tardif ; ce dernier est couvert
  par une garde de 350 ms sur la case de départ, testée en unitaire seulement.
- **Natif (iOS, Android).** Le chemin `measure` est testé en unitaire avec une
  référence simulée ; aucun appareil n'a été utilisé. Sur natif, l'écran doit
  brancher `onGlisser` sur `scrollEnabled` de sa `ScrollView`.
