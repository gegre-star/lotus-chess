/**
 * Régénère `preuves-stockfish.json` : l'évaluation de chaque coup légal de
 * chaque position d'exercice, par Stockfish.
 *
 * Pourquoi un fichier et pas un appel au moteur dans les tests : Stockfish
 * tourne en WebAssembly, ce qui demande deux minutes et un processus à part.
 * On le lance donc ici, une fois, et les tests relisent le résultat — sans
 * jamais le croire sur parole : ils vérifient que le fichier décrit bien la
 * position de l'exercice (mêmes coups légaux), sinon ils échouent en disant
 * de relancer ce script.
 *
 * Usage, depuis `lotus-chess/` :
 *
 *   node src/chess/__tests__/donnees/generer-preuves.cjs [profondeur] [--force]
 *
 * Sans `--force`, seules les positions absentes du fichier sont calculées.
 * Profondeur 16 par défaut : assez pour départager les coups d'une finale à
 * quelques dixièmes de pion, assez court pour tenir en quelques minutes.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const Module = require('module');
const path = require('path');

const racine = path.resolve(__dirname, '../../../..');
const chess = path.join(racine, 'src/chess');
const { Chess } = require(path.join(racine, 'node_modules/chess.js'));
const ts = require(path.join(racine, 'node_modules/typescript'));

const profondeur = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a))) || 16;
const force = process.argv.includes('--force');
const sortie = path.join(__dirname, 'preuves-stockfish.json');

/** Charge un module TypeScript sans passer par jest. */
function charger(nom) {
  const fichier = path.join(chess, `${nom}.ts`);
  const js = ts.transpileModule(fs.readFileSync(fichier, 'utf8'), {
    compilerOptions: { module: 'commonjs', target: 'es2020' },
  }).outputText;
  const m = new Module(fichier);
  m.filename = fichier;
  m.paths = Module._nodeModulePaths(chess);
  m._compile(js, fichier);
  return m.exports;
}

const { EXERCISES } = charger('exercises');
const fens = [...new Set(EXERCISES.map((e) => e.fen))];

const existant = fs.existsSync(sortie) ? JSON.parse(fs.readFileSync(sortie, 'utf8')) : { positions: {} };
existant.moteur = 'Stockfish 18 lite (WebAssembly)';
existant.profondeur = profondeur;
// on ne garde que les positions encore utilisées
for (const fen of Object.keys(existant.positions)) if (!fens.includes(fen)) delete existant.positions[fen];

const moteur = spawn('node', [path.join(racine, 'public/engine/stockfish-18-lite-single.js')]);
let tampon = '';
let ecouteurs = [];
moteur.stdout.on('data', (d) => {
  tampon += d;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const ligne = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    ecouteurs.slice().forEach((e) => e(ligne));
  }
});
const envoyer = (s) => moteur.stdin.write(`${s}\n`);
const attendre = (fini, surLigne) =>
  new Promise((resolve) => {
    const e = (l) => {
      if (surLigne) surLigne(l);
      if (fini(l)) {
        ecouteurs = ecouteurs.filter((x) => x !== e);
        resolve();
      }
    };
    ecouteurs.push(e);
  });

(async () => {
  envoyer('uci');
  await attendre((l) => l === 'uciok');
  for (const fen of fens) {
    if (!force && existant.positions[fen]) continue;
    const jeu = new Chess(fen);
    const legaux = jeu.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''));
    envoyer(`setoption name MultiPV value ${legaux.length}`);
    envoyer('isready');
    await attendre((l) => l === 'readyok');
    const lignes = {};
    envoyer(`position fen ${fen}`);
    envoyer(`go depth ${profondeur}`);
    await attendre(
      (l) => l.startsWith('bestmove'),
      (l) => {
        const m = l.match(/ multipv (\d+) score (cp|mate) (-?\d+).* pv (\S+)/);
        // la dernière ligne vue pour un coup est la plus profonde
        if (m) lignes[m[4]] = m[2] === 'cp' ? { cp: Number(m[3]) } : { mat: Number(m[3]) };
      },
    );
    const manquants = legaux.filter((u) => !lignes[u]);
    if (manquants.length > 0) throw new Error(`${fen} : coups sans évaluation : ${manquants.join(' ')}`);
    const coups = {};
    [...legaux].sort().forEach((u) => (coups[u] = lignes[u]));
    existant.positions[fen] = { coups };
    console.log(`${fen} : ${legaux.length} coups`);
    // on écrit au fur et à mesure : une coupure ne fait pas tout perdre
    fs.writeFileSync(sortie, `${JSON.stringify(existant, null, 1)}\n`);
  }
  moteur.kill();
  fs.writeFileSync(sortie, `${JSON.stringify(existant, null, 1)}\n`);
  process.exit(0);
})();
