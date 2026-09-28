# Licences des composants tiers

Ce document recense ce que Lotus Chess embarque ou utilise, et sous quelle
licence. Il décrit des faits vérifiés dans le dépôt ; ce qui relève d'une
interprétation juridique est isolé dans la dernière section.

## Ce qui est distribué avec la version web

La version web (site statique) contient trois catégories de code tiers :
le moteur Stockfish, les bibliothèques JavaScript incluses dans le bundle, et
des images des bibliothèques de navigation.

### Stockfish — GNU GPL v3

| Composant | Licence | Où |
| --- | --- | --- |
| Stockfish 18 (moteur d'échecs) | GNU GPL v3 | `public/engine/stockfish-18-lite-single.wasm` |
| Stockfish.js 18 (enveloppe WebAssembly, Chess.com, LLC) | GNU GPL v3 (en-tête du fichier : « License: GPLv3 ») | `public/engine/stockfish-18-lite-single.js` |
| Réseau NNUE `nn-9067e33176e` (Linmiao Xu, « linrock ») | crédité dans l'en-tête ; licence propre non précisée par le fichier — voir « À faire vérifier » | embarqué dans le `.wasm` |

Texte de la licence : `public/engine/LICENSE-stockfish.txt`. Version exacte,
empreintes SHA-256, adresses du code source (dépôts
`official-stockfish/Stockfish` et `nmrugg/stockfish.js`, page du réseau) et
offre de source : `public/engine/README.md`. Ce dossier est publié à côté du
binaire (`…/engine/`) et mis en cache par le service worker avec lui.

Le moteur s'exécute dans un Web Worker séparé et n'échange avec l'application
que des lignes de texte du protocole UCI (voir `public/engine/README.md`).

### Bibliothèques incluses dans le bundle JavaScript

Relevé fait sur la carte des sources (`expo export --dump-sourcemap`) du
bundle produit : **61 paquets** sont réellement embarqués — pas les 700 et
quelques de l'arbre `npm`, dont la plupart sont des outils de construction.

| Licence | Paquets embarqués |
| --- | --- |
| MIT (58) | `react` 19.1.4, `react-dom` 19.1.4, `scheduler`, `react-is`, `react-native-web` 0.21.2, `react-native-svg` 15.12.1, `react-native-screens`, `react-native-safe-area-context`, `react-native-is-edge-to-edge`, `@react-native-async-storage/async-storage` 2.2.0, `expo` 54, `expo-router`, `expo-constants`, `expo-linking`, `expo-modules-core`, `@expo/metro-runtime`, `@expo/cli` (fichiers d'exécution), `@react-navigation/*` (bottom-tabs, core, elements, native, native-stack, routers), `@radix-ui/react-slot`, `@radix-ui/react-compose-refs`, `@babel/runtime`, `@react-native/js-polyfills`, `@react-native/normalize-colors`, `buffer`, `base64-js`, `color`, `color-convert`, `color-name`, `color-string`, `simple-swizzle`, `is-arrayish`, `css-in-js-utils`, `inline-style-prefixer`, `postcss-value-parser`, `fast-deep-equal`, `fbjs`, `invariant`, `memoize-one`, `merge-options`, `is-plain-obj`, `nanoid`, `nullthrows`, `query-string`, `decode-uri-component`, `filter-obj`, `split-on-first`, `strict-uri-encode`, `react-fast-compare`, `shallowequal`, `styleq`, `use-latest-callback`, `use-sync-external-store`, `warn-once`, `escape-string-regexp` |
| BSD-3-Clause (2) | `hyphenate-style-name`, `ieee754` |

Les images des écrans d'erreur d'`expo-router` et les icônes de
`@react-navigation/elements` copiées dans `dist/assets/` appartiennent à ces
mêmes paquets (MIT).

Ces licences (MIT, BSD) exigent de conserver l'avis de droit d'auteur et le
texte de la licence dans les copies distribuées. Le bundle minifié ne les
contient pas : voir « À faire vérifier ».

## Ce qui ne sert qu'au développement et aux tests (non distribué)

| Composant | Licence | Usage |
| --- | --- | --- |
| `chess.js` 1.4.0 | BSD-2-Clause | tests uniquement : référence indépendante pour valider les règles (perft, positions) ; absent du bundle |
| `jest`, `jest-expo`, `babel-preset-expo`, `@babel/core` | MIT | tests et compilation |
| `typescript` 5.9 | Apache-2.0 | vérification des types |
| `@types/*` | MIT | déclarations de types |
| Outils d'export d'Expo (Metro, `lightningcss`, etc.) | MIT, MPL-2.0 (`lightningcss`), BSD, ISC… | construction uniquement ; rien n'en est distribué |
| Playwright | Apache-2.0 | preuves en navigateur (`scripts/preuve-hors-ligne.mjs`, `scripts/generer-icone-maskable.mjs`) ; n'est pas une dépendance du projet |

## Code et contenus propres au projet

- Textes des leçons, positions, personnages, icônes de l'application : créés
  pour le projet (voir le README). Les parties historiques citées sont des
  relevés de parties réelles (des faits, non des œuvres).
- Aucune police n'est chargée : le texte utilise les polices du système ; les
  émojis des onglets sont ceux du système.

## À faire vérifier (avis juridique, hors du champ d'un audit technique)

1. **Portée de la GPL v3 sur l'application.** Lotus Chess n'est pas sous
   licence GPL ; elle embarque et distribue Stockfish, qui l'est. Le moteur est
   isolé (Worker séparé, lignes UCI uniquement, remplaçable) : c'est l'argument
   habituel pour y voir deux programmes distincts distribués ensemble
   (« simple agrégation ») plutôt qu'un ouvrage unique. Le confirmer, ou
   décider de publier l'application elle-même sous une licence compatible,
   demande un avis juridique.
2. **Suffisance de l'offre de source.** La GPL v3, article 6, admet qu'un code
   source hébergé sur un autre serveur soit indiqué « à côté du binaire », mais
   en obligeant le distributeur à garantir qu'il reste disponible aussi
   longtemps que nécessaire. Pointer vers des dépôts tiers en dépend. Faire
   confirmer si cela suffit, ou archiver le code source de la révision exacte
   dans ce dépôt / une « release » (ce qui est le plus sûr, et gratuit).
3. **Licence du réseau NNUE** `nn-9067e33176e` : l'en-tête ne crédite que son
   auteur. À confirmer auprès de la page du réseau (adresse dans
   `public/engine/README.md`).
4. **Étiquette Git exacte** de `nmrugg/stockfish.js` correspondant à
   `stockfish@18.0.8` : à relever et à inscrire dans `public/engine/README.md`.
5. **Avis de droit d'auteur MIT/BSD.** Distribuer le bundle sans les avis des
   61 paquets est l'usage courant, mais la lettre de ces licences les demande.
   Une page « Licences » dans l'application, alimentée par le relevé
   ci-dessus, lèverait le doute.
6. **Tracé des pièces d'échecs — à examiner en priorité.** Les pièces de
   `src/components/ChessPiece.tsx` sont décrites comme vectorielles sur une
   grille de 45 × 45, sans mention d'origine. Le tracé de plusieurs pièces
   (roi, dame, pion) ressemble très fortement au jeu de pièces « Cburnett »
   très répandu (Wikimedia Commons, publié sous des licences libres qui
   imposent des conditions : attribution, partage à l'identique) : mêmes
   coordonnées, arrondies à une décimale. Ce n'est qu'une ressemblance
   constatée à la lecture du code, non une provenance établie : il faut
   retrouver l'origine de ces tracés. Si elle se confirme, il faudra créditer
   l'auteur et respecter la licence choisie — ou redessiner les pièces. Les
   icônes de l'application (`public/icone-*.png`) reprennent le tracé du pion
   et sont concernées de la même façon.
7. **Écran « À propos ».** Pour que ces informations parviennent à
   l'utilisateur final, il faut un écran dans l'application qui renvoie à
   `…/engine/README.md`, à `…/engine/LICENSE-stockfish.txt` et à la liste
   ci-dessus. Cela touche `app/` et `src/components`, hors du périmètre de
   cette livraison : voir le rapport.
