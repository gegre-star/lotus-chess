import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { PromotionDialog } from '../src/components/PromotionDialog';
import { Action, ActionBar, ListItem, ProgressBar } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { PUZZLES, type Puzzle } from '../src/chess/content';
import { failPuzzle, finishSprint, solvePuzzle } from '../src/chess/progress';
import {
  DUREE_SPRINT_MS,
  PENALITE_MS,
  demarrerSprint,
  problemeCourant,
  rater,
  reussir,
  tempsRestant,
  type EtatSprint,
} from '../src/chess/sprint';
import { formater } from '../src/chess/pendule';
import { Button, Dialog } from '../src/components/UI';
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
  const [sprint, setSprint] = useState<EtatSprint | null>(null);
  const sprintRef = useRef<EtatSprint | null>(null);
  const [sprintFin, setSprintFin] = useState<number | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [sprintSelected, setSprintSelected] = useState<number | null>(null);
  const [sprintMessage, setSprintMessage] = useState('');
  const [sprintBad, setSprintBad] = useState<number | null>(null);
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

  // sur mobile natif, la page ne doit pas défiler pendant qu'on glisse une pièce
  const [glisse, setGlisse] = useState(false);
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

  // ------------------------------------------------------------------ sprint

  const commitSprint = useCallback((e: EtatSprint | null) => {
    sprintRef.current = e;
    setSprint(e);
  }, []);

  const lancerSprint = useCallback(() => {
    commit(null);
    setSprintFin(null);
    setSprintSelected(null);
    setSprintBad(null);
    setSprintMessage('Trouve le coup gagnant, vite !');
    commitSprint(demarrerSprint(PUZZLES, Date.now()));
  }, [commit, commitSprint]);

  const terminerSprint = useCallback(() => {
    const e = sprintRef.current;
    if (!e) return;
    update((p) => finishSprint(p, e.score));
    setSprintFin(e.score);
    commitSprint(null);
  }, [commitSprint, update]);

  // l'horloge du sprint : un horodatage, pas un compteur — voir `pendule.ts`
  const sprintActif = sprint !== null;
  useEffect(() => {
    if (!sprintActif) return undefined;
    const tic = setInterval(() => {
      const now = Date.now();
      setMaintenant(now);
      const e = sprintRef.current;
      if (e && tempsRestant(e, now) <= 0) terminerSprint();
    }, 200);
    return () => clearInterval(tic);
  }, [sprintActif, terminerSprint]);

  const jouerSprint = useCallback(
    (move: Move) => {
      const e = sprintRef.current;
      if (!e) return;
      const pz = problemeCourant(e);
      const pos = parseFEN(pz.fen);
      setSprintSelected(null);
      if (moteur().jugerCoup(pos, move, { profondeur: 5, noeuds: 120_000 }).bon) {
        setSprintBad(null);
        setSprintMessage('Juste !');
        commitSprint(reussir(e));
      } else {
        setSprintBad(move.to);
        setSprintMessage(`Raté : −${PENALITE_MS / 1000} s`);
        commitSprint(rater(e));
        if (tempsRestant(rater(e), Date.now()) <= 0) terminerSprint();
      }
    },
    [commitSprint, moteur, terminerSprint],
  );

  const onPressSprint = useCallback(
    (square: number) => {
      const e = sprintRef.current;
      if (!e) return;
      const pos = parseFEN(problemeCourant(e).fen);
      const decision = toucherCase(pos, sprintSelected, square, 'Q');
      if (decision.type === 'coup') jouerSprint(decision.move);
      else if (decision.type === 'refus') setSprintMessage(decision.message);
      else if (decision.type === 'selection') setSprintSelected(decision.square);
    },
    [jouerSprint, sprintSelected],
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

  // ---- sprint en cours ----
  if (sprint) {
    const pz = problemeCourant(sprint);
    const pos = parseFEN(pz.fen);
    const restant = tempsRestant(sprint, maintenant);
    return (
      <View style={S.screen}>
        <ScrollView scrollEnabled={!glisse} contentContainerStyle={{ paddingBottom: 8 }}>
          <CoachBubble coach="nina" text={sprintMessage} tone={sprintBad !== null ? 'bad' : 'neutral'} />
          <View style={[S.pad, styles.hud, { justifyContent: 'space-between', paddingBottom: 6 }]}>
            <Text testID="sprint-score" style={S.statValue}>{sprint.score}</Text>
            <Text
              testID="sprint-temps"
              style={[S.statValue, restant < 20_000 ? { color: C.red } : null]}
            >
              {formater(restant)}
            </Text>
          </View>
          <View style={styles.boardWrap}>
            <ChessBoard
              onGlisser={setGlisse}
              position={pos}
              size={boardSize}
              theme={progress.settings.board}
              showCoords={progress.settings.coords}
              selected={sprintSelected}
              targets={sprintSelected !== null ? movesFrom(pos, sprintSelected) : []}
              badges={sprintBad !== null ? { [sprintBad]: 'bad' } : {}}
              onPressSquare={onPressSprint}
            />
          </View>
        </ScrollView>
        <ActionBar>
          <Action label="Passer" testID="sprint-passer" onPress={() => commitSprint({ ...sprint, courant: sprint.courant + 1 })} />
          <Action label="Terminer" testID="sprint-terminer" primary onPress={terminerSprint} />
        </ActionBar>
      </View>
    );
  }

  // ---- liste des problèmes ----
  if (!session) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <Dialog
          visible={sprintFin !== null}
          title="Sprint terminé !"
          message={
            sprintFin === null
              ? undefined
              : `${sprintFin} problème${sprintFin > 1 ? 's' : ''} résolu${sprintFin > 1 ? 's' : ''} en ${DUREE_SPRINT_MS / 60000} minutes. +${sprintFin * 8} points.${
                  sprintFin > progress.sprintBest ? ' Nouveau record !' : ''
                }`
          }
          onClose={() => setSprintFin(null)}
        >
          <View style={{ gap: 8 }}>
            <Button label="Rejouer" onPress={() => { setSprintFin(null); lancerSprint(); }} />
            <Button label="Fermer" variant="neutral" onPress={() => setSprintFin(null)} />
          </View>
        </Dialog>
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
        <View style={[S.pad, { paddingTop: 12 }]}>
          <ListItem
            title="⚡ Sprint · 3 minutes"
            subtitle={`Un maximum de problèmes en un coup. Ton record : ${progress.sprintBest}`}
            onPress={lancerSprint}
            testID="lancer-sprint"
          />
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
      <ScrollView scrollEnabled={!glisse} contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble coach="nina" text={session.message} tone={session.tone} />
        <View style={styles.boardWrap}>
          <ChessBoard
            onGlisser={setGlisse}
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
