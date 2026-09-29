/**
 * Le répertoire d'ouvertures.
 *
 * Une ligne fautive ne se verrait pas à l'écran : le coup serait simplement
 * ignoré et la partie continuerait. On vérifie donc chaque coup de chaque
 * ligne, depuis la position de départ — et on vérifie surtout ce à quoi sert
 * le répertoire : que deux parties ne commencent plus pareil.
 */
import {
  LIGNES,
  coupDeLivre,
  coupUci,
  coupsDeLivre,
  nommerOuverture,
} from '../ouvertures';
import { START_FEN, legalMoves, makeMove, parseFEN, squareName, toSAN } from '../engine';

function graine(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('toutes les lignes sont jouables', () => {
  test.each(LIGNES.map((l) => [l.nom, l] as const))('%s', (_nom, ligne) => {
    let pos = parseFEN(START_FEN);
    const san: string[] = [];
    ligne.coups.forEach((uci, i) => {
      const move = coupUci(pos, uci);
      if (!move) {
        throw new Error(
          `${ligne.nom} : coup ${i + 1} (${uci}) illégal après ${san.join(' ')} — ` +
            `coups possibles : ${legalMoves(pos)
              .map((m) => `${squareName(m.from)}${squareName(m.to)}`)
              .join(' ')}`,
        );
      }
      san.push(toSAN(pos, move));
      pos = makeMove(pos, move);
    });
    expect(san).toHaveLength(ligne.coups.length);
  });

  test('les poids sont positifs et les noms uniques', () => {
    LIGNES.forEach((l) => expect(l.poids).toBeGreaterThan(0));
    expect(new Set(LIGNES.map((l) => l.nom)).size).toBe(LIGNES.length);
  });
});

describe('le tirage fait varier les débuts de partie', () => {
  test('le premier coup des blancs n’est plus toujours le même', () => {
    const hasard = graine(31415);
    const vus = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const move = coupDeLivre(parseFEN(START_FEN), hasard);
      expect(move).not.toBeNull();
      if (move) vus.add(`${squareName(move.from)}${squareName(move.to)}`);
    }
    // e4, d4, c4, Cf3 : le répertoire ouvre sur quatre premiers coups
    expect(vus.size).toBeGreaterThanOrEqual(4);
  });

  test('vingt parties de livre donnent des positions différentes', () => {
    const hasard = graine(2718);
    const debuts = new Set<string>();
    for (let partie = 0; partie < 20; partie += 1) {
      let pos = parseFEN(START_FEN);
      const coups: string[] = [];
      for (let demiCoup = 0; demiCoup < 6; demiCoup += 1) {
        const move = coupDeLivre(pos, hasard);
        if (!move) break;
        coups.push(`${squareName(move.from)}${squareName(move.to)}`);
        pos = makeMove(pos, move);
      }
      debuts.add(coups.join(' '));
    }
    // sans répertoire, le moteur déterministe en produisait exactement une
    expect(debuts.size).toBeGreaterThanOrEqual(8);
  });

  test('hors répertoire, le livre se tait', () => {
    // 1.a4 h5 ne figure dans aucune ligne
    let pos = parseFEN(START_FEN);
    pos = makeMove(pos, coupUci(pos, 'a2a4')!);
    pos = makeMove(pos, coupUci(pos, 'h7h5')!);
    expect(coupsDeLivre(pos)).toEqual([]);
    expect(coupDeLivre(pos)).toBeNull();
  });

  test('les poids se cumulent quand deux lignes partagent un coup', () => {
    const depart = coupsDeLivre(parseFEN(START_FEN));
    const e4 = depart.find((c) => c.uci === 'e2e4');
    const plusFaible = Math.min(...depart.map((c) => c.poids));
    // 1.e4 mène à onze ouvertures du répertoire : il doit sortir souvent
    expect(e4!.poids).toBeGreaterThan(plusFaible * 3);
  });
});

describe('nommer l’ouverture', () => {
  test('la sicilienne avant que le dragon ne se distingue', () => {
    expect(nommerOuverture(['e2e4', 'c7c5', 'g1f3'])).toBe('Défense sicilienne');
    expect(
      nommerOuverture([
        'e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6',
      ]),
    ).toBe('Sicilienne, variante du dragon');
  });

  test('on se tait tant que rien ne distingue les lignes', () => {
    expect(nommerOuverture([])).toBeNull();
    expect(nommerOuverture(['e2e4'])).toBeNull();
    // 1.e4 e5 2.Cf3 : italienne, espagnole, écossaise et philidor restent possibles
    expect(nommerOuverture(['e2e4', 'e7e5', 'g1f3'])).toBeNull();
  });

  test('une partie hors répertoire n’a pas de nom', () => {
    expect(nommerOuverture(['a2a4', 'h7h5', 'a4a5'])).toBeNull();
  });

  test('la française se reconnaît', () => {
    expect(nommerOuverture(['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3'])).toBe('Défense française');
  });
});

/**
 * Les faux noms de l'audit.
 *
 * Le répertoire ne contient qu'une ligne par ouverture : tant qu'aucune autre
 * ligne ne partageait le début d'une partie, on la nommait sur le seul début,
 * même si le coup qui fait l'ouverture n'était pas joué. Trois transpositions
 * fréquentes en donnaient la preuve, et un quatrième cas — le nom qui
 * disparaît quand la partie quitte la liste — prouvait l'autre défaut.
 */
describe('nommer l’ouverture : transpositions et sorties du répertoire', () => {
  test('1.d4 d5 2.Cf3 (Cf6) n’est pas encore le système de Londres', () => {
    // Ff4 est le coup qui fait Londres ; sans lui, cette position vient aussi
    // bien d'un Réti inversé, d'une slave ou d'un gambit dame
    expect(nommerOuverture(['d2d4', 'd7d5', 'g1f3'])).toBeNull();
    expect(nommerOuverture(['d2d4', 'd7d5', 'g1f3', 'g8f6'])).toBeNull();
    expect(nommerOuverture(['d2d4', 'd7d5', 'g1f3', 'g8f6', 'c1f4'])).toBe('Système de Londres');
  });

  test('1.e4 c5 2.Cc3 reste une sicilienne : la « fermée » attend g3', () => {
    expect(nommerOuverture(['e2e4', 'c7c5', 'b1c3'])).toBe('Défense sicilienne');
    expect(nommerOuverture(['e2e4', 'c7c5', 'b1c3', 'b8c6'])).toBe('Défense sicilienne');
    expect(nommerOuverture(['e2e4', 'c7c5', 'b1c3', 'b8c6', 'g2g3'])).toBe('Sicilienne fermée');
  });

  test('1.d4 Cf6 2.c4 e6 3.Cc3 n’est pas la nimzo-indienne : elle attend Fb4', () => {
    const debut = ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3'];
    expect(nommerOuverture(debut)).toBeNull();
    expect(nommerOuverture([...debut, 'f8b4'])).toBe('Défense nimzo-indienne');
  });

  test('le nom survit à la sortie du répertoire : le gambit Evans reste italien', () => {
    // 4.b4 ne figure dans aucune ligne ; l'ancien code rendait alors `null`
    const evans = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4'];
    expect(nommerOuverture(evans)).toBe('Partie italienne');
    // et il ne s'efface pas non plus dix coups plus tard
    expect(nommerOuverture([...evans, 'c5b4', 'c2c3', 'b4a5'])).toBe('Partie italienne');
  });

  test('un nouveau nom remplace l’ancien quand la partie se précise', () => {
    // après 5.Fc4 c'est la partie italienne ; ...Cf6 en fait les deux cavaliers
    const c4 = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];
    expect(nommerOuverture(c4)).toBe('Partie italienne');
    expect(nommerOuverture([...c4, 'g8f6'])).toBe('Défense des deux cavaliers');
  });

  test('1.c4 est déjà l’ouverture anglaise, 1.c4 c5 la symétrique', () => {
    expect(nommerOuverture(['c2c4'])).toBe('Ouverture anglaise');
    expect(nommerOuverture(['c2c4', 'c7c5'])).toBe('Anglaise symétrique');
  });

  test('chaque ligne porte un coup distinctif qui existe', () => {
    LIGNES.forEach((l) => {
      expect(l.distinctif).toBeGreaterThanOrEqual(1);
      expect(l.distinctif).toBeLessThanOrEqual(l.coups.length);
    });
  });

  test.each(LIGNES.map((l) => [l.nom, l] as const))(
    '« %s » se reconnaît en entier, et pas avant son coup distinctif',
    (_nom, ligne) => {
      expect(nommerOuverture(ligne.coups)).toBe(ligne.nom);
      // un demi-coup avant le coup distinctif, le nom ne doit pas encore se lire
      expect(nommerOuverture(ligne.coups.slice(0, ligne.distinctif - 1))).not.toBe(ligne.nom);
    },
  );
});
