import { commenter, type Comparaison } from '../comparer';

const base = (p: Partial<Comparaison>): Comparaison =>
  ({
    identique: false,
    joue: 'e2e4',
    maitre: 'd2d4',
    evalJoue: 0,
    evalMaitre: 0,
    feedback: {} as Comparaison['feedback'],
    ...p,
  }) as Comparaison;

describe('commentaire de comparaison', () => {
  it('salue le coup trouvé', () => {
    expect(commenter(base({ identique: true }), 'Morphy')).toContain('exactement le coup de Morphy');
  });

  /**
   * Un coup différent n'est pas une faute : les maîtres du XIXe siècle
   * jouaient sans moteur, et il arrive qu'une autre suite soit aussi bonne.
   * Dire « faux » dans ce cas apprendrait quelque chose d'inexact.
   */
  it('reconnaît un coup différent mais équivalent', () => {
    const c = base({ evalJoue: 20, evalMaitre: 10 });
    expect(commenter(c, 'Morphy')).toContain('vaut autant');
  });

  it('reconnaît un coup meilleur que celui du maître', () => {
    const c = base({ evalJoue: 300, evalMaitre: 50 });
    expect(commenter(c, 'Anderssen')).toContain('meilleur que celui de Anderssen');
  });

  it('renvoie à la flèche quand le maître a trouvé mieux', () => {
    const c = base({ evalJoue: -200, evalMaitre: 150 });
    expect(commenter(c, 'Fischer')).toContain('Fischer a trouvé mieux');
  });

  it('ne nomme jamais le maître à tort', () => {
    expect(commenter(base({ identique: true }), 'Fischer')).not.toContain('Morphy');
  });
});
