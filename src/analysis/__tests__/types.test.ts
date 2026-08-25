import { whitePov, type Analysis } from '../types';

const a = (p: Partial<Analysis>): Analysis => ({
  best: null, cp: null, mate: null, depth: 1, pv: [], engine: 'stockfish', ...p,
});

describe('score ramené du point de vue des blancs', () => {
  it('laisse un score en centièmes tel quel quand les blancs jouent', () => {
    expect(whitePov(a({ cp: 120 }), 'w')).toBe(120);
  });

  it('inverse un score en centièmes quand les noirs jouent', () => {
    expect(whitePov(a({ cp: 120 }), 'b')).toBe(-120);
  });

  it('classe un mat annoncé au-dessus de tout avantage matériel', () => {
    expect(whitePov(a({ mate: 3 }), 'w')).toBeGreaterThan(whitePov(a({ cp: 5000 }), 'w'));
  });

  it('préfère un mat rapide à un mat lent', () => {
    expect(whitePov(a({ mate: 1 }), 'w')).toBeGreaterThan(whitePov(a({ mate: 5 }), 'w'));
  });

  /**
   * Régression : sur une position déjà matée le moteur répond `mate 0`, ce qui
   * signifie « le camp au trait est maté ». Traité comme les autres valeurs, le
   * signe se perdait et le coup qui porte le mat était noté comme une gaffe.
   */
  it('lit « mate 0 » comme une défaite du camp au trait', () => {
    expect(whitePov(a({ mate: 0 }), 'b')).toBeGreaterThan(0);
    expect(whitePov(a({ mate: 0 }), 'w')).toBeLessThan(0);
  });

  it('donne au mat porté la même valeur qu’au mat annoncé en un coup', () => {
    // noirs matés, vu des blancs : au moins aussi bon qu'un mat en un
    expect(whitePov(a({ mate: 0 }), 'b')).toBeGreaterThanOrEqual(whitePov(a({ mate: 1 }), 'w'));
  });

  it('rend zéro quand le moteur n’a rien à dire', () => {
    expect(whitePov(a({}), 'w')).toBe(0);
  });
});
