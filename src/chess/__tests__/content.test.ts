import { BOTS, GAMES, LESSONS, OPENINGS, PUZZLES, SECTIONS, TROPHIES } from '../content';
import { bestValue, evaluate, isGoodMove, moveValue, MATE_SCORE, tolerance } from '../ai';
import {
  findMove,
  gameStatus,
  inCheck,
  legalMoves,
  makeMove,
  movesFrom,
  parseFEN,
  playSAN,
  squareFromName as at,
  type Position,
} from '../engine';

/** Une position ne peut pas laisser en échec le camp qui n'a pas le trait. */
const opponentNotInCheck = (pos: Position) => inCheck(pos, pos.turn === 'w' ? 'b' : 'w');

describe('leçons', () => {
  it('ont des identifiants uniques et une section connue', () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    LESSONS.forEach((l) => expect(SECTIONS[l.sec]).toBeDefined());
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('« %s » ne contient que des positions licites', (_id, lesson) => {
    lesson.steps.forEach((step, k) => {
      const pos = parseFEN(step.fen);
      const where = `étape ${k + 1}`;
      expect(pos.board.filter(Boolean).length).toBeGreaterThan(0);
      // les deux rois doivent être présents, sinon l'affichage et les règles dérapent
      expect(`${where}: ${pos.board.includes('K')}`).toBe(`${where}: true`);
      expect(`${where}: ${pos.board.includes('k')}`).toBe(`${where}: true`);
      expect(`${where}: ${opponentNotInCheck(pos)}`).toBe(`${where}: false`);
      expect(step.say.length).toBeGreaterThan(10);
    });
  });

  it.each(LESSONS.map((l) => [l.id, l] as const))('« %s » propose des coups réellement jouables', (_id, lesson) => {
    lesson.steps.forEach((step, k) => {
      const pos = parseFEN(step.fen);
      const where = `étape ${k + 1}`;
      if (step.task) {
        const mv = findMove(pos, at(step.task.from), at(step.task.to), step.task.promotion);
        expect(`${where}: ${mv !== undefined}`).toBe(`${where}: true`);
      }
      if (step.arrowsFrom) {
        const from = at(step.arrowsFrom);
        const piece = pos.board[from];
        expect(`${where}: ${piece !== null}`).toBe(`${where}: true`);
        // la pièce doit appartenir au camp au trait, sinon aucune flèche ne s'affiche
        expect(`${where}: ${movesFrom(pos, from).length > 0}`).toBe(`${where}: true`);
      }
      (step.arrows ?? []).forEach(([a, b]) => {
        expect(a).toMatch(/^[a-h][1-8]$/);
        expect(b).toMatch(/^[a-h][1-8]$/);
      });
    });
  });

  it('tiennent leurs promesses pédagogiques', () => {
    const stepOf = (id: string, i: number) => LESSONS.find((l) => l.id === id)!.steps[i];

    // le pat : les noirs doivent être réellement sans coup légal, et pas en échec
    expect(gameStatus(parseFEN(stepOf('pat', 0).fen))).toBe('stalemate');

    // les leçons de mat doivent aboutir à un vrai mat
    for (const [id, i] of [['mat', 1], ['escalier', 1], ['l-mat-dame', 1], ['pat', 1]] as const) {
      const step = stepOf(id, i);
      const pos = parseFEN(step.fen);
      const mv = findMove(pos, at(step.task!.from), at(step.task!.to))!;
      expect(`${id}: ${gameStatus(makeMove(pos, mv))}`).toBe(`${id}: mate`);
    }

    // le clouage : le cavalier doit être totalement paralysé
    expect(movesFrom(parseFEN(stepOf('l-clouage', 0).fen), at('c6'))).toHaveLength(0);

    // la prise en passant doit bien en être une
    const ep = stepOf('enpassant', 1);
    const epMove = findMove(parseFEN(ep.fen), at(ep.task!.from), at(ep.task!.to));
    expect(epMove?.enPassant).toBe(true);

    // le roque doit bien être un roque
    const castle = stepOf('roque', 1);
    const castleMove = findMove(parseFEN(castle.fen), at(castle.task!.from), at(castle.task!.to));
    expect(castleMove?.castle).toBe('K');
  });
});

describe('problèmes', () => {
  it('ont des identifiants uniques et sont classés par difficulté', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const ratings = PUZZLES.map((p) => p.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
  });

  it.each(PUZZLES.map((p) => [`${p.id} (${p.theme})`, p] as const))(
    '%s : la solution est légale et atteint son objectif',
    (_label, puzzle) => {
      const start = parseFEN(puzzle.fen);
      expect(opponentNotInCheck(start)).toBe(false);
      // tous les problèmes se jouent avec les blancs, l'interface en dépend
      expect(start.turn).toBe('w');

      let pos = start;
      puzzle.line.forEach((step) => {
        const mv = findMove(pos, at(step[0]), at(step[1]), step[2]);
        expect(`${step[0]}${step[1]}: ${mv !== undefined}`).toBe(`${step[0]}${step[1]}: true`);
        pos = makeMove(pos, mv!);
      });

      if (puzzle.mate) {
        expect(gameStatus(pos)).toBe('mate');
      } else {
        expect(evaluate(pos) - evaluate(start)).toBeGreaterThanOrEqual(puzzle.gain * 100 - 60);
      }
    },
  );

  it.each(PUZZLES.map((p) => [`${p.id} (${p.theme})`, p] as const))(
    '%s : le premier coup est bien le meilleur disponible',
    (_label, puzzle) => {
      const start = parseFEN(puzzle.fen);
      const key = findMove(start, at(puzzle.line[0][0]), at(puzzle.line[0][1]), puzzle.line[0][2])!;
      expect(isGoodMove(start, key, 3)).toBe(true);
    },
  );

  it('refuse un mat plus lent sur un problème de mat', () => {
    // sur un mat en un, tout coup qui mate plus tard doit être rejeté
    const puzzle = PUZZLES.find((p) => p.mate && p.line.length === 1)!;
    const pos = parseFEN(puzzle.fen);
    const best = bestValue(pos, 3);
    expect(best).toBeGreaterThanOrEqual(MATE_SCORE);
    expect(tolerance(best)).toBe(0);

    const slower = legalMoves(pos).filter((m) => moveValue(pos, m, 3) < best);
    expect(slower.length).toBeGreaterThan(0);
    slower.forEach((m) => expect(isGoodMove(pos, m, 3)).toBe(false));
  });
});

describe('ouvertures et parties', () => {
  it.each(OPENINGS.map((o) => [o.nom, o] as const))('« %s » est entièrement jouable', (_nom, opening) => {
    const expected = opening.san.trim().split(/\s+/).length;
    expect(playSAN(opening.san)).toHaveLength(expected);
  });

  it.each(GAMES.map((g) => [g.titre, g] as const))('« %s » se rejoue jusqu’au bout', (_titre, game) => {
    let pos = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    game.coups.forEach((c) => {
      const mv = findMove(pos, at(c[0]), at(c[1]), c[2]);
      expect(`${c[0]}${c[1]}: ${mv !== undefined}`).toBe(`${c[0]}${c[1]}: true`);
      pos = makeMove(pos, mv!);
    });
    expect(game.coups.length).toBeGreaterThan(20);
  });

  it('se termine par un mat pour les deux parties qui en annoncent un', () => {
    for (const id of ['opera', 'immortelle']) {
      const game = GAMES.find((g) => g.id === id)!;
      let pos = parseFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      game.coups.forEach((c) => {
        pos = makeMove(pos, findMove(pos, at(c[0]), at(c[1]), c[2])!);
      });
      expect(`${id}: ${gameStatus(pos)}`).toBe(`${id}: mate`);
    }
  });
});

describe('bots et trophées', () => {
  it('décrivent des adversaires cohérents et de force croissante', () => {
    expect(new Set(BOTS.map((b) => b.id)).size).toBe(BOTS.length);
    const elos = BOTS.map((b) => b.elo);
    expect(elos).toEqual([...elos].sort((a, b) => a - b));
    BOTS.forEach((b) => {
      expect(b.depth).toBeGreaterThanOrEqual(1);
      expect(b.depth).toBeLessThanOrEqual(3);
      expect(b.gaffe).toBeGreaterThanOrEqual(0);
      expect(b.gaffe).toBeLessThanOrEqual(1);
    });
    // plus le bot est fort, moins il doit se tromper
    const gaffes = BOTS.map((b) => b.gaffe);
    expect(gaffes).toEqual([...gaffes].sort((a, b) => b - a));
  });

  it('référencent des leçons qui existent vraiment', () => {
    expect(new Set(TROPHIES.map((t) => t.id)).size).toBe(TROPHIES.length);
    // le trophée « Pièces en main » dépend de ces six leçons
    ['pion', 'tour', 'fou', 'cavalier', 'dame', 'roi'].forEach((id) =>
      expect(LESSONS.some((l) => l.id === id)).toBe(true),
    );
  });
});
