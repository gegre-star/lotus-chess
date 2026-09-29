import {
  createLocalEngine,
  plafondDeTemps,
  PROFONDEUR_MAX,
  TEMPS_DEFAUT_MS,
  TEMPS_MAX_MS,
  toUci,
} from '../local';
import { findMove, makeMove, parseFEN, squareFromName as at } from '../../chess/engine';

const engine = createLocalEngine();

/** Milieu de partie ouvert : c'est la position qui gelait l'ancien minimax. */
const MILIEU = 'r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8';

describe('moteur de repli', () => {
  it('écrit les coups au format UCI, promotion comprise', () => {
    const pos = parseFEN('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(toUci(findMove(pos, at('a7'), at('a8'), 'Q')!)).toBe('a7a8q');
    const simple = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(toUci(findMove(simple, at('e2'), at('e4'))!)).toBe('e2e4');
  });

  it('trouve le mat du couloir en un coup', async () => {
    const a = await engine.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 4 });
    expect(a.best).toBe('a1a8');
    expect(a.mate).toBe(1);
    expect(a.cp).toBeNull();
    expect(a.engine).toBe('local');
  });

  it('ramasse une pièce en prise', async () => {
    // la dame noire est en prise et rien ne la défend ; les pions sont là pour
    // que la prise ne mène pas à une position morte, qui vaudrait zéro
    const a = await engine.analyse('4k3/pp6/8/3q4/4B3/8/PP6/4K3 w - - 0 1', { depth: 4 });
    expect(a.best).toBe('e4d5');
    expect(a.cp).toBeGreaterThan(250);
    expect(a.mate).toBeNull();
  });

  it('rend le score du point de vue du camp au trait', async () => {
    // même position, trait différent : les blancs ont une tour de plus, donc
    // le score est positif quand ils jouent et négatif quand ce sont les noirs
    const blancs = await engine.analyse('4k3/5ppp/8/8/8/8/5PPP/R3K3 w - - 0 1', { depth: 4 });
    const noirs = await engine.analyse('4k3/5ppp/8/8/8/8/5PPP/R3K3 b - - 0 1', { depth: 4 });
    expect(blancs.cp!).toBeGreaterThan(300);
    expect(noirs.cp!).toBeLessThan(-300);
  });

  it('annonce un mat subi avec un signe négatif', async () => {
    // les blancs n'ont que le roi ; quoi qu'il joue, Tb1 mate au coup suivant
    const a = await engine.analyse('7k/8/8/8/8/1r6/r7/6K1 w - - 0 1', { depth: 6 });
    expect(a.mate).toBe(-1);
    expect(a.cp).toBeNull();
  });

  it('distingue le mat du pat sur une position terminée', async () => {
    const mat = await engine.analyse('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', { depth: 2 });
    expect(mat.best).toBeNull();
    expect(mat.pv).toEqual([]);
    // `mate: 0` = « le camp au trait est maté en ce moment même » (voir whitePov)
    expect(mat.mate).toBe(0);

    const pat = await engine.analyse('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', { depth: 2 });
    expect(pat.best).toBeNull();
    expect(pat.mate).toBeNull();
    expect(pat.cp).toBe(0);
  });

  it('rend une variante cohérente avec le meilleur coup', async () => {
    const a = await engine.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 4 });
    expect(a.pv[0]).toBe(a.best);
  });

  it('rend une variante entièrement jouable', async () => {
    const a = await engine.analyse(MILIEU, { depth: 6, movetime: 200 });
    expect(a.pv.length).toBeGreaterThan(1);
    let pos = parseFEN(MILIEU);
    for (const uci of a.pv) {
      const promo = uci.length > 4 ? (uci[4].toUpperCase() as 'Q') : undefined;
      const m = findMove(pos, at(uci.slice(0, 2)), at(uci.slice(2, 4)), promo);
      expect(m).toBeDefined();
      pos = makeMove(pos, m!);
    }
  });

  describe('plafonds', () => {
    it('borne le temps demandé', () => {
      expect(plafondDeTemps({})).toBe(TEMPS_DEFAUT_MS);
      expect(plafondDeTemps({ movetime: 5000 })).toBe(TEMPS_MAX_MS);
      expect(plafondDeTemps({ movetime: 0 })).toBeGreaterThan(0);
      expect(plafondDeTemps({ movetime: 200 })).toBe(200);
    });

    it('garde des plafonds raisonnables', () => {
      expect(TEMPS_DEFAUT_MS).toBeLessThanOrEqual(TEMPS_MAX_MS);
      expect(TEMPS_MAX_MS).toBeLessThanOrEqual(800);
      expect(PROFONDEUR_MAX).toBeLessThanOrEqual(10);
    });

    /**
     * Régression : l'ancien moteur passait `depth: 10` à un minimax sans
     * plafond, et gelait l'application plus de trois minutes. Ici la
     * profondeur demandée est 10 sur une position de milieu de partie : le
     * plafond de temps doit rendre la main en bien moins de deux secondes.
     */
    it('rend la main vite à profondeur 10 sur un milieu de partie', async () => {
      const debut = Date.now();
      const a = await engine.analyse(MILIEU, { depth: 10 });
      const duree = Date.now() - debut;
      expect(duree).toBeLessThan(1500);
      expect(a.best).not.toBeNull();
      expect(a.depth).toBeGreaterThanOrEqual(3);
      expect(a.depth).toBeLessThanOrEqual(PROFONDEUR_MAX);
    });

    it('ne dépasse jamais le plafond, même si on en réclame davantage', async () => {
      const debut = Date.now();
      await engine.analyse(MILIEU, { depth: 99, movetime: 60000 });
      expect(Date.now() - debut).toBeLessThan(TEMPS_MAX_MS + 700);
    });
  });

  /**
   * Sans cette pause, une revue de 60 positions occuperait le fil d'exécution
   * du début à la fin et l'écran resterait figé, barre de progression
   * comprise.
   */
  it('cède la main à la boucle d’événements avant de calculer', async () => {
    const ordre: string[] = [];
    // le minuteur de l'interface est posé AVANT l'appel : s'il passe avant le
    // résultat, c'est que le moteur a rendu la main au lieu de calculer d'un trait
    setTimeout(() => ordre.push('interface'), 0);
    const attente = engine.analyse(MILIEU, { depth: 3, movetime: 50 }).then(() => ordre.push('analyse'));
    await attente;
    expect(ordre).toEqual(['interface', 'analyse']);
  });

  it('donne la main même sur une position terminée', async () => {
    const ordre: string[] = [];
    setTimeout(() => ordre.push('interface'), 0);
    const attente = engine
      .analyse('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1')
      .then(() => ordre.push('analyse'));
    await attente;
    expect(ordre).toEqual(['interface', 'analyse']);
  });
});
