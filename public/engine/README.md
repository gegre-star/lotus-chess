# Moteur Stockfish

Ces fichiers sont le build `lite-single` de Stockfish 18, repris tel quel du
paquet npm `stockfish@18.0.8`.

C'est la seule variante utilisable ici : les autres builds réclament
`SharedArrayBuffer`, donc les en-têtes `Cross-Origin-Opener-Policy` et
`Cross-Origin-Embedder-Policy`, que GitHub Pages ne permet pas de définir.
Le build `lite-single` tourne sans isolation d'origine — vérifié avec
`crossOriginIsolated === false`.

Ils sont versionnés plutôt que tirés de npm à la construction : le paquet
`stockfish` pèse 168 Mo compressés pour 7 Mo réellement utiles.

## Licence

Stockfish est publié sous **GNU General Public License v3** (voir
`LICENSE-stockfish.txt`). Distribuer l'application avec ce moteur soumet la
distribution aux obligations de la GPL v3.
