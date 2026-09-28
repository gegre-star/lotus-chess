/**
 * Les liens internes mènent quelque part.
 *
 * Le bouton « Continuer » de l'accueil pointait vers `/chess/learn`, une route
 * qui n'a jamais existé : le bouton principal du premier écran renvoyait à
 * l'écran « page introuvable », donc à l'accueil. Rien ne plantait, rien ne
 * s'affichait en rouge — c'est exactement le genre de panne qu'un test doit
 * attraper à la place d'un utilisateur.
 */
import * as fs from 'fs';
import * as path from 'path';

const APP = path.join(__dirname, '..', '..', 'app');

/** Les routes qu'expo-router expose, d'après les fichiers du dossier `app`. */
function routesDisponibles(): Set<string> {
  const routes = new Set<string>();
  const parcourir = (dossier: string, prefixe: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      if (entree.isDirectory()) {
        parcourir(path.join(dossier, entree.name), `${prefixe}/${entree.name}`);
        continue;
      }
      if (!/\.tsx?$/.test(entree.name)) continue;
      const nom = entree.name.replace(/\.tsx?$/, '');
      // `_layout` n'est pas une route, `+not-found` est la route de repli
      if (nom.startsWith('_') || nom.startsWith('+')) continue;
      routes.add(nom === 'index' ? `${prefixe}/` : `${prefixe}/${nom}`);
    }
  };
  parcourir(APP, '');
  return routes;
}

/** Toutes les destinations passées à `router.push` / `replace` / `navigate`. */
function destinations(): { fichier: string; route: string }[] {
  const trouvees: { fichier: string; route: string }[] = [];
  for (const nom of fs.readdirSync(APP)) {
    if (!/\.tsx?$/.test(nom)) continue;
    const source = fs.readFileSync(path.join(APP, nom), 'utf8');
    const motif = /router\.(?:push|replace|navigate)\(\s*['"`]([^'"`]+)['"`]/g;
    let m = motif.exec(source);
    while (m) {
      trouvees.push({ fichier: nom, route: m[1] });
      m = motif.exec(source);
    }
  }
  return trouvees;
}

describe('navigation interne', () => {
  test('le dossier app expose bien les onglets attendus', () => {
    const routes = routesDisponibles();
    ['/', '/learn', '/play', '/puzzles', '/train', '/games'].forEach((r) =>
      expect(routes).toContain(r),
    );
  });

  test('chaque destination de router.push existe', () => {
    const routes = routesDisponibles();
    const liens = destinations();
    // sans ce garde-fou, le test passerait sur un code qui ne navigue plus
    expect(liens.length).toBeGreaterThan(0);
    const mortes = liens.filter(({ route }) => !routes.has(route.split('?')[0]));
    expect(mortes).toEqual([]);
  });
});
