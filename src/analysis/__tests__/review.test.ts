import { analyserPartie, RevueAnnulee, revoirPartie } from '../review';
import { createLocalEngine, toUci } from '../local';
import { START_FEN, makeMove, parseFEN, playSAN, toFEN, type Move, type Position } from '../../chess/engine';
import type { Analysis, AnalysisEngine } from '../types';

const depart = parseFEN(START_FEN);

/** Joue une suite de coups en notation anglaise (`playSAN` lit la notation PGN). */
const jouer = (san: string): { moves: Move[]; positions: Position[] } => {
  const moves = playSAN(san);
  const positions = [depart];
  moves.forEach((m, i) => positions.push(makeMove(positions[i], m)));
  return { moves, positions };
};

/**
 * Moteur scripté : évaluation (point de vue des blancs) donnée pour chaque
 * position de la partie, et meilleur coup imposé ou, par défaut, le coup joué.
 *
 * Il permet de vérifier la mécanique de la revue — signes, camps, précision —
 * sans dépendre de la force d'un vrai moteur.
 */
function moteurScripte(
  positions: Position[],
  moves: Move[],
  scoresBlancs: number[],
  meilleurs: Record<number, string> = {},
) {
  const parFen = new Map<string, number>();
  positions.forEach((p, i) => parFen.set(toFEN(p), i));
  const analyse = jest.fn(async (fen: string): Promise<Analysis> => {
    const i = parFen.get(fen);
    if (i === undefined) throw new Error(`position inattendue : ${fen}`);
    const blancsAuTrait = positions[i].turn === 'w';
    const cp = blancsAuTrait ? scoresBlancs[i] : -scoresBlancs[i];
    const best = meilleurs[i] ?? (moves[i] ? toUci(moves[i]) : null);
    return { best, cp, mate: null, depth: 10, pv: best ? [best] : [], engine: 'stockfish' };
  });
  const engine: AnalysisEngine = { name: 'stockfish', analyse, dispose: () => undefined };
  return { engine, analyse };
}

/**
 * Évaluations d'une partie sans faute, du point de vue des blancs : elles ne
 * baissent jamais après un coup blanc ni ne montent après un coup noir.
 */
const PROPRE = [20, 25, 20, 25, 20, 25, 20];

describe('revue de partie en une passe', () => {
  const partie = jouer('e4 e5 Nf3 Nc6 Bb5 a6');

  it('analyse chaque position une seule fois : N + 1 appels pour N demi-coups', async () => {
    const { engine, analyse } = moteurScripte(partie.positions, partie.moves, PROPRE);
    await analyserPartie(engine, depart, partie.moves, []);
    expect(analyse).toHaveBeenCalledTimes(7);
  });

  it('rend un coup revu par demi-coup, pour les deux camps', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const revue = await analyserPartie(engine, depart, partie.moves, []);
    expect(revue.coups).toHaveLength(6);
    expect(revue.coups.map((c) => c.camp)).toEqual(['w', 'b', 'w', 'b', 'w', 'b']);
    expect(revue.coups.map((c) => c.ply)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(revue.coups.map((c) => c.san)).toEqual(['e4', 'e5', 'Cf3', 'Cc6', 'Fb5', 'a6']);
    expect(revue.scores).toHaveLength(7);
    expect(revue.courbe).toHaveLength(7);
  });

  it('note un coup qui est le meilleur comme bon, sans perte', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const revue = await analyserPartie(engine, depart, partie.moves, []);
    revue.coups.forEach((c) => {
      expect(c.verdict).toBe('bon');
      expect(c.perteGain).toBe(0);
    });
  });

  it('donne une précision d’environ 100 % aux deux camps sur une partie sans erreur', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const revue = await analyserPartie(engine, depart, partie.moves, []);
    expect(revue.precision.w).toBeGreaterThan(99.9);
    expect(revue.precision.b).toBeGreaterThan(99.9);
    expect(revue.critique).toBeNull();
  });

  it('ramène chaque score au point de vue des blancs, quel que soit le trait', async () => {
    const scores = [20, 25, -10, 30, 45, 25, 30];
    const { engine } = moteurScripte(partie.positions, partie.moves, scores);
    const revue = await analyserPartie(engine, depart, partie.moves, []);
    expect(revue.scores).toEqual(scores);
  });

  describe('une gaffe des noirs au 2e coup', () => {
    // 1.e4 e5 2.Cf3 Cc6 3.Fb5 a6 : ici 3...a6 (dernier coup) fait basculer la partie
    // de +0,3 à +6 : gaffe noire. Le meilleur coup des noirs était Cf6.
    const scores = [20, 25, 20, 25, 20, 25, 600];
    const meilleurs = { 5: 'g8f6' };

    it('fait baisser la précision de son camp seulement', async () => {
      const { engine } = moteurScripte(partie.positions, partie.moves, scores, meilleurs);
      const revue = await analyserPartie(engine, depart, partie.moves, []);
      expect(revue.precision.w).toBeGreaterThan(99.9);
      expect(revue.precision.b!).toBeLessThan(80);
      expect(revue.precision.b!).toBeGreaterThan(0);
    });

    it('note la gaffe, la compte dans le résumé et la désigne comme moment critique', async () => {
      const { engine } = moteurScripte(partie.positions, partie.moves, scores, meilleurs);
      const revue = await analyserPartie(engine, depart, partie.moves, []);
      const gaffe = revue.coups[5];
      expect(gaffe.verdict).toBe('gaffe');
      expect(gaffe.camp).toBe('b');
      expect(gaffe.meilleur).toBe('g8f6');
      expect(gaffe.meilleurSan).toBe('Cf6');
      expect(revue.resume.b.gaffe).toBe(1);
      expect(revue.resume.w.gaffe).toBe(0);
      expect(revue.critique).toBe(5);
    });

    it('ne reproche pas au camp adverse la position qu’il a reçue', async () => {
      // après la gaffe noire, le score est élevé pour les blancs : ce n'est pas
      // à leur crédit, mais ce n'est pas non plus une perte pour eux
      const suite = jouer('e4 e5 Nf3 Nc6 Bb5 a6 Ba4');
      const s = [20, 25, 20, 25, 20, 25, 600, 610];
      const { engine } = moteurScripte(suite.positions, suite.moves, s, { 5: 'g8f6' });
      const revue = await analyserPartie(engine, depart, suite.moves, []);
      expect(revue.coups[6].camp).toBe('w');
      expect(revue.coups[6].verdict).toBe('bon');
      expect(revue.precision.w).toBeGreaterThan(99.9);
    });
  });

  /**
   * Le moteur peut recommander à profondeur 10 un coup qui perd (le piège est
   * plus profond) ; la recherche de la position suivante, deux demi-coups plus
   * loin, le voit. Le verdict suit l'évaluation d'après, pas l'étiquette
   * « meilleur coup » de la première recherche.
   */
  it('juge le coup sur la position d’après, même quand le moteur l’avait conseillé', async () => {
    // le dernier coup noir (a6) est « le meilleur » pour le moteur, mais la position d'après est perdue
    const { engine } = moteurScripte(
      partie.positions,
      partie.moves,
      [20, 25, 20, 25, 20, 25, 600],
      { 5: 'a7a6' },
    );
    const revue = await analyserPartie(engine, depart, partie.moves, []);
    expect(revue.coups[5].joue).toBe('a7a6');
    expect(revue.coups[5].meilleur).toBe('a7a6');
    expect(revue.coups[5].verdict).toBe('gaffe');
  });

  it('commente les coups de l’élève à la deuxième personne, ceux de l’adversaire à la troisième', async () => {
    const scores = [20, 25, 20, 25, 20, 25, 600];
    const { engine } = moteurScripte(partie.positions, partie.moves, scores, { 5: 'g8f6' });
    const revue = await analyserPartie(engine, depart, partie.moves, [], { joueur: 'w' });
    expect(revue.coups[5].texte).not.toMatch(/\btu\b|\bton\b|\bta\b/i);
    const revueNoire = await analyserPartie(engine, depart, partie.moves, [], { joueur: 'b' });
    expect(revueNoire.coups[5].texte).toMatch(/Ce coup coûte/);
  });

  it('signale la progression : N + 1 étapes', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const progression: [number, number][] = [];
    await analyserPartie(engine, depart, partie.moves, [], {
      onProgress: (fait, total) => progression.push([fait, total]),
    });
    expect(progression).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => [n, 7]));
  });

  it('s’abandonne quand on le demande, sans analyser la suite', async () => {
    const { engine, analyse } = moteurScripte(partie.positions, partie.moves, PROPRE);
    let appels = 0;
    await expect(
      analyserPartie(engine, depart, partie.moves, [], { annule: () => (appels += 1) > 3 }),
    ).rejects.toBeInstanceOf(RevueAnnulee);
    expect(analyse.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('transmet la profondeur et le temps demandés au moteur', async () => {
    const { engine, analyse } = moteurScripte(partie.positions, partie.moves, PROPRE);
    await analyserPartie(engine, depart, partie.moves, [], { depth: 8, movetime: 250 });
    expect(analyse).toHaveBeenCalledWith(expect.any(String), { depth: 8, movetime: 250 });
  });

  it('rend une revue vide et sans précision pour une partie sans coup', async () => {
    const { engine } = moteurScripte([depart], [], [20]);
    const revue = await analyserPartie(engine, depart, [], []);
    expect(revue.coups).toEqual([]);
    expect(revue.precision).toEqual({ w: null, b: null });
    expect(revue.critique).toBeNull();
    expect(revue.courbe).toEqual([20]);
  });

  it('ne recalcule pas une position qui se répète', async () => {
    const boucle = jouer('Nf3 Nf6 Ng1 Ng8 Nf3');
    const scores = [10, 10, 10, 10, 10, 10];
    const { engine, analyse } = moteurScripte(boucle.positions, boucle.moves, scores);
    await analyserPartie(engine, depart, boucle.moves, []);
    // positions 0 et 4 (départ) sont identiques, comme 1 et 5 : 4 FEN distinctes sur 6
    expect(analyse.mock.calls.length).toBeLessThan(6);
  });
});

describe('fin de partie', () => {
  /** Mat du fou : 1.f3 e5 2.g4 Dh4#. */
  const mat = jouer('f3 e5 g4 Qh4#');

  it('n’interroge pas le moteur sur la position finale et la note comme un mat', async () => {
    const { engine, analyse } = moteurScripte(mat.positions.slice(0, 4), mat.moves, [0, 0, 0, -50]);
    const revue = await analyserPartie(engine, depart, mat.moves, []);
    expect(analyse).toHaveBeenCalledTimes(4);
    // les blancs sont maté : score −100 000 de leur point de vue, donc pour les blancs
    expect(revue.scores[4]).toBe(-100000);
    expect(revue.courbe[4]).toBe(-1000);
  });

  /**
   * Régression connue de `whitePov` : un mat « déjà donné » (mate: 0) traité
   * comme zéro faisait passer le coup gagnant pour la pire gaffe de la partie.
   */
  it('ne note pas le coup qui mate comme une gaffe', async () => {
    const { engine } = moteurScripte(mat.positions.slice(0, 4), mat.moves, [0, 0, 0, -50]);
    const revue = await analyserPartie(engine, depart, mat.moves, []);
    const dernier = revue.coups[3];
    expect(dernier.san).toBe('Dh4#');
    expect(['bon', 'brillant']).toContain(dernier.verdict);
  });

  it('distingue le pat, nul, du mat', async () => {
    // les noirs sont pat : évaluation nulle, pas un mat
    const pat = jouer('e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6');
    const positions = pat.positions;
    const scores = positions.map(() => 0);
    const { engine } = moteurScripte(positions.slice(0, -1), pat.moves, scores.slice(0, -1));
    const revue = await analyserPartie(engine, depart, pat.moves, []);
    expect(revue.scores[revue.scores.length - 1]).toBe(0);
  });
});

describe('compatibilité avec l’ancienne revue', () => {
  const partie = jouer('e4 e5 Nf3 Nc6 Bb5 a6');

  it('revoirPartie ne rend que les coups du camp demandé', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const blancs = await revoirPartie(engine, depart, partie.moves, ['e4', 'e5', 'Cf3', 'Cc6', 'Fb5', 'a6'], 'w');
    expect(blancs.map((c) => c.ply)).toEqual([1, 3, 5]);
    expect(blancs.map((c) => c.san)).toEqual(['e4', 'Cf3', 'Fb5']);
    const noirs = await revoirPartie(engine, depart, partie.moves, [], 'b');
    expect(noirs.map((c) => c.ply)).toEqual([2, 4, 6]);
  });

  it('garde les champs utilisés par l’écran actuel', async () => {
    const { engine } = moteurScripte(partie.positions, partie.moves, PROPRE);
    const [premier] = await revoirPartie(engine, depart, partie.moves, [], 'w');
    expect(premier).toMatchObject({ verdict: 'bon', joue: 'e2e4', meilleur: 'e2e4', ply: 1 });
    expect(typeof premier.texte).toBe('string');
    expect(typeof premier.perte).toBe('number');
  });
});

describe('avec le moteur local (Cerveau)', () => {
  /**
   * 1.e4 e5 2.Dh5 Cc6 3.Fc4 Cf6?? 4.Dxf7# : 3...Cf6 est une gaffe (le mat du
   * berger), 4.Dxf7 le coup gagnant. Le moteur local doit le voir, les deux
   * camps être notés, et la précision des noirs être bien plus basse.
   */
  const berger = jouer('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#');

  it('note les deux camps et repère la gaffe des noirs', async () => {
    const engine = createLocalEngine();
    const revue = await analyserPartie(engine, depart, berger.moves, [], {
      depth: 6,
      movetime: 120,
    });
    expect(revue.coups).toHaveLength(7);
    expect(revue.moteur).toBe('local');
    expect(revue.coups[5].camp).toBe('b');
    expect(['erreur', 'gaffe']).toContain(revue.coups[5].verdict);
    expect(revue.critique).toBe(5);
    expect(revue.precision.b!).toBeLessThan(revue.precision.w!);
    // le mat final n'est pas une gaffe
    expect(['bon', 'brillant']).toContain(revue.coups[6].verdict);
    expect(revue.scores[7]).toBe(100000);
  });
});
