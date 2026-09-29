/**
 * Ce que doit garantir un problème.
 *
 * Trois défauts trouvés à l'audit et interdits ici :
 *
 * - une position sans les deux rois — `tour-dame` n'avait pas de roi noir, ce
 *   qui fausse tout ce qui se calcule dessus ;
 * - une ligne de solution qui traîne après le coup utile — la moitié des
 *   problèmes finissaient par trois ou quatre coups de roi sans objet, et
 *   « Solution » dessinait des flèches vers ces coups-là ;
 * - un gain annoncé qui ne correspond pas au gain réel, faute de compter la
 *   reprise adverse.
 */
import { Cerveau } from '../brain/cerveau';
import { LESSONS, PUZZLES } from '../content';
import { material, stableMaterial } from '../ai';
import { objectifAtteint } from '../puzzleState';
import {
  findMove,
  gameStatus,
  makeMove,
  parseFEN,
  squareFromName,
  type PieceType,
  type Position,
} from '../engine';

const rejoue = (fen: string, line: readonly (readonly string[])[]): Position => {
  let pos = parseFEN(fen);
  line.forEach((step) => {
    const mv = findMove(
      pos,
      squareFromName(step[0]),
      squareFromName(step[1]),
      step[2] as PieceType,
    );
    if (!mv) throw new Error(`coup ${step[0]}${step[1]} illégal`);
    pos = makeMove(pos, mv);
  });
  return pos;
};

describe('positions légales', () => {
  test('chaque problème place les deux rois', () => {
    const fautifs = PUZZLES.filter((p) => {
      const b = parseFEN(p.fen).board;
      return !b.includes('K') || !b.includes('k');
    }).map((p) => p.id);
    expect(fautifs).toEqual([]);
  });

  test('chaque étape de leçon place les deux rois', () => {
    const fautifs: string[] = [];
    LESSONS.forEach((l) =>
      l.steps.forEach((s, i) => {
        const b = parseFEN(s.fen).board;
        if (!b.includes('K') || !b.includes('k')) fautifs.push(`${l.id}:${i}`);
      }),
    );
    expect(fautifs).toEqual([]);
  });
});

describe('lignes de solution', () => {
  test.each(PUZZLES.map((p) => [p.id, p] as const))(
    '%s : la ligne s’arrête au dernier coup utile',
    (_id, puzzle) => {
      // le dernier demi-coup doit changer le matériel ou donner mat ; sinon
      // c'est du remplissage, et « Solution » le montrerait comme la réponse
      const avant = rejoue(puzzle.fen, puzzle.line.slice(0, -1));
      const apres = rejoue(puzzle.fen, puzzle.line);
      const utile = material(apres) !== material(avant) || gameStatus(apres) === 'mate';
      expect(utile).toBe(true);
    },
  );

  test('aucune ligne ne dépasse six demi-coups', () => {
    // au-delà, ce n'est plus un problème mais une partie
    PUZZLES.forEach((p) => expect(p.line.length).toBeLessThanOrEqual(6));
  });
});

describe('détection de la réussite', () => {
  test.each(PUZZLES.map((p) => [p.id, p] as const))(
    '%s : la ligne officielle résout le problème',
    (_id, puzzle) => {
      const start = parseFEN(puzzle.fen);
      expect(objectifAtteint(puzzle, start, rejoue(puzzle.fen, puzzle.line))).toBe(true);
    },
  );

  test.each(PUZZLES.filter((p) => p.line.length > 1).map((p) => [p.id, p] as const))(
    '%s : rien n’est annoncé résolu avant le dernier coup',
    (_id, puzzle) => {
      // Sans cela, une fourchette se déclarait gagnée dès l'échec, avant que
      // l'élève n'ait pris la pièce : l'application finissait la combinaison
      // à sa place.
      const start = parseFEN(puzzle.fen);
      for (let n = 1; n < puzzle.line.length; n += 1) {
        const intermediaire = rejoue(puzzle.fen, puzzle.line.slice(0, n));
        expect(`${n}: ${objectifAtteint(puzzle, start, intermediaire)}`).toBe(`${n}: false`);
      }
    },
  );

  test('un coup quelconque ne résout rien', () => {
    const puzzle = PUZZLES.find((p) => !p.mate)!;
    const start = parseFEN(puzzle.fen);
    expect(objectifAtteint(puzzle, start, start)).toBe(false);
  });
});

describe('objectif annoncé', () => {
  test.each(PUZZLES.filter((p) => !p.mate).map((p) => [p.id, p] as const))(
    '%s : le gain annoncé est le gain réel',
    (_id, puzzle) => {
      const start = parseFEN(puzzle.fen);
      const fin = rejoue(puzzle.fen, puzzle.line);
      const reel = (material(fin) - material(start)) / 100;
      expect(reel).toBeCloseTo(puzzle.gain, 5);
    },
  );

  test.each(PUZZLES.filter((p) => p.mate).map((p) => [p.id, p] as const))(
    '%s : la ligne se termine bien par un mat',
    (_id, puzzle) => {
      expect(gameStatus(rejoue(puzzle.fen, puzzle.line))).toBe('mate');
    },
  );

  test('compter juste après le coup de l’élève surévaluerait le gain', () => {
    // C'est le défaut corrigé, et il faut qu'un cas le prouve : après le coup
    // clé, le matériel brut annonce un gain que la reprise adverse va reprendre.
    // Sans cette différence, la détection naïve aurait suffi et ce test serait
    // un vœu pieux.
    const trompeurs = PUZZLES.filter((p) => !p.mate).filter((p) => {
      const apresCoupCle = rejoue(p.fen, p.line.slice(0, 1));
      return material(apresCoupCle) - stableMaterial(apresCoupCle) > 50;
    });
    expect(trompeurs.map((p) => p.id)).toContain('skewer-fou');
  });
});

/**
 * Le gain vaut-il la peine ?
 *
 * Un problème qui « gagne » une pièce pour laisser les blancs perdants, ou pour
 * finir roi contre roi, n'enseigne pas à gagner : `gen5` prenait un fou en
 * restant à deux pions et demi de retard, `fourch-roi` et `skewer-fou` finissaient
 * nulle. On mesure donc la position finale de la ligne officielle avec le
 * moteur maison, et on exige un avantage net.
 */
describe('un gain annoncé est un vrai gain', () => {
  test.each(PUZZLES.filter((p) => !p.mate).map((p) => [p.id, p] as const))(
    '%s : les blancs sont nettement mieux à la fin de la ligne',
    (_id, puzzle) => {
      const fin = rejoue(puzzle.fen, puzzle.line);
      const a = new Cerveau().analyser(fin, { profondeur: 6 });
      const signe = fin.turn === 'w' ? 1 : -1;
      // un mat annoncé compte pour un gain immense ; sinon au moins un pion
      const avantage = a.mat !== null ? signe * Math.sign(a.mat) * 100000 : signe * (a.cp ?? 0);
      expect(avantage).toBeGreaterThanOrEqual(100);
    },
  );
});

describe('un classement de difficulté cohérent', () => {
  test('deux problèmes ne partagent pas la même position', () => {
    const fens = PUZZLES.map((p) => p.fen.split(' ').slice(0, 2).join(' '));
    expect(new Set(fens).size).toBe(fens.length);
  });

  test('les mats en un génériques, uniques et sans piège, sont des problèmes faciles', () => {
    // `gen8` (1400) et `gen2` (1500) se résolvaient d'un seul coup évident,
    // au même rang que des combinaisons de trois coups
    PUZZLES.filter((p) => p.theme === 'Mat en un').forEach((p) => {
      expect(`${p.id}: ${p.rating <= 900}`).toBe(`${p.id}: true`);
    });
  });

  test('aucun motif ne prend plus de cinq problèmes, et la promotion pas plus de trois', () => {
    // cinq promotions sur trente-trois : la promotion tenait plus de place que
    // le clouage, l'attaque à la découverte ou la déviation réunis
    const compte = new Map<string, number>();
    PUZZLES.forEach((p) => compte.set(p.theme, (compte.get(p.theme) ?? 0) + 1));
    compte.forEach((n, theme) => expect(`${theme}: ${n <= 5}`).toBe(`${theme}: true`));
    expect(compte.get('Promotion')).toBeLessThanOrEqual(3);
  });

  test('le clouage et la découverte ont chacun leur problème', () => {
    const themes = new Set(PUZZLES.map((p) => p.theme));
    ['Clouage', 'Attaque à la découverte', 'Déviation', 'Enfilade'].forEach((t) => expect(themes.has(t)).toBe(true));
  });
});
