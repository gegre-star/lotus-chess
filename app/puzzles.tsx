import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { Action, ActionBar, ListItem, ProgressBar } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { PUZZLES, type Puzzle } from '../src/chess/content';
import { failPuzzle, solvePuzzle } from '../src/chess/progress';
import { chooseMove, evaluate, isGoodMove } from '../src/chess/ai';
import {
  colorOf,
  findKing,
  gameStatus,
  makeMove,
  movesFrom,
  parseFEN,
  squareName,
  type Move,
  type Position,
} from '../src/chess/engine';

interface Session {
  puzzle: Puzzle;
  start: Position;
  position: Position;
  selected: number | null;
  solved: boolean;
  failed: boolean;
  hints: number;
  startedAt: number;
  lastMove: Move | null;
  badges: Record<number, SquareBadge>;
  arrows: Arrow[];
  message: string;
  tone: BubbleTone;
}

const newSession = (puzzle: Puzzle): Session => {
  const start = parseFEN(puzzle.fen);
  return {
    puzzle,
    start,
    position: start,
    selected: null,
    solved: false,
    failed: false,
    hints: 0,
    startedAt: Date.now(),
    lastMove: null,
    badges: {},
    arrows: [],
    message: `${puzzle.theme} · ${puzzle.rating}. Les blancs jouent — trouve le coup gagnant !`,
    tone: 'neutral',
  };
};

/** L'objectif du problème est-il atteint ? */
function isSolved(session: Session): boolean {
  const { puzzle, position, start } = session;
  if (puzzle.mate) return gameStatus(position) === 'mate';
  return evaluate(position) - evaluate(start) >= puzzle.gain * 100 - 60;
}

export default function PuzzlesScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [session, setSession] = useState<Session | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boardSize = Math.min(width - 8, 460);
  const solvedCount = Object.keys(progress.puzzles).length;

  const open = useCallback((puzzle: Puzzle) => {
    if (replyTimer.current) clearTimeout(replyTimer.current);
    setSession(newSession(puzzle));
  }, []);

  const finish = useCallback(
    (s: Session, last: Move) => {
      const seconds = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
      update((p) =>
        solvePuzzle(p, s.puzzle.id, { seconds, failed: s.failed, hinted: s.hints > 0 }),
      );
      const badges: Record<number, SquareBadge> = { [last.to]: 'good' };
      if (gameStatus(s.position) === 'mate') {
        badges[findKing(s.position, s.position.turn)] = 'bad';
      }
      setSession({
        ...s,
        solved: true,
        selected: null,
        badges,
        arrows: [],
        message: `Résolu ! ${s.puzzle.desc}`,
        tone: 'ok',
      });
    },
    [update],
  );

  const onPressSquare = useCallback(
    (square: number) => {
      setSession((current) => {
        if (!current || current.solved) return current;
        const { position, selected } = current;

        if (selected !== null) {
          const candidates = movesFrom(position, selected).filter((m) => m.to === square);
          if (candidates.length > 0) {
            // par défaut on promeut en dame, le choix le plus fréquent
            const move = candidates.find((m) => m.promotion === 'Q') ?? candidates[0];

            if (!isGoodMove(position, move)) {
              update((p) => ({ progress: failPuzzle(p), unlocked: [] }));
              return {
                ...current,
                selected: null,
                failed: true,
                badges: { [square]: 'bad' },
                arrows: [],
                message: 'Ce coup laisse filer le gain. Réessaie !',
                tone: 'bad',
              };
            }

            const after = makeMove(position, move);
            const played: Session = {
              ...current,
              position: after,
              selected: null,
              lastMove: move,
              badges: { [move.to]: 'good' },
              arrows: [],
            };
            if (isSolved(played)) {
              // on laisse React finir ce rendu avant d'enregistrer la réussite
              replyTimer.current = setTimeout(() => finish(played, move), 0);
              return played;
            }

            // l'adversaire répond avec la meilleure défense trouvée par le moteur
            replyTimer.current = setTimeout(() => {
              setSession((live) => {
                if (!live || live.solved) return live;
                const reply = chooseMove(live.position, { depth: 3, gaffe: 0 });
                if (!reply) return live;
                const next: Session = {
                  ...live,
                  position: makeMove(live.position, reply),
                  lastMove: reply,
                  badges: {},
                  message: 'Bien vu ! Continue la combinaison.',
                  tone: 'ok',
                };
                if (isSolved(next)) {
                  replyTimer.current = setTimeout(() => finish(next, reply), 0);
                }
                return next;
              });
            }, 450);
            return played;
          }
        }

        const piece = position.board[square];
        return {
          ...current,
          selected: colorOf(piece) === position.turn ? square : null,
          badges: {},
        };
      });
    },
    [finish, update],
  );

  const showHint = useCallback(() => {
    setSession((current) => {
      if (!current || current.solved) return current;
      const key = current.puzzle.line[0];
      if (current.hints === 0) {
        return { ...current, hints: 1, message: current.puzzle.hint, tone: 'neutral' };
      }
      return {
        ...current,
        hints: current.hints + 1,
        arrows: [[key[0], key[1]]],
        message: `Joue la pièce en ${key[0].toUpperCase()} — la flèche te montre où.`,
        tone: 'neutral',
      };
    });
  }, []);

  const showSolution = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      return {
        ...current,
        arrows: current.puzzle.line.filter((_, i) => i % 2 === 0).map((m) => [m[0], m[1], C.blue]),
        message: current.puzzle.desc,
        tone: 'neutral',
      };
    });
  }, []);

  const nextPuzzle = useCallback(() => {
    setSession((current) => {
      if (!current) return current;
      const i = PUZZLES.findIndex((p) => p.id === current.puzzle.id);
      return newSession(PUZZLES[(i + 1) % PUZZLES.length]);
    });
  }, []);

  // ---- liste des problèmes ----
  if (!session) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="nina"
          text={
            solvedCount === 0
              ? "Un problème, c'est une position où un seul coup gagne. À toi de le trouver !"
              : `${solvedCount} problèmes résolus. Prêt pour le suivant ?`
          }
        />
        <View style={[S.pad, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 }]}>
          <ProgressBar value={solvedCount} max={PUZZLES.length} />
          <Text style={S.sectionMeta}>
            {solvedCount}/{PUZZLES.length}
          </Text>
        </View>
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Parcours</Text>
          <Text style={S.sectionMeta}>du plus simple au plus dur</Text>
        </View>
        <View style={[S.pad, { gap: 8 }]}>
          {PUZZLES.map((p, i) => (
            <ListItem
              key={p.id}
              title={`${i + 1}. ${p.theme}`}
              subtitle={`Difficulté ${p.rating}`}
              done={Boolean(progress.puzzles[p.id])}
              onPress={() => open(p)}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  // ---- problème en cours ----
  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble coach="nina" text={session.message} tone={session.tone} />
        <View style={styles.boardWrap}>
          <ChessBoard
            position={session.position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            selected={session.selected}
            targets={session.selected !== null ? movesFrom(session.position, session.selected) : []}
            lastMove={session.lastMove}
            arrows={session.arrows}
            badges={session.badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, styles.hud]}>
          <Text style={S.statValue}>{progress.xp}</Text>
          <Text style={[S.statLabel, { color: C.gold }]}>SÉRIE {progress.streak}</Text>
          <Text style={[S.sectionMeta, { marginLeft: 'auto' }]}>
            {session.puzzle.theme} · {session.puzzle.rating}
          </Text>
        </View>
      </ScrollView>
      <ActionBar>
        {session.solved ? (
          <>
            <Action label="Solution" onPress={showSolution} />
            <Action label="Suivant" primary onPress={nextPuzzle} />
            <Action label="Quitter" onPress={() => setSession(null)} />
          </>
        ) : (
          <>
            <Action label="Indice" onPress={showHint} />
            <Action label="Recommencer" primary onPress={() => open(session.puzzle)} />
            <Action label="Quitter" onPress={() => setSession(null)} />
          </>
        )}
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
});
