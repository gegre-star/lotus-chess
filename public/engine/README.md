# Moteur Stockfish

Ces fichiers sont le build `lite-single` de **Stockfish.js 18** (Stockfish 18
compilé en WebAssembly), repris tel quel du paquet npm `stockfish@18.0.8`.
Ce dossier est publié avec l'application, à côté du binaire, sous
`…/engine/` : ce texte et `LICENSE-stockfish.txt` y sont donc lisibles par
quiconque reçoit le moteur, y compris hors ligne (le service worker les met en
cache avec lui).

C'est la seule variante utilisable ici : les autres builds réclament
`SharedArrayBuffer`, donc les en-têtes `Cross-Origin-Opener-Policy` et
`Cross-Origin-Embedder-Policy`, que GitHub Pages ne permet pas de définir.
Le build `lite-single` tourne sans isolation d'origine — vérifié avec
`crossOriginIsolated === false`.

Ils sont versionnés plutôt que tirés de npm à la construction : le paquet
`stockfish` pèse 168 Mo compressés pour 7 Mo réellement utiles.

## Ce que contient exactement ce dossier

| Fichier | Taille | SHA-256 |
| --- | --- | --- |
| `stockfish-18-lite-single.js` | 21 429 octets | `5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391` |
| `stockfish-18-lite-single.wasm` | 7 295 411 octets | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |
| `LICENSE-stockfish.txt` | — | texte de la GNU GPL v3 |

Ces empreintes permettent de vérifier qu'un binaire reçu est bien celui décrit
ici. Le réseau de neurones NNUE est embarqué dans le `.wasm`.

## Provenance (ce que dit l'en-tête du fichier `.js`)

```
Stockfish.js 18 (c) 2026, Chess.com, LLC
https://github.com/nmrugg/stockfish.js
License: GPLv3

Based on Stockfish (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors.
https://github.com/official-stockfish/Stockfish

Nets by Linmiao Xu (linrock)
https://tests.stockfishchess.org/nns?network_name=nn-9067e33176e
```

- **Enveloppe WebAssembly** : Stockfish.js 18, de Chess.com, LLC, dépôt
  `nmrugg/stockfish.js`. Distribuée ici sous la forme du paquet npm
  `stockfish@18.0.8` (version relevée à l'import de ces fichiers ; elle ne
  figure pas dans les fichiers eux-mêmes).
- **Moteur** : Stockfish 18, dépôt `official-stockfish/Stockfish`, par
  T. Romstad, M. Costalba, J. Kiiski, G. Linscott et les autres contributeurs.
- **Réseau NNUE** : `nn-9067e33176e`, de Linmiao Xu (linrock), page du réseau
  ci-dessus.

## Code source correspondant et offre de source

Stockfish et son enveloppe sont sous **GNU General Public License v3**. Toute
personne qui reçoit ces fichiers avec l'application a le droit d'obtenir le
code source correspondant, gratuitement :

1. **Le code source complet** de l'enveloppe et du moteur se trouve dans les
   deux dépôts publics ci-dessus, dont les adresses sont celles que l'auteur
   du build a lui-même placées en tête du fichier :
   - https://github.com/nmrugg/stockfish.js — enveloppe et scripts de
     compilation vers WebAssembly ;
   - https://github.com/official-stockfish/Stockfish — moteur ;
   - https://tests.stockfishchess.org/nns?network_name=nn-9067e33176e —
     réseau NNUE `nn-9067e33176e`.
2. **Offre écrite** : si ces adresses cessaient de répondre, ou si la
   révision exacte correspondant à ces binaires vous était introuvable,
   écrivez au dépôt qui publie cette application, `gegre-star/lotus-chess`
   sur GitHub (onglet « Issues »), en citant les empreintes SHA-256 du tableau
   ci-dessus : le code source correspondant vous sera fourni sur le même
   canal, sans frais autres que ceux de sa copie. Cette offre vaut aussi
   longtemps que ces fichiers sont distribués avec l'application.

À vérifier lors de la prochaine mise à jour du moteur (non contrôlable depuis
ce dépôt, sans accès au réseau au moment de la rédaction) : l'étiquette Git
exacte de `nmrugg/stockfish.js` correspondant à `stockfish@18.0.8`, à noter
ici pour que « la révision exacte » soit une adresse et non une recherche.
Pour que l'offre ne dépende pas de la survie de dépôts tiers, il est
recommandé d'archiver dans ce dépôt (ou dans une « release ») le code source
de cette révision — voir `docs/licences.md`.

## Comment l'application utilise le moteur

Le moteur s'exécute dans un **Web Worker séparé** (`src/analysis/stockfish.web.ts`).
L'application et lui n'échangent que des **lignes de texte du protocole UCI**
(`uci`, `isready`, `position fen …`, `go movetime …`, puis `info …` et
`bestmove …`) par `postMessage` : aucune structure de données, aucun appel de
fonction, aucun code n'est partagé. Le moteur peut être remplacé par n'importe
quel autre moteur UCI sans toucher au reste de l'application, et l'application
fonctionne sans lui (elle se replie alors sur son propre moteur de jeu).

Ce fonctionnement décrit les faits techniques ; il ne prétend pas trancher la
question juridique de savoir si l'application et le moteur forment un seul
ouvrage au sens de la GPL — voir `docs/licences.md`.

## Licence

Stockfish est publié sous **GNU General Public License v3** (voir
`LICENSE-stockfish.txt`). Distribuer l'application avec ce moteur soumet la
distribution aux obligations de la GPL v3.
