import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { Action, ActionBar, ListItem, ProgressBar } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { LESSONS, SECTIONS, type Lesson } from '../src/chess/content';
import { addXP, completeLesson } from '../src/chess/progress';
import {
  colorOf,
  findMove,
  makeMove,
  movesFrom,
  parseFEN,
  squareFromName as at,
  type Move,
  type Position,
} from '../src/chess/engine';

interface StepState {
  position: Position;
  selected: number | null;
  done: boolean;
  lastMove: Move | null;
  badge: Record<number, SquareBadge>;
  message: string;
  tone: BubbleTone;
}

const initialStep = (lesson: Lesson, index: number): StepState => ({
  position: parseFEN(lesson.steps[index].fen),
  selected: null,
  done: false,
  lastMove: null,
  badge: {},
  message: lesson.steps[index].say,
  tone: 'neutral',
});

export default function LearnScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<StepState | null>(null);

  const boardSize = Math.min(width - 8, 460);

  const openLesson = useCallback((l: Lesson) => {
    setLesson(l);
    setStepIndex(0);
    setState(initialStep(l, 0));
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (!lesson || index < 0 || index >= lesson.steps.length) return;
      setStepIndex(index);
      setState(initialStep(lesson, index));
    },
    [lesson],
  );

  const finish = useCallback(() => {
    if (!lesson) return;
    update((p) => completeLesson(p, lesson.id));
    setLesson(null);
    setState(null);
  }, [lesson, update]);

  const step = lesson ? lesson.steps[stepIndex] : null;

  /** Flèches de l'étape : explicites, ou déduites des coups légaux d'une pièce. */
  const arrows = useMemo((): Arrow[] => {
    if (!step || !state || state.done) return [];
    if (step.arrowsFrom) {
      const from = at(step.arrowsFrom);
      const seen = new Set<number>();
      return movesFrom(state.position, from)
        .filter((m) => (seen.has(m.to) ? false : seen.add(m.to)))
        .map((m) => [step.arrowsFrom!, `abcdefgh`[m.to % 8] + (Math.floor(m.to / 8) + 1)] as Arrow);
    }
    return (step.arrows ?? []) as Arrow[];
  }, [step, state]);

  const onPressSquare = useCallback(
    (square: number) => {
      if (!lesson || !step || !state) return;
      const { position, selected } = state;

      // pas de tâche à accomplir : on laisse simplement explorer les coups
      if (!step.task || state.done) {
        const piece = position.board[square];
        setState({
          ...state,
          selected: selected === square ? null : colorOf(piece) === position.turn ? square : null,
          badge: {},
        });
        return;
      }

      if (selected !== null) {
        const candidate = movesFrom(position, selected).find(
          (m) => m.to === square && (!step.task!.promotion || m.promotion === step.task!.promotion),
        );
        if (candidate) {
          const expected = findMove(
            position,
            at(step.task.from),
            at(step.task.to),
            step.task.promotion,
          );
          const correct =
            expected && candidate.from === expected.from && candidate.to === expected.to;
          if (correct) {
            update((p) => addXP(p, 10));
            setState({
              ...state,
              position: makeMove(position, candidate),
              selected: null,
              done: true,
              lastMove: candidate,
              badge: { [candidate.to]: 'good' },
              message: "Exactement ! C'est ça.",
              tone: 'ok',
            });
          } else {
            setState({
              ...state,
              selected: null,
              badge: { [square]: 'bad' },
              message: 'Pas ce coup-là. Suis la flèche orange !',
              tone: 'bad',
            });
          }
          return;
        }
      }

      const piece = position.board[square];
      setState({
        ...state,
        selected: colorOf(piece) === position.turn ? square : null,
        badge: {},
      });
    },
    [lesson, step, state, update],
  );

  // ---- liste des leçons ----
  if (!lesson || !state || !step) {
    const done = Object.keys(progress.lessons).length;
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="lotus"
          text={
            done === 0
              ? 'On commence par les règles. Je te montre chaque déplacement avec des flèches, puis tu joues.'
              : `${done} leçons sur ${LESSONS.length}. Continue, tu progresses vite !`
          }
        />
        <View style={[S.pad, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 }]}>
          <ProgressBar value={done} max={LESSONS.length} />
          <Text style={S.sectionMeta}>
            {done}/{LESSONS.length}
          </Text>
        </View>
        {SECTIONS.map((section, si) => (
          <View key={section.name}>
            <View style={S.sectionRow}>
              <Text style={S.sectionTitle}>{section.name}</Text>
              <Text style={S.sectionMeta}>{section.desc}</Text>
            </View>
            <View style={[S.pad, { gap: 8 }]}>
              {LESSONS.filter((l) => l.sec === si).map((l) => (
                <ListItem
                  key={l.id}
                  title={l.title}
                  subtitle={l.sub}
                  done={Boolean(progress.lessons[l.id])}
                  onPress={() => openLesson(l)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ---- leçon en cours ----
  const isLast = stepIndex === lesson.steps.length - 1;
  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble coach={lesson.coach} text={state.message} tone={state.tone} />
        <View style={styles.boardWrap}>
          <ChessBoard
            position={state.position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            selected={state.selected}
            targets={state.selected !== null ? movesFrom(state.position, state.selected) : []}
            lastMove={state.lastMove}
            arrows={arrows}
            badges={state.badge}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 }]}>
          <ProgressBar value={stepIndex + (state.done ? 1 : 0)} max={lesson.steps.length} />
          <Text style={S.sectionMeta}>
            {stepIndex + 1}/{lesson.steps.length}
          </Text>
        </View>
      </ScrollView>
      <ActionBar>
        <Action label="Précédent" onPress={() => goToStep(stepIndex - 1)} disabled={stepIndex === 0} />
        <Action
          label={isLast ? 'Terminer' : 'Suivant'}
          primary
          disabled={Boolean(step.task) && !state.done}
          onPress={() => (isLast ? finish() : goToStep(stepIndex + 1))}
        />
        <Action label="Quitter" onPress={() => setLesson(null)} />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
});
