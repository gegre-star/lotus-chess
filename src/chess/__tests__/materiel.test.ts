/**
 * Compter le matériel honnêtement.
 *
 * `evaluate` mélange le matériel et des bonus de position : un cavalier qui
 * revient au centre y vaut jusqu'à un pion de plus. S'en servir pour décider
 * si un problème est résolu revenait à récompenser un coup qui ne gagne rien.
 * Et compter juste après une prise ment : « +9 » une demi-seconde avant de
 * rendre la dame n'est pas un avantage de neuf points.
 */
import { material, stableMaterial } from '../ai';
import { legalMoves, makeMove, parseFEN, squareFromName } from '../engine';

const pions = (n: number) => n / 100;

describe('matériel brut', () => {
  test('la position de départ est équilibrée', () => {
    expect(material(parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'))).toBe(0);
  });

  test('une dame de plus vaut neuf pions', () => {
    expect(pions(material(parseFEN('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')))).toBe(9);
  });

  test('le roi ne compte pas dans le matériel', () => {
    expect(material(parseFEN('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(0);
  });
});

describe('matériel une fois les prises épuisées', () => {
  test('sans prise possible, c’est le matériel brut', () => {
    const pos = parseFEN('4k3/8/8/8/8/8/8/3QK3 w - - 0 1');
    expect(stableMaterial(pos)).toBe(material(pos));
  });

  test('la reprise est comptée : prendre une dame défendue ne rapporte pas neuf pions', () => {
    // la dame noire d5 est défendue par le pion c6 ; Txd5 perd la tour
    const pos = parseFEN('4k3/8/2p5/3q4/8/8/8/3RK3 w - - 0 1');
    const txd5 = legalMoves(pos).find(
      (m) => m.from === squareFromName('d1') && m.to === squareFromName('d5'),
    )!;
    const apres = makeMove(pos, txd5);
    // brut : on vient de gagner une dame
    expect(pions(material(apres) - material(pos))).toBe(9);
    // réel : la dame contre la tour, soit quatre pions
    expect(pions(stableMaterial(apres) - material(pos))).toBe(4);
  });

  test('une prise non défendue rapporte bien tout', () => {
    const pos = parseFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
    const txd5 = legalMoves(pos).find(
      (m) => m.from === squareFromName('d1') && m.to === squareFromName('d5'),
    )!;
    expect(pions(stableMaterial(makeMove(pos, txd5)) - material(pos))).toBe(9);
  });

  test('sous échec, on ne peut pas « passer son tour »', () => {
    // les blancs sont en échec de la tour a1 : la seule suite est Rxa1,
    // le matériel stable doit en tenir compte
    const pos = parseFEN('7k/8/8/8/8/8/8/r3K3 w - - 0 1');
    expect(legalMoves(pos).length).toBeGreaterThan(0);
    // après Rd2 les noirs gardent leur tour
    const rd2 = legalMoves(pos).find(
      (m) => m.from === squareFromName('e1') && m.to === squareFromName('d2'),
    )!;
    expect(pions(stableMaterial(makeMove(pos, rd2)))).toBe(-5);
  });

  test('le mat pèse plus que tout le matériel', () => {
    // les noirs sont mats : du point de vue des blancs, c'est tout gagné
    const noirsMats = parseFEN('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
    expect(stableMaterial(noirsMats)).toBeGreaterThan(10000);
    // et symétriquement
    const blancsMats = parseFEN('6k1/8/8/8/8/8/5PPP/r5K1 w - - 0 1');
    expect(stableMaterial(blancsMats)).toBeLessThan(-10000);
  });

  test('le pat vaut zéro, quel que soit le matériel', () => {
    // les blancs ont une dame de plus mais les noirs sont pat
    const pat = parseFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(stableMaterial(pat)).toBe(0);
  });

  test('l’échange complet d’une colonne se résout jusqu’au bout', () => {
    // tour contre tour, chacune défendue : personne ne gagne rien
    const pos = parseFEN('3rk3/3r4/8/8/8/8/3R4/3RK3 w - - 0 1');
    expect(stableMaterial(pos)).toBe(material(pos));
  });
});
