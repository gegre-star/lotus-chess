// Importe une sélection de problèmes de la base libre de Lichess (licence CC0,
// https://database.lichess.org/#puzzles) dans src/chess/problemes-lichess.ts.
//
// Usage : node scripts/importer-problemes.mjs
// À relancer seulement pour rafraîchir la sélection : le résultat est versionné.
//
// On ne télécharge que le début du fichier (≈ 25 Mo sur 300) : il contient plus
// de 400 000 problèmes, largement de quoi choisir. La sélection est déterministe
// (mêmes critères → même fichier), pour que Git ne montre que de vrais changements.
import { writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const URL_BASE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OCTETS = 25_000_000;
const NIVEAU_MIN = 600;
const NIVEAU_MAX = 2400;
const PAS = 100; // un palier tous les 100 points
const PAR_PALIER = 34; // 19 paliers × 34 ≈ 650 problèmes
const POPULARITE_MIN = 92;
const PARTIES_MIN = 800;

// Thème principal affiché une fois le problème résolu, du plus parlant au plus général.
const THEMES_PRINCIPAUX = [
  'mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'backRankMate', 'smotheredMate', 'anastasiaMate',
  'arabianMate', 'bodenMate', 'doubleBishopMate', 'hookMate', 'fork', 'pin', 'skewer',
  'discoveredAttack', 'doubleCheck', 'deflection', 'attraction', 'interference', 'clearance',
  'sacrifice', 'hangingPiece', 'trappedPiece', 'zugzwang', 'quietMove', 'promotion',
  'enPassant', 'castling', 'xRayAttack', 'exposedKing', 'capturingDefender', 'defensiveMove',
  'intermezzo', 'advancedPawn', 'mate', 'equality', 'advantage', 'crushing',
];

async function telechargerDebut() {
  const r = await fetch(URL_BASE, { headers: { Range: `bytes=0-${OCTETS}` } });
  if (r.status !== 206 && r.status !== 200) throw new Error(`Lichess a répondu ${r.status}`);
  const tampon = Buffer.from(await r.arrayBuffer());
  // Le flux est coupé en plein milieu : la décompression finit en erreur, ce qui est normal.
  return new Promise((resolve) => {
    const d = zlib.createZstdDecompress();
    const morceaux = [];
    d.on('data', (c) => morceaux.push(c));
    d.on('error', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    d.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')));
    d.end(tampon);
  });
}

function themePrincipal(themes) {
  return THEMES_PRINCIPAUX.find((t) => themes.includes(t)) ?? themes[0] ?? 'advantage';
}

const texte = await telechargerDebut();
const lignes = texte.split('\n').slice(1, -1); // en-tête retiré, dernière ligne (coupée) ignorée

const candidats = [];
for (const l of lignes) {
  const c = l.split(',');
  if (c.length < 8) continue;
  const [id, fen, coups, niveau, , popularite, parties, themes] = c;
  const rating = Number(niveau);
  if (rating < NIVEAU_MIN || rating >= NIVEAU_MAX + PAS) continue;
  if (Number(popularite) < POPULARITE_MIN || Number(parties) < PARTIES_MIN) continue;
  const liste = coups.split(' ');
  if (liste.length < 2) continue;
  candidats.push({ id, fen, coups: liste, rating, themes: themes.split(' ') });
}

// Dans chaque palier, on alterne les thèmes principaux pour varier les motifs.
const retenus = [];
for (let bas = NIVEAU_MIN; bas <= NIVEAU_MAX; bas += PAS) {
  const palier = candidats
    .filter((p) => p.rating >= bas && p.rating < bas + PAS)
    .sort((a, b) => a.id.localeCompare(b.id));
  const parTheme = new Map();
  for (const p of palier) {
    const t = themePrincipal(p.themes);
    if (!parTheme.has(t)) parTheme.set(t, []);
    parTheme.get(t).push(p);
  }
  const files = [...parTheme.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  const choisis = [];
  while (choisis.length < PAR_PALIER && files.some((f) => f.length)) {
    for (const f of files) {
      if (f.length && choisis.length < PAR_PALIER) choisis.push(f.shift());
    }
  }
  retenus.push(...choisis);
}
retenus.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));

const corps = retenus
  .map((p) => `  ${JSON.stringify({ id: p.id, fen: p.fen, coups: p.coups, rating: p.rating, themes: p.themes })},`)
  .join('\n');

writeFileSync(
  'src/chess/problemes-lichess.ts',
  `/**
 * Problèmes issus de la base libre de Lichess (licence CC0).
 * FICHIER GÉNÉRÉ par scripts/importer-problemes.mjs — ne pas modifier à la main.
 */
import type { ProblemeLichess } from './lichess';

export const PROBLEMES_LICHESS: ProblemeLichess[] = [
${corps}
];
`,
);
console.log(`${retenus.length} problèmes retenus sur ${candidats.length} candidats (${lignes.length} lus).`);
