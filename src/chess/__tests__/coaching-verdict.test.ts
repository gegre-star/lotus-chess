import {
  bilanMateriel,
  noterCoup,
  perteDeGain,
  probaGain,
  SEUIL_MAT,
  SEUILS,
  soldeApresEchanges,
  type Verdict,
} from '../coaching';
import { findMove, parseFEN, squareFromName as at, type Position } from '../engine';

const coup = (pos: Position, from: string, to: string) => {
  const m = findMove(pos, at(from), at(to));
  if (!m) throw new Error(`${from}${to} illégal`);
  return m;
};

/** Centipions nécessaires, depuis l'égalité, pour perdre `points` points de probabilité de gain. */
const cpPourPerdre = (points: number): number =>
  (2 / 0.00368208) * Math.atanh(points / 50);

describe('probabilité de gain', () => {
  it('vaut 50 % à égalité', () => {
    expect(probaGain(0)).toBe(50);
  });

  it('suit la formule de lichess', () => {
    // valeurs de référence de la courbe de lichess
    expect(probaGain(100)).toBeCloseTo(59.1, 1);
    expect(probaGain(300)).toBeCloseTo(75.1, 1);
    expect(probaGain(-300)).toBeCloseTo(24.9, 1);
  });

  it('est symétrique entre les deux camps', () => {
    [40, 250, 800].forEach((cp) => {
      expect(probaGain(cp) + probaGain(-cp)).toBeCloseTo(100, 9);
    });
  });

  it('s’aplatit dans les positions tranchées', () => {
    // dix pions ou vingt : le résultat de la partie ne change plus
    expect(probaGain(2000)).toBe(probaGain(1000));
    expect(probaGain(1000)).toBeGreaterThan(97);
  });

  it('vaut 100 ou 0 pour un mat', () => {
    expect(probaGain(100000 - 3)).toBe(100);
    expect(probaGain(-(100000 - 3))).toBe(0);
    expect(probaGain(SEUIL_MAT)).toBe(100);
  });

  it('mesure la perte entre deux évaluations, jamais négative', () => {
    expect(perteDeGain(0, -300)).toBeCloseTo(25.1, 1);
    expect(perteDeGain(0, 300)).toBe(0);
  });
});

describe('seuils du verdict', () => {
  const pos = parseFEN('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1');
  const move = coup(pos, 'f3', 'd4'); // coup tranquille : aucune phrase matérielle
  const verdictPerdu = (meilleur: number, joue: number): Verdict =>
    noterCoup({ pos, move, meilleur, joue }).verdict;

  it('classe par perte de probabilité de gain : 5, 10 et 20 points', () => {
    expect(SEUILS.map(([limite]) => limite)).toEqual([5, 10, 20, Infinity]);
    expect(SEUILS.map(([, v]) => v)).toEqual(['bon', 'imprecision', 'erreur', 'gaffe']);
  });

  it('place les frontières à 5, 10 et 20 points, incluses dans leur classe', () => {
    const cas: [number, Verdict, Verdict][] = [
      [5, 'bon', 'imprecision'],
      [10, 'imprecision', 'erreur'],
      [20, 'erreur', 'gaffe'],
    ];
    cas.forEach(([limite, dessous, dessus]) => {
      const cp = cpPourPerdre(limite);
      // un centipion en deçà de la frontière, puis au-delà
      expect(verdictPerdu(0, -Math.floor(cp))).toBe(dessous);
      expect(verdictPerdu(0, -Math.ceil(cp) - 1)).toBe(dessus);
    });
  });

  it('ne recule jamais quand la perte grandit', () => {
    const ordre: Verdict[] = ['bon', 'imprecision', 'erreur', 'gaffe'];
    let dernier = 0;
    for (let cp = 0; cp <= 800; cp += 5) {
      const rang = ordre.indexOf(verdictPerdu(0, -cp));
      expect(rang).toBeGreaterThanOrEqual(dernier);
      dernier = rang;
    }
    expect(dernier).toBe(3);
  });

  /** Le défaut que les seuils fixes en centipions ne pouvaient pas éviter. */
  it('ne traite pas comme une gaffe trois pions perdus à +10', () => {
    expect(verdictPerdu(1000, 700)).toBe('bon');
    expect(noterCoup({ pos, move, meilleur: 1000, joue: 700 }).perteGain).toBeLessThan(5);
  });

  it('traite comme une gaffe trois pions perdus à égalité', () => {
    expect(verdictPerdu(0, -300)).toBe('gaffe');
  });

  it('ne s’acharne pas sur une position déjà perdue', () => {
    // à −10, perdre encore trois pions ne change presque rien
    expect(verdictPerdu(-1000, -1300)).toBe('bon');
  });

  it('juge une perte selon d’où l’on part : même écart, verdicts différents', () => {
    // 100 centipions perdus : imprécision à égalité, à peine perceptible à +9
    expect(verdictPerdu(0, -100)).toBe('imprecision');
    expect(verdictPerdu(900, 800)).toBe('bon');
  });

  it('expose la perte de gain et la perte en centipions', () => {
    const f = noterCoup({ pos, move, meilleur: 0, joue: -150 });
    expect(f.perte).toBe(150);
    expect(f.perteGain).toBeCloseTo(perteDeGain(0, -150), 9);
  });

  describe('avec un mat en jeu', () => {
    it('laisser échapper un mat gagné vaut au moins une imprécision', () => {
      // 99 997 contre +9 : la probabilité ne bouge que de 3 points, mais un
      // mat est un mat
      const f = noterCoup({ pos, move, meilleur: 99997, joue: 900 });
      expect(['imprecision', 'erreur', 'gaffe']).toContain(f.verdict);
      expect(f.texte).toContain('mat');
    });

    it('offrir un mat à l’adversaire vaut au moins une erreur', () => {
      // à −6 la perte de gain n'est que de 6 points : imprécision sans la règle
      const f = noterCoup({ pos, move, meilleur: -600, joue: -99998 });
      expect(['erreur', 'gaffe']).toContain(f.verdict);
      expect(f.texte).toContain('mater');
    });

    it('ne punit pas un mat plus lent', () => {
      expect(verdictPerdu(99999, 99995)).toBe('bon');
    });
  });
});

describe('texte du verdict « bon » (F12)', () => {
  const pos = parseFEN('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1');
  const move = coup(pos, 'f3', 'd4');
  const texte = (perte: number) => noterCoup({ pos, move, meilleur: 0, joue: -perte }).texte;

  it('dit « meilleur coup » jusqu’à 10 centipions perdus', () => {
    expect(texte(0)).toBe("C'est le meilleur coup de la position.");
    expect(texte(10)).toBe("C'est le meilleur coup de la position.");
  });

  it('dit « Bon coup. » de 11 à 50 centipions', () => {
    [11, 25, 50].forEach((perte) => {
      const f = noterCoup({ pos, move, meilleur: 0, joue: -perte });
      expect(f.verdict).toBe('bon');
      expect(f.texte).toBe('Bon coup.');
    });
  });

  it('ne prétend jamais « meilleur coup » quand le coup n’est pas le meilleur', () => {
    for (let perte = 11; perte <= 54; perte += 1) {
      expect(texte(perte)).not.toContain('meilleur coup');
    }
  });
});

describe('brillant et échanges de reprises (F13)', () => {
  /** Écossaise : 1.e4 e5 2.Cf3 Cc6 3.d4 exd4, les blancs jouent. */
  const ECOSSAISE = 'r1bqkbnr/pppp1ppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 4';

  it('ne qualifie pas 4.Cxd4 de sacrifice : la reprise est comptée', () => {
    const pos = parseFEN(ECOSSAISE);
    const cxd4 = coup(pos, 'f3', 'd4');
    // Stockfish (profondeur 10) : +0,38 pour le meilleur coup, +0,44 après Cxd4
    const f = noterCoup({ pos, move: cxd4, meilleur: 38, joue: 38 });
    expect(f.verdict).not.toBe('brillant');
    expect(f.verdict).toBe('bon');
    expect(f.texte).not.toContain('−2');
    expect(f.texte).not.toContain('Tu donnes du matériel');
  });

  it('calcule le solde après les échanges : un pion gagné, pas deux points perdus', () => {
    const pos = parseFEN(ECOSSAISE);
    const cxd4 = coup(pos, 'f3', 'd4');
    expect(soldeApresEchanges(pos, cxd4)).toBe(1);
    const b = bilanMateriel(pos, cxd4);
    expect(b.net).toBe(1);
    // le détail du premier demi-coup reste disponible pour l'explication
    expect(b.gagne).toBe(1);
    expect(b.risque).toBe(3);
    expect(b.phrase).toContain('tu reprends à ton tour');
  });

  it('parle toujours de sacrifice quand le solde reste négatif après les reprises', () => {
    // le cavalier prend un pion défendu par un pion, et rien ne reprend : −2
    const pos = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'f3', 'e5'));
    expect(b.net).toBe(-2);
    expect(noterCoup({ pos, move: coup(pos, 'f3', 'e5'), meilleur: 300, joue: 300 }).verdict).toBe(
      'brillant',
    );
  });

  it('compte un échange égal comme équilibré, pas comme un sacrifice', () => {
    // dxe5 dxe5 : pion contre pion, solde nul
    const pos = parseFEN('4k3/8/3p4/4p3/3P4/8/8/4K3 w - - 0 1');
    const dxe5 = coup(pos, 'd4', 'e5');
    const b = bilanMateriel(pos, dxe5);
    expect(b.net).toBe(0);
    expect(b.phrase).toContain('équilibré');
    expect(noterCoup({ pos, move: dxe5, meilleur: 0, joue: 0 }).verdict).toBe('bon');
  });

  it('additionne toute la chaîne de reprises : Dxd5 Txd5 Txd5 laisse +5', () => {
    // dame contre dame, plus la tour noire prise à la fin
    const pos = parseFEN('3rk3/8/8/3q4/8/8/3Q4/3RK3 w - - 0 1');
    expect(soldeApresEchanges(pos, coup(pos, 'd2', 'd5'))).toBe(5);
  });

  it('ne décerne pas « brillant » si la position était déjà gagnée', () => {
    const pos = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'f3', 'e5'), meilleur: 900, joue: 900 });
    expect(f.verdict).toBe('bon');
  });

  it('ne décerne pas « brillant » quand le sacrifice laisse une position mauvaise', () => {
    const pos = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'f3', 'e5'), meilleur: -400, joue: -400 });
    expect(f.verdict).toBe('bon');
  });

  it('un vrai sacrifice qui mène au mat reste brillant', () => {
    const pos = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'f3', 'e5'), meilleur: 99995, joue: 99995 });
    expect(f.verdict).toBe('brillant');
  });
});

describe('phrase d’une gaffe sans pièce en prise (F14)', () => {
  it('ne prétend pas qu’une pièce est en prise quand aucune ne l’est', () => {
    // un coup de roi tranquille : rien n'est attaqué, mais l'évaluation s'effondre
    const pos = parseFEN('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'e1', 'd1'), meilleur: 0, joue: -600 });
    expect(f.verdict).toBe('gaffe');
    expect(f.texte).not.toContain('reste en prise');
    expect(f.texte).toContain(
      "Ce coup laisse à l'adversaire une réponse très forte : cherche ce qu'il menace.",
    );
  });

  it('garde « une pièce reste en prise » quand une pièce l’est vraiment', () => {
    // la tour a1 est attaquée par le fou c3 et rien ne la défend ; le roi joue ailleurs
    const pos = parseFEN('4k3/8/8/8/8/2b5/8/R3K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'e1', 'f2'), meilleur: 0, joue: -600 });
    expect(f.verdict).toBe('gaffe');
    expect(f.texte).toContain('Une pièce reste en prise après ce coup.');
  });

  it('préfère la phrase matérielle quand le coup en a une', () => {
    const pos = parseFEN('4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({ pos, move: coup(pos, 'f3', 'e5'), meilleur: 0, joue: -600 });
    expect(f.texte).toContain('attaquée');
    expect(f.texte).not.toContain('reste en prise');
  });
});

describe('voix de l’adversaire', () => {
  it('ne dit pas « tu » d’un coup adverse', () => {
    const pos = parseFEN('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1');
    const move = coup(pos, 'e1', 'd1');
    const f = noterCoup({ pos, move, meilleur: 0, joue: -600, voix: 'adversaire' });
    expect(f.texte).not.toMatch(/\btu\b|\bton\b|\bta\b/i);
    expect(f.texte).toContain('te laisse');
  });

  it('raconte la prise adverse à la troisième personne', () => {
    const pos = parseFEN('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'f3', 'e5'), 'adversaire');
    expect(b.phrase).toContain("L'adversaire prend un pion");
  });
});
