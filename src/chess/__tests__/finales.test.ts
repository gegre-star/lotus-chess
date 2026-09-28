/**
 * Chaque finale est validée par le moteur : l'objectif annoncé est celui que
 * l'évaluation confirme, sans quoi on entraînerait l'élève à une position
 * gagnante qu'on lui présente comme nulle, ou l'inverse.
 */
import { Cerveau } from '../brain/cerveau';
import { FINALES, coupsDeLEleve, evaluerFinale } from '../finales';
import { BOTS } from '../content';
import { findMove, gameStatus, legalMoves, makeMove, parseFEN, squareFromName, type Color } from '../engine';
import { jouer, nouvellePartie, abandonner, type Partie } from '../partie';

describe.each(FINALES.map((f) => [f.id, f] as const))('finale « %s »', (_id, f) => {
  const pos = parseFEN(f.fen);
  const c = new Cerveau();

  test('la position est jouable et n’est pas déjà terminée', () => {
    expect(['ok', 'check']).toContain(gameStatus(pos));
    expect(legalMoves(pos).length).toBeGreaterThan(0);
  });

  test('l’objectif annoncé est confirmé par Stockfish (valeur consignée)', () => {
    // La référence est Stockfish 18 à profondeur 22, consignée dans les données :
    // le moteur maison se trompe sur Philidor, où le matériel masque la forteresse.
    const v = f.validation;
    if (f.objectif === 'gagner') {
      expect(v.type === 'mat' ? v.valeur : v.valeur).toBeGreaterThan(v.type === 'mat' ? 0 : 250);
    } else {
      expect(v.type).toBe('cp');
      expect(Math.abs(v.valeur)).toBeLessThan(60);
    }
  });

  test('le moteur maison est d’accord quand l’objectif est de gagner', () => {
    if (f.objectif !== 'gagner') return;
    const a = c.analyser(pos, { profondeur: 10, noeuds: 1_200_000 });
    const pourLeTrait = a.mat !== null ? Math.sign(a.mat) * 10_000 : (a.cp ?? 0);
    const pourEleve = pos.turn === f.camp ? pourLeTrait : -pourLeTrait;
    expect(pourEleve).toBeGreaterThan(100);
  });

  test('le camp de l’élève a bien une consigne et un principe', () => {
    expect(f.consigne.length).toBeGreaterThan(20);
    expect(f.principe.length).toBeGreaterThan(40);
    expect(f.coupsMax).toBeGreaterThan(5);
  });
});

test('les identifiants sont uniques', () => {
  expect(new Set(FINALES.map((f) => f.id)).size).toBe(FINALES.length);
});

describe('évaluation d’une partie de finale', () => {
  const bot = BOTS[0];
  const finale = FINALES.find((f) => f.id === 'mat-dame')!;
  const nouvelle = (): Partie => ({ ...nouvellePartie(bot, finale.camp), position: parseFEN(finale.fen) });

  test('tant que rien n’est décidé : null', () => {
    expect(evaluerFinale(finale, nouvelle())).toBeNull();
  });

  test('un mat de l’élève réussit un objectif « gagner »', () => {
    // mat en un : dame et roi contre roi acculé
    const p = { ...nouvelle(), position: parseFEN('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1') };
    const m = legalMoves(p.position).find((x) => {
      return gameStatus(makeMove(p.position, x)) === 'mate';
    })!;
    expect(evaluerFinale(finale, jouer(p, m))).toBe('reussi');
  });

  test('un pat rate un objectif « gagner »', () => {
    const p = { ...nouvelle(), position: parseFEN('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1') };
    const pat = findMove(p.position, squareFromName('g1'), squareFromName('g6'))!;
    const fin = jouer(p, pat);
    expect(fin.fin?.statut).toBe('stalemate');
    expect(evaluerFinale(finale, fin)).toBe('rate');
  });

  test('abandonner rate', () => {
    expect(evaluerFinale(finale, abandonner(nouvelle()))).toBe('rate');
  });

  test('passer le nombre de coups permis sans gagner rate', () => {
    let p = nouvelle();
    // coups d'aller-retour sans intention : le roi blanc va et vient, le noir aussi
    const alterner: [string, string][] = [
      ['e1', 'e2'], ['e8', 'e7'], ['e2', 'e1'], ['e7', 'e8'],
    ];
    for (let i = 0; i < finale.coupsMax * 2; i += 1) {
      const [de, vers] = alterner[i % 4];
      const m = findMove(p.position, squareFromName(de), squareFromName(vers));
      if (!m) break;
      p = jouer(p, m);
      if (p.fin) break;
    }
    const issue = evaluerFinale(finale, p);
    expect(issue).toBe('rate');
  });

  test('tenir la nulle jusqu’au bout réussit un objectif « nulle »', () => {
    const philidor = FINALES.find((f) => f.id === 'philidor')!;
    // la partie n'est pas terminée, mais le nombre de coups permis est atteint
    const base = { ...nouvellePartie(bot, philidor.camp), position: parseFEN(philidor.fen) };
    const moves = Array.from({ length: philidor.coupsMax * 2 + 1 }, () => ({ from: 0, to: 0 }));
    const longue = { ...base, moves: moves as unknown as Partie['moves'] };
    expect(evaluerFinale(philidor, longue)).toBe('reussi');
  });

  test('les coups de l’élève se comptent selon qui ouvre', () => {
    const f = (n: number) => ({ moves: new Array(n).fill(null) }) as unknown as Partie;
    // l'élève ouvre (mat de la dame, blancs au trait)
    expect(coupsDeLEleve(finale, f(0))).toBe(0);
    expect(coupsDeLEleve(finale, f(1))).toBe(1);
    expect(coupsDeLEleve(finale, f(2))).toBe(1);
    // Philidor : les noirs, qui sont l'élève, ont le trait au départ
    const philidor = FINALES.find((x) => x.id === 'philidor')!;
    expect(coupsDeLEleve(philidor, f(1))).toBe(1);
    // « gagner avec un pion » : l'élève a les blancs mais l'adversaire ouvre
    const pion = FINALES.find((x) => x.id === 'promouvoir')!;
    expect(coupsDeLEleve(pion, f(1))).toBe(0);
    expect(coupsDeLEleve(pion, f(2))).toBe(1);
  });
});

void (undefined as unknown as Color);
