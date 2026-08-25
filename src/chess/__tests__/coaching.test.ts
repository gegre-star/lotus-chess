import {
  bilanMateriel,
  expliquerRefus,
  noterCoup,
  perteEnPions,
  piecesEnPrise,
  POINTS,
  SEUIL_MAT,
} from '../coaching';
import { findMove, parseFEN, squareFromName as at, type Position } from '../engine';

const coup = (pos: Position, from: string, to: string) => {
  const m = findMove(pos, at(from), at(to));
  if (!m) throw new Error(`${from}${to} illégal`);
  return m;
};

describe('calcul matériel', () => {
  it('compte une prise gratuite', () => {
    // le pion e5 n'est défendu par rien
    const pos = parseFEN('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'f3', 'e5'));
    expect(b).toMatchObject({ gagne: 1, risque: 0, net: 1 });
    expect(b.phrase).toContain('+1');
  });

  it('compte une prise où l’on se fait reprendre', () => {
    // le pion e5 est défendu par le pion d6 : cavalier contre pion
    const pos = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'f3', 'e5'));
    expect(b).toMatchObject({ gagne: POINTS.P, risque: POINTS.N, net: -2 });
    expect(b.phrase).toContain('−2');
  });

  it('signale une pièce qui s’expose sans rien prendre', () => {
    const pos = parseFEN('4k3/8/3p4/8/8/5N2/8/4K3 w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'f3', 'e5'));
    expect(b).toMatchObject({ gagne: 0, risque: POINTS.N, net: -3 });
    expect(b.phrase).toContain('attaquée');
  });

  it('ne dit rien d’un coup tranquille', () => {
    const pos = parseFEN('4k3/8/8/8/8/5N2/8/4K3 w - - 0 1');
    expect(bilanMateriel(pos, coup(pos, 'f3', 'd4')).phrase).toBeNull();
  });

  it('compte le pion pris en passant', () => {
    const pos = parseFEN('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const b = bilanMateriel(pos, coup(pos, 'e5', 'd6'));
    expect(b.gagne).toBe(1);
  });
});

describe('verdict', () => {
  const pos = parseFEN('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1');
  const move = coup(pos, 'f3', 'e5');

  it('appelle bon le meilleur coup ordinaire', () => {
    const f = noterCoup({ pos, move, meilleur: 120, joue: 120 });
    expect(f.verdict).toBe('bon');
    expect(f.titre).toBe('Bon coup');
  });

  it('gradue les pertes', () => {
    const cas: [number, string][] = [
      [40, 'bon'],
      [100, 'imprecision'],
      [250, 'erreur'],
      [900, 'gaffe'],
    ];
    cas.forEach(([perte, attendu]) => {
      expect(noterCoup({ pos, move, meilleur: 1000, joue: 1000 - perte }).verdict).toBe(attendu);
    });
  });

  it('ne pénalise pas un coup meilleur que prévu', () => {
    expect(noterCoup({ pos, move, meilleur: 100, joue: 400 }).perte).toBe(0);
  });

  it('réserve « brillant » au meilleur coup qui sacrifie du matériel', () => {
    // ici le cavalier se donne pour un pion : perte matérielle, mais meilleur coup
    const sacrifice = parseFEN('4k3/8/3p4/4p3/8/5N2/8/4K3 w - - 0 1');
    const f = noterCoup({
      pos: sacrifice,
      move: coup(sacrifice, 'f3', 'e5'),
      meilleur: 500,
      joue: 500,
    });
    expect(f.verdict).toBe('brillant');
  });

  it('n’appelle pas brillant un bon coup sans sacrifice', () => {
    expect(noterCoup({ pos, move, meilleur: 100, joue: 100 }).verdict).toBe('bon');
  });

  it('exprime la perte en points dans le texte', () => {
    const f = noterCoup({ pos, move, meilleur: 1000, joue: 700 });
    expect(f.texte).toContain('3,0');
  });
});

describe('pièces en prise', () => {
  it('repère une pièce attaquée et non défendue', () => {
    const pos = parseFEN('4k3/8/8/4r3/8/4R3/8/4K3 w - - 0 1');
    // la tour noire e5 est attaquée par la tour e3 et rien ne la défend
    expect(piecesEnPrise(pos, 'b')).toEqual(['e5']);
  });

  it('ignore une pièce défendue', () => {
    const pos = parseFEN('4k3/8/5b2/4r3/8/4R3/8/4K3 w - - 0 1');
    // le fou f6 défend la tour e5
    expect(piecesEnPrise(pos, 'b')).not.toContain('e5');
  });

  it('ne compte jamais le roi', () => {
    const pos = parseFEN('4k3/8/8/8/8/4R3/8/4K3 w - - 0 1');
    expect(piecesEnPrise(pos, 'b')).toEqual([]);
  });
});

describe('reprise réellement possible', () => {
  /**
   * Régression : le calcul regardait si la case d'arrivée était attaquée
   * géométriquement. Sur un mat, le roi « attaque » la dame qui vient de mater
   * sans pouvoir la prendre — le coup gagnant s'accompagnait donc de « ta
   * pièce peut être reprise ».
   */
  it('ne prétend pas qu’une pièce qui mate peut être reprise', () => {
    // mat du berger après 1.e4 Cf6 2.Fc4 Cxe4 3.Dh5 Cc3 ; Dxf7 est mat, et le
    // roi noir touche f7 sans pouvoir y aller
    const pos = parseFEN('rnbqkb1r/pppppppp/8/7Q/2B5/2n5/PPPP1PPP/RNB1K1NR w KQkq - 2 4');
    const b = bilanMateriel(pos, coup(pos, 'h5', 'f7'));
    expect(b.risque).toBe(0);
    expect(b.phrase).not.toContain('reprise');
  });

  it('ne compte pas un défenseur cloué comme une défense', () => {
    // le fou f6 est cloué par la tour f1 face au roi f8 : il ne peut pas
    // reprendre en d4, alors qu'il y est géométriquement braqué
    const pos = parseFEN('5k2/8/5b2/8/3N4/8/8/5R1K w - - 0 1');
    const b = bilanMateriel(pos, coup(pos, 'd4', 'e6'));
    expect(b.risque).toBe(0);
  });
});

describe('perte quand un mat est en jeu', () => {
  /**
   * Régression : l'écran affichait « Gaffe · −989,4 ». Les scores de mat
   * valent environ 100 000 ; les soustraire donne des écarts en centaines de
   * pions, qui ne décrivent rien. Au-delà du seuil, on parle de mat.
   */
  const pos = parseFEN('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1');
  const move = coup(pos, 'f3', 'e5');

  it('n’exprime plus la perte en pions au-delà du seuil', () => {
    expect(perteEnPions(99940)).toBeNull();
    expect(perteEnPions(SEUIL_MAT)).toBeNull();
  });

  it('la garde en pions en deçà', () => {
    expect(perteEnPions(250)).toBeCloseTo(2.5);
    expect(perteEnPions(0)).toBe(0);
  });

  it('dit qu’un mat a été laissé échapper', () => {
    const f = noterCoup({ pos, move, meilleur: 99997, joue: 40 });
    expect(f.verdict).toBe('gaffe');
    expect(f.texte).toContain('mat à jouer');
    expect(f.texte).not.toMatch(/\d+,\d/);
  });

  it('dit qu’un mat est concédé', () => {
    const f = noterCoup({ pos, move, meilleur: 40, joue: -99997 });
    expect(f.texte).toContain('permet à l’adversaire de mater');
  });

  it('conserve les évaluations reçues, pour que l’écran puisse trancher', () => {
    const f = noterCoup({ pos, move, meilleur: 300, joue: 120 });
    expect(f.evalMeilleur).toBe(300);
    expect(f.evalJoue).toBe(120);
  });
});

describe('explication d’un coup refusé', () => {
  const carre = (n: string) => at(n);

  /**
   * Position réellement rencontrée en partie, signalée comme un bug : le fou
   * noir de d2 fait échec, et le roi ne peut pas le prendre parce que la tour
   * de d8 le défend à travers toute la colonne. L'application avait raison,
   * mais ne le disait pas — d'où « c'est un bug ».
   */
  const echecFouDefendu = parseFEN('3r3r/R5pp/4k3/5R2/P5PP/1P6/3b4/4K3 w - - 0 30');

  it('dit qu’une pièce prise par le roi est défendue', () => {
    const texte = expliquerRefus(echecFouDefendu, carre('e1'), carre('d2'));
    expect(texte).toContain('défendue');
    expect(texte).toContain('d2');
  });

  it('se tait sur un coup parfaitement légal', () => {
    expect(expliquerRefus(echecFouDefendu, carre('e1'), carre('d1'))).toBeNull();
  });

  it('se tait quand la pièce ne se déplace pas ainsi', () => {
    // le roi ne va pas de e1 à a8 : ce n'est pas une règle à expliquer
    expect(expliquerRefus(echecFouDefendu, carre('e1'), carre('a8'))).toBeNull();
  });

  it('dit qu’une case reste en échec quand le roi y fuirait', () => {
    // roi en échec par une tour sur la colonne e ; e2 reste sur la colonne
    const pos = parseFEN('4r2k/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(expliquerRefus(pos, carre('e1'), carre('e2'))).toContain('encore en échec');
  });

  it('dit qu’un coup ne pare pas l’échec', () => {
    // la tour a1 pourrait aller en a2, mais l'échec de la tour e8 subsiste
    const pos = parseFEN('4r2k/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(expliquerRefus(pos, carre('a1'), carre('a2'))).toContain('ne pare pas');
  });

  it('dit qu’une pièce est clouée', () => {
    // le cavalier e4 est cloué par la tour e8 face au roi e1, sans échec en cours
    const pos = parseFEN('4r2k/8/8/8/4N3/8/8/4K3 w - - 0 1');
    expect(expliquerRefus(pos, carre('e4'), carre('c5'))).toContain('clouée');
  });
});
