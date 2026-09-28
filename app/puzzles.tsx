import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { PromotionDialog } from '../src/components/PromotionDialog';
import { Action, ActionBar, ListItem, ProgressBar } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { PUZZLES, type Puzzle } from '../src/chess/content';
import { failPuzzle, solvePuzzle } from '../src/chess/progress';
import { Cerveau } from '../src/chess/brain/cerveau';
import { objectifAtteint } from '../src/chess/puzzleState';
import { REFLEXION_MIN_MS, TRACE_MS, toucherCase } from '../src/chess/interaction';
import {
  findKing,
  findMove,
  gameStatus,
  makeMove,
  movesFrom,
  parseFEN,
  squareFromName,
  squareName,
  type Move,
  type Piece,
  type PieceType,
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
    // Le thème n'est pas annoncé : « Fourchette » dit déjà où regarder, et la
    // recherche du motif est précisément ce qu'un problème entraîne.
    message: `Difficulté ${puzzle.rating}. Les blancs jouent — trouve le meilleur coup !`,
    tone: 'neutral',
  };
};

/** Coup UCI (`e2e4`, `e7e8q`) → coup de `engine.ts` dans une position. */
function coupDepuisUci(pos: Position, uci: string): Move | null {
  const promo = uci.length > 4 ? (uci[4].toUpperCase() as PieceType) : undefined;
  return findMove(pos, squareFromName(uci.slice(0, 2)), squareFromName(uci.slice(2, 4)), promo) ?? null;
}

export default function PuzzlesScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();

  /**
   * La session vit dans une référence **et** dans l'état : toutes les
   * transitions se calculent hors des fonctions passées à `setState`.
   * L'ancienne version y cachait la mise à jour de la progression et la pose
   * d'un minuteur — des effets de bord qu'un rendu rejoué (mode strict, rendu
   * concurrent) aurait exécutés deux fois : l'adversaire aurait pu répondre
   * deux fois, et le problème compter double.
   */
  const [session, setSessionEtat] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const commit = useCallback((s: Session | null) => {
    sessionRef.current = s;
    setSessionEtat(s);
  }, []);
  const [promo, setPromo] = useState<Move[] | null>(null);
  /** Dernier coup adverse, montré en fantôme le temps de le comprendre. */
  const [trace, setTrace] = useState<{ from: number; to: number; piece: Piece } | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const traceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerveau = useRef<Cerveau | null>(null);
  const moteur = useCallback((): Cerveau => {
    if (!cerveau.current) cerveau.current = new Cerveau();
    return cerveau.current;
  }, []);

  // Sans ce nettoyage, la réponse de l'adversaire arrivait après qu'on a
  // quitté l'écran : React reprochait une mise à jour sur un composant démonté,
  // et le minuteur survivait à la session.
  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
      if (traceTimer.current) clearTimeout(traceTimer.current);
    },
    [],
  );

  const effacerTrace = useCallback(() => {
    if (traceTimer.current) clearTimeout(traceTimer.current);
    setTrace(null);
  }, []);

  const montrerTrace = useCallback((t: { from: number; to: number; piece: Piece }) => {
    setTrace(t);
    if (traceTimer.current) clearTimeout(traceTimer.current);
    traceTimer.current = setTimeout(() => setTrace(null), TRACE_MS);
  }, []);

  const boardSize = Math.min(width - 8, 460);
  const solvedCount = Object.keys(progress.puzzles).length;

  const open = useCallback(
    (puzzle: Puzzle) => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
      effacerTrace();
      setPromo(null);
      commit(newSession(puzzle));
    },
    [commit, effacerTrace],
  );

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
      commit({
        ...s,
        solved: true,
        selected: null,
        badges,
        arrows: [],
        message: `Résolu ! (${s.puzzle.theme}) ${s.puzzle.desc}`,
        tone: 'ok',
      });
    },
    [commit, update],
  );

  /** Juge et joue le coup de l'élève, puis programme la réponse de l'adversaire. */
  const jouerCoup = useCallback(
    (move: Move) => {
      const current = sessionRef.current;
      if (!current || current.solved) return;
      const { position } = current;

      // le jugement se fait en nœuds, pas en temps : même verdict sur tous les appareils
      if (!moteur().jugerCoup(position, move).bon) {
        update((p) => ({ progress: failPuzzle(p), unlocked: [] }));
        commit({
          ...current,
          selected: null,
          failed: true,
          badges: { [move.to]: 'bad' },
          arrows: [],
          message: 'Ce coup laisse filer le gain. Réessaie !',
          tone: 'bad',
        });
        return;
      }

      effacerTrace();
      const played: Session = {
        ...current,
        position: makeMove(position, move),
        selected: null,
        lastMove: move,
        badges: { [move.to]: 'good' },
        arrows: [],
      };
      commit(played);
      if (objectifAtteint(played.puzzle, played.start, played.position)) {
        // on laisse React finir ce rendu avant d'enregistrer la réussite
        replyTimer.current = setTimeout(() => finish(played, move), 0);
        return;
      }

      // l'adversaire répond par la meilleure défense, après le même délai que
      // dans une partie : un coup instantané ne se lit pas
      const id = current.puzzle.id;
      replyTimer.current = setTimeout(() => {
        const live = sessionRef.current;
        if (!live || live.solved || live.puzzle.id !== id) return;
        const a = moteur().analyser(live.position, { profondeur: 6, noeuds: 200_000 });
        const reply = a.meilleur ? coupDepuisUci(live.position, a.meilleur) : null;
        if (!reply) return;
        const piece = live.position.board[reply.from];
        const next: Session = {
          ...live,
          position: makeMove(live.position, reply),
          lastMove: reply,
          badges: {},
          message: 'Bien vu ! Continue la combinaison.',
          tone: 'ok',
        };
        // le fantôme montre d'où vient la pièce : sans lui, la défense
        // adverse apparaît sans qu'on ait vu ce qui a bougé
        if (piece) montrerTrace({ from: reply.from, to: reply.to, piece });
        commit(next);
        if (objectifAtteint(next.puzzle, next.start, next.position)) finish(next, reply);
      }, REFLEXION_MIN_MS);
    },
    [commit, effacerTrace, finish, montrerTrace, moteur, update],
  );

  const onPressSquare = useCallback(
    (square: number) => {
      const current = sessionRef.current;
      if (!current || current.solved) return;
      // même décision que partout ailleurs : roque au toucher de la tour,
      // choix de la promotion, et une raison quand le coup est refusé
      const decision = toucherCase(current.position, current.selected, square);
      if (decision.type === 'selection') {
        commit({ ...current, selected: decision.square, badges: {} });
      } else if (decision.type === 'refus') {
        commit({
          ...current,
          selected: null,
          badges: {},
          arrows: [],
          message: decision.message,
          tone: 'bad',
        });
      } else if (decision.type === 'promotion') {
        setPromo(decision.candidats);
      } else {
        jouerCoup(decision.move);
      }
    },
    [commit, jouerCoup],
  );

  const showHint = useCallback(() => {
    const current = sessionRef.current;
    if (!current || current.solved) return;
    const key = current.puzzle.line[0];
    if (current.hints === 0) {
      commit({ ...current, hints: 1, message: current.puzzle.hint, tone: 'neutral' });
      return;
    }
    commit({
      ...current,
      hints: current.hints + 1,
      arrows: [[key[0], key[1]]],
      message: `Joue la pièce en ${key[0].toUpperCase()} — la flèche te montre où.`,
      tone: 'neutral',
    });
  }, [commit]);

  const showSolution = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    commit({
      ...current,
      arrows: current.puzzle.line.filter((_, i) => i % 2 === 0).map((m) => [m[0], m[1], C.blue]),
      message: current.puzzle.desc,
      tone: 'neutral',
    });
  }, [commit]);

  const nextPuzzle = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    const i = PUZZLES.findIndex((p) => p.id === current.puzzle.id);
    open(PUZZLES[(i + 1) % PUZZLES.length]);
  }, [open]);

  /**
   * Flèches affichées : celles de l'indice ou de la solution, plus le trajet
   * du dernier coup adverse tant que son fantôme est visible.
   */
  const flechesEchiquier = useMemo((): Arrow[] => {
    const base = session?.arrows ?? [];
    if (!trace) return base;
    return [...base, [squareName(trace.from), squareName(trace.to), C.blue] as Arrow];
  }, [session?.arrows, trace]);

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
            arrows={flechesEchiquier}
            ghost={trace ? { square: trace.from, piece: trace.piece } : null}
            badges={session.badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, styles.hud]}>
          <Text style={S.statValue}>{progress.xp}</Text>
          <Text style={[S.statLabel, { color: C.gold }]}>SÉRIE {progress.streak}</Text>
          <Text style={[S.sectionMeta, { marginLeft: 'auto' }]}>
            {session.solved ? `${session.puzzle.theme} · ` : ''}
            {session.puzzle.rating}
          </Text>
        </View>
      </ScrollView>
      <ActionBar>
        {session.solved ? (
          <>
            <Action label="Solution" onPress={showSolution} />
            <Action label="Suivant" primary onPress={nextPuzzle} />
            <Action label="Quitter" onPress={() => commit(null)} />
          </>
        ) : (
          <>
            <Action label="Indice" onPress={showHint} />
            <Action label="Recommencer" primary onPress={() => open(session.puzzle)} />
            <Action label="Quitter" onPress={() => commit(null)} />
          </>
        )}
      </ActionBar>
      <PromotionDialog
        candidats={promo}
        blanc
        onChoisir={(m) => {
          setPromo(null);
          jouerCoup(m);
        }}
        onAnnuler={() => setPromo(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  hud: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
});
