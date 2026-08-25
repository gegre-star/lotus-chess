import { createLocalEngine, scoreToAnalysis, toUci } from '../local';
import { MATE_SCORE } from '../../chess/ai';
import { findMove, parseFEN, squareFromName as at } from '../../chess/engine';

const engine = createLocalEngine();

describe('moteur de repli', () => {
  it('écrit les coups au format UCI, promotion comprise', () => {
    const pos = parseFEN('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(toUci(findMove(pos, at('a7'), at('a8'), 'Q')!)).toBe('a7a8q');
    const simple = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(toUci(findMove(simple, at('e2'), at('e4'))!)).toBe('e2e4');
  });

  it('trouve le mat du couloir en un coup', async () => {
    const a = await engine.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 3 });
    expect(a.best).toBe('a1a8');
    expect(a.mate).toBe(1);
    expect(a.cp).toBeNull();
    expect(a.engine).toBe('local');
  });

  it('ramasse une pièce en prise', async () => {
    // la dame noire est en prise et rien ne la défend ; les pions sont là pour
    // que la prise ne mène pas à une position morte, qui vaudrait zéro
    const a = await engine.analyse('4k3/pp6/8/3q4/4B3/8/PP6/4K3 w - - 0 1', { depth: 2 });
    expect(a.best).toBe('e4d5');
    // après la prise les blancs ont un fou face à des pions seuls : environ +330
    expect(a.cp).toBeGreaterThan(250);
    expect(a.mate).toBeNull();
  });

  it('ne propose aucun coup sur une position terminée', async () => {
    const a = await engine.analyse('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', { depth: 2 });
    expect(a.best).toBeNull();
    expect(a.pv).toEqual([]);
  });

  it('rend une variante cohérente avec le meilleur coup', async () => {
    const a = await engine.analyse('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', { depth: 3 });
    expect(a.pv[0]).toBe(a.best);
  });

  describe('traduction des scores', () => {
    it('lit un mat immédiat comme un mat en un coup', () => {
      // mat trouvé alors qu'il restait 2 de profondeur sur une recherche à 3
      expect(scoreToAnalysis(MATE_SCORE + 2, 3)).toEqual({ cp: null, mate: 1 });
    });

    it('compte deux demi-coups pour un mat en deux', () => {
      expect(scoreToAnalysis(MATE_SCORE + 1, 4)).toEqual({ cp: null, mate: 2 });
    });

    it('rend un mat subi avec un signe négatif', () => {
      expect(scoreToAnalysis(-(MATE_SCORE + 2), 3)).toEqual({ cp: null, mate: -1 });
    });

    it('laisse les scores ordinaires en centièmes de pion', () => {
      expect(scoreToAnalysis(-137, 3)).toEqual({ cp: -137, mate: null });
    });
  });
});
