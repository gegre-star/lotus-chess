import {
  CATEGORIES,
  COURBE_MAX,
  coupCritique,
  courbeDEval,
  ecreter,
  libelleEval,
  precisionCoup,
  precisionJoueur,
  resumerCoups,
  type CoupCompte,
} from '../statistiques';

const coup = (camp: 'w' | 'b', perteGain: number, verdict: CoupCompte['verdict'] = 'bon'): CoupCompte => ({
  camp,
  perteGain,
  verdict,
});

describe('précision d’un coup', () => {
  it('vaut 100 quand rien n’est perdu', () => {
    expect(precisionCoup(0)).toBeCloseTo(100, 3);
  });

  it('suit la formule de lichess', () => {
    // valeurs recalculées à la main : 103,1668 × exp(−0,04354 × x) − 3,1669
    expect(precisionCoup(5)).toBeCloseTo(79.8, 1);
    expect(precisionCoup(10)).toBeCloseTo(63.6, 1);
    expect(precisionCoup(20)).toBeCloseTo(40.0, 1);
  });

  it('décroît quand la perte grandit et reste dans [0, 100]', () => {
    // strictement décroissante tant que la borne à 0 n'est pas atteinte (vers 80 points)
    let avant = 101;
    for (let perte = 0; perte <= 100; perte += 2.5) {
      const p = precisionCoup(perte);
      if (perte <= 60) expect(p).toBeLessThan(avant);
      else expect(p).toBeLessThanOrEqual(avant);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      avant = p;
    }
  });

  it('est bornée à 0 pour une perte énorme', () => {
    expect(precisionCoup(1000)).toBe(0);
  });

  it('ignore une perte négative, qui ne peut être qu’un bruit', () => {
    expect(precisionCoup(-5)).toBe(precisionCoup(0));
  });
});

describe('précision d’un joueur', () => {
  it('est la moyenne des précisions de ses coups', () => {
    const coups = [coup('w', 0), coup('w', 10), coup('b', 50)];
    const attendu = (precisionCoup(0) + precisionCoup(10)) / 2;
    expect(precisionJoueur(coups, 'w')).toBeCloseTo(attendu, 9);
  });

  it('vaut environ 100 sur une partie sans erreur', () => {
    const coups = Array.from({ length: 40 }, (_, i) => coup(i % 2 === 0 ? 'w' : 'b', 0));
    expect(precisionJoueur(coups, 'w')).toBeGreaterThan(99.9);
    expect(precisionJoueur(coups, 'b')).toBeGreaterThan(99.9);
  });

  it('ne baisse que pour le camp qui a gaffé', () => {
    const coups = [coup('w', 0), coup('b', 0), coup('w', 0), coup('b', 45, 'gaffe'), coup('w', 0)];
    expect(precisionJoueur(coups, 'w')).toBeGreaterThan(99.9);
    expect(precisionJoueur(coups, 'b')!).toBeLessThan(precisionCoup(45) / 2 + 51);
    expect(precisionJoueur(coups, 'b')!).toBeLessThan(60);
  });

  it('vaut null quand le joueur n’a joué aucun coup', () => {
    expect(precisionJoueur([coup('w', 0)], 'b')).toBeNull();
    expect(precisionJoueur([], 'w')).toBeNull();
  });
});

describe('résumé par catégorie', () => {
  it('compte les coups de chaque camp séparément', () => {
    const r = resumerCoups([
      coup('w', 0, 'brillant'),
      coup('w', 0, 'bon'),
      coup('w', 12, 'erreur'),
      coup('b', 0, 'bon'),
      coup('b', 30, 'gaffe'),
      coup('b', 30, 'gaffe'),
    ]);
    expect(r.w).toEqual({ brillant: 1, bon: 1, imprecision: 0, erreur: 1, gaffe: 0 });
    expect(r.b).toEqual({ brillant: 0, bon: 1, imprecision: 0, erreur: 0, gaffe: 2 });
  });

  it('couvre toutes les catégories, même vides', () => {
    const r = resumerCoups([]);
    CATEGORIES.forEach((c) => {
      expect(r.w[c]).toBe(0);
      expect(r.b[c]).toBe(0);
    });
  });

  it('a autant de coups comptés que de coups joués', () => {
    const coups = [coup('w', 0), coup('b', 8, 'imprecision'), coup('w', 25, 'gaffe')];
    const r = resumerCoups(coups);
    const somme = (x: Record<string, number>) => Object.values(x).reduce((a, b) => a + b, 0);
    expect(somme(r.w) + somme(r.b)).toBe(coups.length);
  });
});

describe('courbe d’évaluation', () => {
  it('garde une valeur par position', () => {
    expect(courbeDEval([0, 30, -40, 120])).toEqual([0, 30, -40, 120]);
  });

  it('écrête les avantages écrasants et les mats', () => {
    expect(courbeDEval([5000, -5000, 99999, -99999])).toEqual([
      COURBE_MAX,
      -COURBE_MAX,
      COURBE_MAX,
      -COURBE_MAX,
    ]);
    expect(ecreter(999)).toBe(999);
  });

  it('ne modifie pas le tableau d’origine', () => {
    const scores = [2000, -2000];
    courbeDEval(scores);
    expect(scores).toEqual([2000, -2000]);
  });
});

describe('coup critique', () => {
  it('est le coup qui a fait perdre le plus de probabilité de gain, tous camps confondus', () => {
    const coups = [coup('w', 0), coup('b', 15, 'erreur'), coup('w', 40, 'gaffe'), coup('b', 22, 'gaffe')];
    expect(coupCritique(coups)).toBe(2);
  });

  it('vaut null dans une partie sans erreur', () => {
    expect(coupCritique([coup('w', 0), coup('b', 4), coup('w', 9, 'imprecision')])).toBeNull();
    expect(coupCritique([])).toBeNull();
  });

  it('retient le premier en cas d’égalité', () => {
    expect(coupCritique([coup('w', 30, 'gaffe'), coup('b', 30, 'gaffe')])).toBe(0);
  });
});

describe('évaluation lisible', () => {
  it('écrit les pions avec une virgule et le vrai signe moins', () => {
    expect(libelleEval(32)).toBe('+0,3');
    expect(libelleEval(-120)).toBe('−1,2');
    expect(libelleEval(0)).toBe('0,0');
  });

  it('annonce les mats par leur distance', () => {
    expect(libelleEval(100000 - 3)).toBe('M3');
    expect(libelleEval(-(100000 - 2))).toBe('−M2');
  });

  it('écrit le résultat quand le mat est déjà donné', () => {
    expect(libelleEval(100000)).toBe('1-0');
    expect(libelleEval(-100000)).toBe('0-1');
  });
});
