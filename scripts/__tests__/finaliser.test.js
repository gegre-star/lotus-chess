/**
 * `finaliser-web.mjs` sur un dossier de sortie factice.
 *
 * Ce qui compte ici : si Expo change son gabarit HTML, la finalisation doit
 * ÉCHOUER en disant quoi et où, plutôt que de publier un site amputé
 * (plein écran iOS, manifeste ou hors ligne perdus sans que personne le voie).
 */
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  finaliser,
  finaliserHtml,
  hachesScripts,
  remplacerOuEchouer,
  ErreurFinalisation,
  ICONES,
} = require('../finaliser-lib.js');

/** Le gabarit qu'Expo SDK 54 produit aujourd'hui, réduit à l'essentiel. */
const HTML_EXPO = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <title>Lotus Chess</title>
  </head>
  <body>
    <div id="root"></div>
  <script src="/lotus-chess/_expo/static/js/web/entry-abc.js" defer></script>
</body>
</html>`;

const dossiers = [];
function dist({ html = HTML_EXPO, sans = [] } = {}) {
  const racine = mkdtempSync(join(tmpdir(), 'lotus-dist-'));
  dossiers.push(racine);
  const fichiers = {
    'index.html': html,
    'icone-180.png': 'png180',
    'icone-192.png': 'png192',
    'icone-512.png': 'png512',
    'icone-maskable-512.png': 'pngm',
    '_expo/static/js/web/entry-abc.js': 'bundle',
    'assets/__x/node_modules/@a/b.png': 'img',
    'engine/stockfish-18-lite-single.js': 'sf-js',
    'engine/stockfish-18-lite-single.wasm': 'sf-wasm',
    'engine/README.md': 'doc',
  };
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    if (sans.includes(chemin)) continue;
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
  return racine;
}
afterAll(() => dossiers.forEach((d) => rmSync(d, { recursive: true, force: true })));

const lire = (racine, f) => readFileSync(join(racine, f), 'utf8');

describe('remplacerOuEchouer', () => {
  const ou = { fichier: 'index.html', quoi: 'faire ceci' };

  it('remplace une cible unique', () => {
    expect(remplacerOuEchouer('a-X-b', 'X', 'Y', ou)).toBe('a-Y-b');
  });

  it('nomme le fichier, l\'action et la cible quand celle-ci est absente', () => {
    expect(() => remplacerOuEchouer('rien', '<html lang="en">', 'x', ou)).toThrow(
      /index\.html : impossible de faire ceci — « <html lang="en"> » est introuvable/,
    );
    expect(() => remplacerOuEchouer('rien', 'X', 'x', ou)).toThrow(ErreurFinalisation);
  });

  it('refuse aussi une cible ambiguë', () => {
    expect(() => remplacerOuEchouer('X X', 'X', 'Y', ou)).toThrow(/apparaît 2 fois/);
  });

  it('n\'interprète pas les motifs spéciaux du remplacement', () => {
    expect(remplacerOuEchouer('a-X-b', 'X', '$& $1', ou)).toBe('a-$& $1-b');
  });
});

describe('finaliserHtml : chaque remplacement échoue bruyamment', () => {
  it('retouche le gabarit attendu', () => {
    const html = finaliserHtml(HTML_EXPO, '/lotus-chess');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('shrink-to-fit=no, viewport-fit=cover"');
    expect(html).toContain('rel="manifest" href="/lotus-chess/manifest.webmanifest"');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('href="/lotus-chess/icone-180.png"');
    expect(html).toContain("register('/lotus-chess/sw.js'");
  });

  it.each([
    ['lang', HTML_EXPO.replace('<html lang="en">', '<html lang="de">'), /impossible de passer la page en français.*lang="en"/],
    [
      'viewport',
      HTML_EXPO.replace('initial-scale=1, shrink-to-fit=no', 'initial-scale=1'),
      /impossible de ajouter viewport-fit=cover.*introuvable/,
    ],
    ['</head>', HTML_EXPO.replace('</head>', ''), /impossible de insérer le manifeste.*<\/head>.*introuvable/],
  ])('cible « %s » absente', (_nom, html, message) => {
    expect(() => finaliserHtml(html, '/lotus-chess', 'dist/index.html')).toThrow(message);
    expect(() => finaliserHtml(html, '/lotus-chess', 'dist/index.html')).toThrow(/^dist\/index\.html : /);
  });
});

describe('politique de sécurité du contenu (CSP)', () => {
  const meta = (html) => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];

  it('ouvre le <head>, avant tout script, et nomme le script en ligne par son hachage', () => {
    const html = finaliserHtml(HTML_EXPO, '/lotus-chess');
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<meta charset'));
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const hachage = createHash('sha256').update(script).digest('base64');
    expect(meta(html)).toContain(`'sha256-${hachage}'`);
    expect(hachesScripts(html)).toEqual([hachage]);
  });

  it('interdit l\'essentiel : autre origine, eval, objets, changement de base', () => {
    const csp = meta(finaliserHtml(HTML_EXPO, '/lotus-chess'));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("'wasm-unsafe-eval'"); // Stockfish
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it('autorise aussi un script en ligne ajouté plus tard par Expo, sans ignorer les scripts à src', () => {
    const html = HTML_EXPO.replace('</body>', '<script>window.a=1</script></body>');
    const csp = meta(finaliserHtml(html, '/lotus-chess'));
    const h = (t) => `'sha256-${createHash('sha256').update(t).digest('base64')}'`;
    expect(csp).toContain(h('window.a=1'));
    expect(hachesScripts(html)).toHaveLength(1); // la balise <script src=…> n'a pas de hachage
  });

  it('peut être omise (LOTUS_CSP=0) et échoue si <head> manque', () => {
    expect(meta(finaliserHtml(HTML_EXPO, '/lotus-chess', 'i.html', { csp: false }))).toBeUndefined();
    const sansHead = HTML_EXPO.replace('<head>', '<head >');
    expect(() => finaliserHtml(sansHead, '/lotus-chess', 'dist/index.html')).toThrow(
      /dist\/index\.html : impossible de poser la politique de sécurité.*<head>.*introuvable/,
    );
  });

  it('finaliser() pose la CSP par défaut, et LOTUS_CSP=0 la retire en ligne de commande', () => {
    const avec = dist();
    finaliser(avec, '/lotus-chess');
    expect(meta(lire(avec, 'index.html'))).toBeDefined();
    expect(meta(lire(avec, '404.html'))).toBeDefined();
    const sans = dist();
    const r = spawnSync(process.execPath, [join(__dirname, '..', 'finaliser-web.mjs'), sans], {
      encoding: 'utf8',
      env: { ...process.env, LOTUS_BASE_URL: '/lotus-chess', LOTUS_CSP: '0' },
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('SANS CSP');
    expect(meta(lire(sans, 'index.html'))).toBeUndefined();
  });
});

describe('finaliser', () => {
  it('écrit HTML, manifeste, repli 404 et service worker', () => {
    const d = dist();
    const r = finaliser(d, '/lotus-chess');
    expect(r.deja).toBe(false);
    expect(lire(d, 'index.html')).toContain('<html lang="fr">');
    expect(lire(d, '404.html')).toBe(lire(d, 'index.html'));
    const sw = lire(d, 'sw.js');
    expect(sw).toContain(`"version": "${r.version}"`);
    expect(sw).toContain('/lotus-chess/engine/stockfish-18-lite-single.wasm');
    expect(sw).toContain('/lotus-chess/engine/README.md'); // l'offre de source voyage avec le moteur
    expect(sw).not.toContain('metadata.json');
    expect(sw).not.toContain('/lotus-chess/404.html');
  });

  it('le manifeste liste les icônes any ET l\'icône maskable', () => {
    const d = dist();
    finaliser(d, '/lotus-chess');
    const m = JSON.parse(lire(d, 'manifest.webmanifest'));
    expect(m.scope).toBe('/lotus-chess/');
    expect(m.start_url).toBe('/lotus-chess/');
    expect(m.icons.map((i) => [i.src, i.purpose])).toEqual([
      ['/lotus-chess/icone-192.png', 'any'],
      ['/lotus-chess/icone-512.png', 'any'],
      ['/lotus-chess/icone-maskable-512.png', 'maskable'],
    ]);
    // « any maskable » dans une seule entrée serait rognée là où elle ne doit pas l'être
    expect(m.icons.every((i) => !i.purpose.includes(' '))).toBe(true);
    expect(ICONES.map((i) => i.fichier)).toContain('icone-maskable-512.png');
  });

  it('est rejouable : même version, HTML non retouché deux fois', () => {
    const d = dist();
    const un = finaliser(d, '/lotus-chess');
    const html = lire(d, 'index.html');
    const deux = finaliser(d, '/lotus-chess');
    expect(deux.deja).toBe(true);
    expect(deux.version).toBe(un.version);
    expect(lire(d, 'index.html')).toBe(html);
    expect(html.match(/lotus-finalise/g)).toHaveLength(1);
  });

  it('refuse de rejouer sur une autre base', () => {
    const d = dist();
    finaliser(d, '/lotus-chess');
    expect(() => finaliser(d, '/autre')).toThrow(/déjà été finalisé pour une autre base/);
  });

  it('déploie à la racine quand la base est vide', () => {
    const d = dist({ html: HTML_EXPO.replace('/lotus-chess/_expo', '/_expo') });
    finaliser(d, '');
    expect(lire(d, 'sw.js')).toContain('"index": "/index.html"');
    expect(JSON.parse(lire(d, 'manifest.webmanifest')).scope).toBe('/');
  });

  it('une nouvelle version du contenu donne un nouveau service worker', () => {
    const a = dist();
    const b = dist();
    writeFileSync(join(b, '_expo/static/js/web/entry-abc.js'), 'bundle modifié');
    expect(finaliser(a, '/lotus-chess').version).not.toBe(finaliser(b, '/lotus-chess').version);
    expect(lire(a, 'sw.js')).not.toBe(lire(b, 'sw.js'));
  });

  it('échoue si le dossier ou index.html manque', () => {
    expect(() => finaliser(join(tmpdir(), 'lotus-absent-xyz'), '/lotus-chess')).toThrow(/introuvable/);
  });

  it('échoue si une icône promise par le manifeste manque', () => {
    const d = dist({ sans: ['icone-maskable-512.png'] });
    expect(() => finaliser(d, '/lotus-chess')).toThrow(/icônes absentes.*icone-maskable-512\.png/);
  });

  it('échoue si le bundle désigné par la page n\'existe pas', () => {
    const d = dist({ sans: ['_expo/static/js/web/entry-abc.js'] });
    expect(() => finaliser(d, '/lotus-chess')).toThrow(/référence « \/lotus-chess\/_expo\/static\/js\/web\/entry-abc\.js », introuvable/);
  });

  it('échoue si le moteur Stockfish manque : plus d\'analyse hors ligne', () => {
    const d = dist({ sans: ['engine/stockfish-18-lite-single.wasm'] });
    expect(() => finaliser(d, '/lotus-chess')).toThrow(/moteur Stockfish/);
  });

  it('échoue si le gabarit d\'Expo a changé', () => {
    const d = dist({ html: HTML_EXPO.replace('<html lang="en">', '<html>') });
    expect(() => finaliser(d, '/lotus-chess')).toThrow(/index\.html : impossible de passer la page en français/);
    // et n'écrit rien : pas de manifeste ni de service worker orphelins
    expect(existsSync(join(d, 'sw.js'))).toBe(false);
    expect(existsSync(join(d, 'manifest.webmanifest'))).toBe(false);
  });
});

describe('ligne de commande', () => {
  const script = join(__dirname, '..', 'finaliser-web.mjs');
  const lancer = (d, base = '/lotus-chess') =>
    spawnSync(process.execPath, [script, d], { encoding: 'utf8', env: { ...process.env, LOTUS_BASE_URL: base } });

  it('sort en code 0 et résume le résultat', () => {
    const r = lancer(dist());
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/finalisé : .*fichiers précachés, version [0-9a-f]{16}/);
  });

  it('sort en code 1 avec un message clair quand une cible manque', () => {
    const r = lancer(dist({ html: HTML_EXPO.replace('</head>', '') }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/ÉCHEC de la finalisation : .*index\.html : impossible de insérer/);
  });

  it('sort en code 1 pour une base invalide', () => {
    const r = lancer(dist(), '/a"b');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/LOTUS_BASE_URL invalide/);
  });
});
