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
  `stockfish@18.0.8`. Le registre npm indique pour cette version le commit
  `93c994592dcf3b4b21052ab925e9b534df9c0918` de `nmrugg/stockfish.js` (le
  commit s'intitule « 18.0.8 »). Les empreintes SHA-256 du `.js` et du `.wasm`
  de ce dossier sont **identiques** à celles des fichiers
  `bin/stockfish-18-lite-single.*` du paquet npm téléchargé (comparaison
  faite octet pour octet par empreinte).
- **Moteur** : Stockfish 18, dépôt `official-stockfish/Stockfish`, par
  T. Romstad, M. Costalba, J. Kiiski, G. Linscott et les autres contributeurs.
- **Réseau NNUE** : `nn-9067e33176e`, de Linmiao Xu (linrock), page du réseau
  ci-dessus.

## Code source correspondant et offre de source

Stockfish et son enveloppe sont sous **GNU General Public License v3**. Toute
personne qui reçoit ces fichiers avec l'application a le droit d'obtenir le
code source correspondant, gratuitement. Il est **fourni ici même**, dans le
dossier `source/` publié à côté du binaire (`…/engine/source/`), sans dépendre
de dépôts tiers :

| Fichier | Contenu | SHA-256 |
| --- | --- | --- |
| `source/stockfish.js-18.0.8-source.tar.gz` | arbre complet du commit `93c994592dcf3b4b21052ab925e9b534df9c0918` de `nmrugg/stockfish.js` : `src/` (code C++ de Stockfish tel qu'il est compilé vers WebAssembly, avec `nnue/`, `emscripten/` et le `Makefile`), `build.js` (script de compilation), `Copying.txt` (GPL v3) et `AUTHORS` | `06b4d44284f6bba4501c046434459e58d58691ac9a5cd03d076bad7c8e305fdb` |
| `source/nn-9067e33176e8.nnue` | le réseau NNUE (6 617 595 octets) que le script de compilation télécharge et vérifie par son nom (les 12 premiers chiffres de son SHA-256) | `9067e33176e8c5edb7aa8db6a3aedd012f84a1f39872e86357c6c2d0993f314d` |

L'archive est produite par `git archive` puis `gzip -n` : la refaire depuis le
même commit redonne la même empreinte.

**Pour recompiler** : suivre le `README.md` de l'archive (Emscripten 3.1.7
dans le `PATH`, puis `./build.js`, options dans `./build.js --help`). Le script
appelle `make net` dans `src/` pour télécharger et vérifier le réseau
(option `--do-not-verify-nets` pour s'en passer) ; le nom du réseau de cette
variante, `nn-9067e33176e8.nnue`, est écrit dans `src/lite_nets.h`. Le fichier
ci-dessus est fourni pour ne pas dépendre de ce téléchargement ; l'emplacement
où le script le cherche n'a pas été essayé ici.

**Ce qui n'a pas été fait** : le `.wasm` n'a pas été recompilé pour comparer
le résultat à celui de ce dossier (Emscripten 3.1.7 n'était pas disponible).
Le lien entre ces sources et ces binaires repose sur le commit que le registre
npm associe à la version 18.0.8 et sur l'identité des empreintes avec le
paquet npm.

**Autres adresses** (pour mémoire, non nécessaires à l'obtention du source) :
- https://github.com/nmrugg/stockfish.js — enveloppe et scripts de compilation ;
- https://github.com/official-stockfish/Stockfish — moteur d'origine ;
- https://tests.stockfishchess.org/nns?network_name=nn-9067e33176e — page du
  réseau.

**Offre écrite** : si l'un de ces fichiers venait à manquer, écrivez au dépôt
qui publie cette application, `gegre-star/lotus-chess` sur GitHub (onglet
« Issues »), en citant les empreintes SHA-256 ci-dessus : le code source
correspondant vous sera fourni sur le même canal, sans frais autres que ceux
de sa copie. Cette offre vaut aussi longtemps que ces fichiers sont
distribués avec l'application.

## Licence du réseau de neurones

Le réseau `nn-9067e33176e` est publié sur le site de test de Stockfish
(fishtest). Le formulaire de dépôt de ce site, dans son code source public
(`official-stockfish/fishtest`, `server/fishtest/templates/nn_upload.html.j2`),
indique : « By uploading, you license your network under a CC0 license », et
oblige à cocher : « You are the author of this network or have obtained the
network with a CC0 license ». Tout réseau de ce site est donc **mis par son
auteur sous licence CC0** (renonciation aux droits ; redistribution libre).

Deux réserves, dites telles quelles :
- c'est la règle du site, relevée dans son code ; la page propre à ce réseau
  n'a pas pu être lue (elle est derrière une vérification anti-robot) ;
- le `README.md` de Stockfish indique que ses réseaux sont entraînés sur les
  données du projet Leela Chess Zero, « made available under the Open Database
  License (ODbL) ». Si cette licence de la base de données de départ pèse sur le
  réseau entraîné est une question juridique que ce dépôt ne tranche pas.

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
