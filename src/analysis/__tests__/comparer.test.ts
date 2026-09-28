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

  it('reconnaît un coup meilleur que celui du maître, en le disant « selon le moteur »', () => {
    const c = base({ evalJoue: 300, evalMaitre: 50 });
    const texte = commenter(c, 'Anderssen');
    expect(texte).toContain('meilleur que celui de Anderssen');
    expect(texte).toContain('selon le moteur');
    expect(texte).not.toContain('objectivement');
  });

  /**
   * Régression : +30 cp d'écart suffisaient à écrire « objectivement
   * meilleur ». À profondeur 10 c'est du bruit de mesure.
   */
  it('ne proclame pas la supériorité sur un écart de bruit', () => {
    [30, 45, 99].forEach((ecart) => {
      const texte = commenter(base({ evalJoue: 100 + ecart, evalMaitre: 100 }), 'Morphy');
      expect(texte).toContain('vaut autant');
      expect(texte).not.toContain('meilleur');
    });
  });

  it('la proclame dès 100 centipions d’écart', () => {
    expect(commenter(base({ evalJoue: 200, evalMaitre: 100 }), 'Morphy')).toContain('selon le moteur');
  });

  it('renvoie à la flèche quand le maître a trouvé mieux', () => {
    const c = base({ evalJoue: -200, evalMaitre: 150 });
    expect(commenter(c, 'Fischer')).toContain('Fischer a trouvé mieux');
  });

  it('ne nomme jamais le maître à tort', () => {
    expect(commenter(base({ identique: true }), 'Fischer')).not.toContain('Morphy');
  });
});
