# Livraison de la version web

Comment Lotus Chess est construite, publiée sur GitHub Pages, installée sur un
iPhone et utilisée sans réseau — et ce qui a été prouvé, dans un vrai
navigateur, plutôt que supposé.

## Chaîne de construction

```
expo export --platform web        →  dist/ (page minimale, bundle, moteur, icônes)
node scripts/finaliser-web.mjs    →  + manifeste, métadonnées Apple, CSP,
                                       service worker, repli 404.html
```

`LOTUS_BASE_URL` (le nom du dépôt sous GitHub Pages, `/lotus-chess`) doit être
le même pour les deux commandes. Le workflow `deploy.yml` s'en charge ; la CI
(`ci.yml`, dans les deux copies) construit et finalise aussi le site, pour
qu'un changement de gabarit d'Expo échoue avant la fusion et non à la
publication.

| Fichier | Rôle |
| --- | --- |
| `scripts/finaliser-web.mjs` | ligne de commande ; code de sortie 1 au moindre problème |
| `scripts/finaliser-lib.js` | retouches du HTML, manifeste, CSP, orchestration (testable) |
| `scripts/service-worker.js` | génération pure : liste de fichiers → source du service worker + version |
| `scripts/sw-modele.js` | le service worker lui-même (JavaScript valide, avec une constante `CONFIG` remplie à la construction) |
| `scripts/generer-icone-maskable.mjs` | rend `public/icone-maskable-512.png` |
| `scripts/preuve-hors-ligne.mjs` | la preuve en navigateur décrite plus bas, rejouable |
| `scripts/__tests__/` | tests Jest de tout ce qui précède (53 tests) |

La logique est en CommonJS (`.js`) parce que Jest ne charge pas les modules
`.mjs` ici (essayé : « A dynamic import callback was invoked without
--experimental-vm-modules ») ; `finaliser-web.mjs` l'importe simplement.

Le mode développement (Expo Go, `expo start`) n'est pas touché : le service
worker, le manifeste et la CSP n'existent que dans `dist/`, produit par le
finaliseur. `app.config.js` et `app.json` sont inchangés.

## Les remplacements échouent bruyamment

Le finaliseur retouche le HTML d'Expo par remplacement de chaînes. Auparavant,
un remplacement dont la cible avait disparu ne faisait rien, sans erreur : on
aurait publié un site sans plein écran iOS ou sans manifeste. Désormais chaque
cible (`<html lang="en">`, l'étiquette `viewport`, `</head>`, `<head>`) doit
exister **exactement une fois**, sinon le script s'arrête avec un message qui
dit quoi et où :

```
ÉCHEC de la finalisation : dist/index.html : impossible de passer la page en français (attribut lang) — « <html lang="en"> » est introuvable. Le gabarit HTML de l'export Expo a sans doute changé : adapter scripts/finaliser-lib.js.
```

Sont aussi vérifiés : `index.html` présent, icônes du manifeste présentes, le
bundle désigné par la page présent, moteur Stockfish présent. Le script est
rejouable (un marqueur évite la double retouche) et refuse de rejouer sur une
autre base. Tests : `scripts/__tests__/finaliser.test.js`, sur un dossier
factice.

## Service worker (hors ligne)

### Ce qu'il fait

- **Précache** à l'installation : `index.html`, `manifest.webmanifest`, icônes,
  bundle(s) sous `_expo/static/`, `assets/`, et `engine/*` — dont le `.wasm` de
  7 Mo, c'est ce qui rend l'analyse et les adversaires Stockfish utilisables
  hors ligne — avec la licence et l'offre de source du moteur (la GPL les veut
  à côté du binaire).
- **Deux caches**, nommés d'après un hachage du contenu :
  `lotus-chess:app:<hachage>` et `lotus-chess:moteur:<hachage>`. Une nouvelle
  version de l'interface change le premier ; le second ne change que si un
  fichier du moteur change : mettre l'interface à jour ne retélécharge pas
  7 Mo. Le hachage de l'application inclut aussi le modèle du service worker :
  changer la stratégie de cache produit une nouvelle version.
- **Cache d'abord** pour les GET de même origine sous la base ; ce que le
  précache n'avait pas prévu est gardé au passage (réponses complètes
  seulement).
- **Navigation** vers une page (racine, route de l'application, `404.html`) →
  `index.html` du cache : l'application est une page unique. Une navigation
  vers un vrai fichier (`LICENSE-stockfish.txt`) suit la voie ordinaire.
- **Précache sans cache HTTP** (`cache: 'reload'`) : GitHub Pages répond
  `max-age=600` ; sans cela une nouvelle version pourrait précacher un
  `index.html` vieux de dix minutes, qui désigne l'ancien bundle. Un fichier
  qui répond autre chose que 2xx fait échouer l'installation : on reste alors
  sur l'ancienne version plutôt que d'en installer une trouée.
- **Activation** : suppression des anciens caches `lotus-chess:*` (jamais ceux
  d'une autre application du même compte `github.io`), puis `clients.claim()`.
  `skipWaiting()` à l'installation.
- Le service worker est servi depuis la racine de sa portée
  (`/lotus-chess/sw.js`) : un worker ne peut contrôler que ce qui est sous son
  propre chemin.
- **Enregistrement** : script en ligne court injecté dans le HTML, après
  `load` (le précache de 7 Mo ne concurrence pas le premier affichage), avec
  `updateViaCache: 'none'` et une demande de mise à jour à chaque retour au
  premier plan (une PWA iOS reprise de l'arrière-plan ne recharge pas la page).

### Comment une mise à jour arrive sur un iPhone

Sur iOS, une PWA reste sur sa version jusqu'à sa fermeture complète.
Au lancement N, la page vient du cache (version N). En tâche de fond, le
navigateur trouve un nouveau `sw.js` (son contenu a changé, car il porte la
version), l'installe, l'active (`skipWaiting`) et supprime l'ancien cache. **Au
lancement N+1**, la nouvelle version s'affiche. Une partie en cours n'est
jamais interrompue par un rechargement automatique.

### Limites connues

- **Un premier chargement en ligne est indispensable** : l'application n'est
  hors ligne qu'une fois le précache terminé (quelques secondes, 7 Mo).
- Une PWA **non installée** sur l'écran d'accueil reste soumise à la règle
  d'iOS qui efface le stockage d'un site après sept jours sans visite ; installée,
  elle ne l'est pas (voir `finaliser-web.mjs`).
- Si le précache échoue (réseau coupé en plein téléchargement, un fichier
  manquant), le service worker ne s'installe pas et l'application reste
  utilisable en ligne, sans hors ligne ; le message est dans la console.
- Si l'utilisateur ouvre l'onglet « Jouer » et choisit Stockfish tout de suite
  après son premier chargement, le moteur peut être téléchargé deux fois (une
  fois par la page, une fois par le précache) : c'est le prix de
  `cache: 'reload'`.

## Preuve dans un navigateur (Chromium via Playwright)

`scripts/preuve-hors-ligne.mjs <dist> [<dist-v2>]` :

1. sert `dist` sous `/lotus-chess/` avec les en-têtes de GitHub Pages
   (`Cache-Control: max-age=600`, `404.html` sur URL inconnue), via
   `python3 -m http.server` (module `http.server`, port 8231) ;
2. charge la page, attend l'activation du service worker ;
3. coupe le réseau (`context.setOffline(true)`), recharge ;
4. vérifie l'accueil, l'ouverture directe de `/play`, un Worker Stockfish
   créé comme le fait l'application, une partie contre « Solide · 1700 »
   (Stockfish) coup après coup, tous les écrans et un problème tactique ;
5. publie une seconde version à la place de la première, revient en ligne et
   vérifie le remplacement des caches, puis relance hors ligne ;
6. témoin : un contexte vierge, réseau coupé, ne peut pas charger la page.

Résultat (rejeu final sur la version livrée) : **40 vérifications, 0 échec.**

```
== 1. Premier chargement (en ligne) ==
OK     l'accueil s'affiche en ligne
OK     portée du service worker = le sous-dossier — http://127.0.0.1:8231/lotus-chess/
OK     script servi depuis la racine de sa portée — http://127.0.0.1:8231/lotus-chess/sw.js
OK     le service worker contrôle la page (clients.claim)
   caches : {"lotus-chess:moteur:2cbe17cc77bea9d9":4,"lotus-chess:app:e805a3d0774e9a82":25}
OK     le cache du moteur contient le .js, le .wasm (7 Mo), la licence GPL et l'offre de source
OK     la CSP est effective : un script en ligne injecté ne s'exécute pas — __intrus=0
OK     la CSP est effective : new Function / eval sont refusés
== 2. Réseau coupé ==
OK     rechargement hors ligne : l'accueil s'affiche
OK     la page vient du service worker — /lotus-chess/
OK     le bundle JS vient du cache
OK     aucune requête en échec après rechargement
OK     ouverture directe de /play hors ligne (navigation → index du cache)
OK     Stockfish (Worker + wasm) répond hors ligne — bestmove e7e5 ponder d2d4
OK     il a bien calculé (lignes « info depth »)
OK     le .wasm de 7 Mo est servi par le service worker
OK     le script du worker passe par le service worker
OK     l'adversaire répond hors ligne, coup après coup — 3 réponses
OK     l'application a démarré le Worker Stockfish hors ligne
OK     aucune requête en échec pendant la partie
OK     aucune erreur JavaScript dans la page
OK     aucune violation de la politique de sécurité du contenu
OK     écrans /learn /puzzles /train /games / /route-inexistante affichés hors ligne
== 3. Nouvelle version ==
   caches : {"lotus-chess:moteur:2cbe17cc77bea9d9":4,"lotus-chess:app:63d36ef70a2285db":25}
OK     l'ancien cache d'application est supprimé, le nouveau prend sa place — app:e805a3d0774e9a82 -> app:63d36ef70a2285db
OK     le cache du moteur, inchangé, est conservé (pas de retéléchargement de 7 Mo)
OK     il ne reste que deux caches
OK     la nouvelle version se lance hors ligne
OK     hors ligne, la page affiche le contenu de la NOUVELLE version (« version 2 »)
OK     l'ancien contenu a disparu
== Témoin ==
OK     sans service worker, la page est inaccessible hors ligne — net::ERR_INTERNET_DISCONNECTED
```

La « nouvelle version » a été produite en modifiant temporairement le texte
d'accueil (`app/index.tsx`, « Bienvenue (version 2) ! »), en reconstruisant
dans un autre dossier, puis en annulant la modification : l'interface vue hors
ligne après la mise à jour est bien la nouvelle, et le hachage du cache de
l'application passe de `e805a3d0774e9a82` à `63d36ef70a2285db` tandis que celui
du moteur reste `2cbe17cc77bea9d9`.

Ce que la preuve établit : le Worker Stockfish (script et `.wasm`) est bien
servi par le service worker et calcule hors ligne ; l'application le démarre
hors ligne. Ce qu'elle n'établit pas : que l'adversaire ait joué avec Stockfish
plutôt qu'avec le moteur de repli (l'application se replie sans bruit, et les
premiers coups viennent d'un livre d'ouvertures). Le calcul de Stockfish hors
ligne est prouvé séparément par le test direct du Worker (`bestmove` après des
lignes `info depth`).

**Non prouvé : Safari sur iPhone.** Seul Chromium était disponible. Contrôle
manuel à faire sur un iPhone après le premier déploiement : ouvrir le site,
attendre dix secondes, « Sur l'écran d'accueil », fermer, passer en mode avion,
lancer l'icône, jouer un coup contre un niveau « Stockfish ».

## Politique de sécurité du contenu (CSP) : appliquée

GitHub Pages ne permet pas de définir d'en-têtes ; une balise
`<meta http-equiv="Content-Security-Policy">` est possible, posée en tête du
`<head>` par le finaliseur :

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-…'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self';
manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'
```

La condition posée était de ne l'appliquer que si tout fonctionne avec elle.
La preuve ci-dessus a été rejouée **avec** la CSP : application, tous les
écrans, Worker Stockfish, service worker, hors ligne et mise à jour, avec zéro
violation (écouteur `securitypolicyviolation` et console) et zéro erreur de
page. La CSP est bien effective : un script en ligne injecté et `new Function`
sont refusés.

Points qui ont demandé vérification :

- **`eval` dans le bundle Expo** : le bundle contient bien deux occurrences
  d'`eval(` (chargement de bundles fractionnés, et un repli Node pour
  `crypto`). Aucune ne s'exécute dans l'application web : sans `'unsafe-eval'`,
  aucun écran ne produit de violation. La politique n'autorise donc **pas**
  `eval`.
- **Script en ligne** : un seul, l'enregistrement du service worker,
  autorisé par son hachage SHA-256, calculé sur le HTML final (tout futur
  script en ligne ajouté par Expo serait aussi haché au lieu de casser
  l'application).
- **WebAssembly** : `'wasm-unsafe-eval'` autorise la compilation de
  Stockfish sans ouvrir `eval`. Le Worker du moteur, chargé depuis une URL de
  même origine, n'hérite pas de la politique de la page ; la directive est
  gardée par prudence pour les navigateurs qui feraient autrement.
- **Styles** : `'unsafe-inline'` est indispensable, `react-native-web` fabrique
  ses feuilles et ses attributs `style` à l'exécution.

Limites : `frame-ancestors` et `report-uri` sont ignorés dans une balise
`<meta>` ; on ne peut pas interdire l'inclusion du site dans un cadre. Non
vérifié sur Safari (voir ci-dessus). **Interrupteur de secours :** construire
avec `LOTUS_CSP=0` (variable d'environnement de l'étape « Finaliser le site »)
publie sans CSP, si un navigateur la refusait.

## Icône maskable

`public/icone-maskable-512.png` : fond vert plein jusqu'aux bords, pion agrandi
de 20 % par rapport aux icônes `any`, contenu dans la zone sûre (rayon maximal
mesuré 178,7 px pour une zone sûre de 204,8 px, soit 40 % de 512). Déclarée
dans le manifeste dans une entrée `purpose: "maskable"` distincte des deux
entrées `any`. Régénérable avec `scripts/generer-icone-maskable.mjs`, qui
refuse d'écrire un motif hors de la zone sûre ou un fond non plein.

## Workflows GitHub

- `permissions: contents: read` ajouté aux deux `ci.yml` (celui de la racine
  du dépôt, qui contient deux jobs, et celui de `lotus-chess/.github/`) ;
  `deploy.yml` avait déjà ses droits (`pages: write`, `id-token: write`).
- `node-version` 20 → 22 dans les trois fichiers ; `npm ci`, `tsc` et Jest
  conservés.
- Nouvelle étape dans les jobs Lotus Chess de la CI : construire et finaliser
  le site, pour attraper avant la fusion un changement de gabarit d'Expo.
- La structure à deux dépôts est inchangée : le workflow de la racine a un job
  `lotus-chess` avec `working-directory` ; la copie de `lotus-chess/.github/`
  sert le dépôt miroir `gegre-star/lotus-chess`, où `lotus-chess/` est la
  racine.
- Non fait, à envisager : les actions elles-mêmes (`actions/checkout@v4`,
  `actions/setup-node@v4`…) s'exécutent sur un runtime Node dont GitHub prépare
  aussi le remplacement ; leurs versions plus récentes n'ont pas pu être
  vérifiées hors ligne.

## Ce que promettent README et manifeste

| Promesse | Constat |
| --- | --- |
| Manifeste : « Apprendre les échecs en français, hors ligne. » | Était fausse (aucun service worker) ; **vraie** désormais après un premier chargement en ligne, prouvé ci-dessus. |
| README : « entièrement hors ligne » | Vrai pour les données (progression en stockage local, moteur de jeu embarqué). Pour la version web, vrai après le premier chargement ; pour Expo Go, le paquet de l'application vient du serveur de développement de l'ordinateur. |
| README : 27 leçons, 3 niveaux, 33 problèmes de 600 à 1550 sur 16 thèmes, 17 ouvertures, 5 adversaires de 500 à 1900 Elo, 12 trophées | Vérifié dans `src/chess/content.ts` : 27, 3, 33, 600–1550, 16, 17, 5 (500, 900, 1200, 1500, 1900), 12. Exact. Le README ne mentionne pas les cinq niveaux Stockfish (1320–3190), propres à la version web. |
| README : « Il te faut Node.js 20 » | **Périmé** : la CI et le déploiement utilisent Node 22. À corriger dans `README.md` (hors périmètre de cette livraison). |
| README : ne parle ni de l'installation sur l'écran d'accueil ni de la version web | À ajouter (hors périmètre) : le paragraphe « Installer sur iPhone » = ouvrir l'adresse GitHub Pages dans Safari, « Partager » → « Sur l'écran d'accueil », attendre le premier chargement. |
