import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { Action, ActionBar, ListItem, ProgressBar } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { completeExercise } from '../src/chess/progress';
import { EXERCISES, THEMES, exercisesByTheme, type Exercise } from '../src/chess/exercises';
import {
  etatInitial,
  reduire,
  indiceDisponible,
  indiceCourant,
  casesIndice,
  pointsGagnes,
  type EtatExercice,
} from '../src/chess/exerciseState';
import { noterCoup, type Verdict } from '../src/chess/coaching';
import { bestValue, moveValue } from '../src/chess/ai';
import {
  colorOf,
  movesFrom,
  parseFEN,
  squareFromName as at,
  squareName,
  type Move,
  type Position,
} from '../src/chess/engine';

const DEPTH = 3;

/** Couleur de la pastille et du ton de bulle selon le verdict. */
const TON: Record<Verdict, BubbleTone> = {
  brillant: 'ok',
  bon: 'ok',
  imprecision: 'neutral',
  erreur: 'bad',
  gaffe: 'bad',
};

const uciOf = (m: Move): string =>
  squareName(m.from) + squareName(m.to) + (m.promotion?.toLowerCase() ?? '');

export default function TrainScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [etat, setEtat] = useState<EtatExercice>(etatInitial);
  const [position, setPosition] = useState<Position | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const credite = useRef<Set<string>>(new Set());

  const boardSize = Math.min(width - 8, 460);

  const ouvrir = useCallback((ex: Exercise) => {
    setExercise(ex);
    setEtat(etatInitial());
    setPosition(parseFEN(ex.fen));
    setSelected(null);
  }, []);

  const rejouer = useCallback(() => {
    if (!exercise) return;
    setEtat(etatInitial());
    setPosition(parseFEN(exercise.fen));
    setSelected(null);
  }, [exercise]);

  const proposer = useCallback(
    (move: Move) => {
      if (!exercise || !position) return;
      const uci = uciOf(move);
      // le verdict compare le coup au meilleur de la position ; le calcul
      // matériel, lui, vient du plateau (voir `coaching.ts`)
      const feedback = noterCoup({
        pos: position,
        move,
        meilleur: bestValue(position, DEPTH),
        joue: moveValue(position, move, DEPTH),
      });
      const suivant = reduire(exercise, etat, { type: 'proposer', uci, feedback });
      setEtat(suivant);
      setSelected(null);
      if (suivant.resolu && !credite.current.has(exercise.id)) {
        credite.current.add(exercise.id);
        update((p) => completeExercise(p, exercise.id, pointsGagnes(suivant)));
      }
    },
    [exercise, position, etat, update],
  );

  const onPressSquare = useCallback(
    (square: number) => {
      if (!position || !exercise || etat.resolu) return;
      if (selected !== null) {
        const candidat = movesFrom(position, selected).find((m) => m.to === square);
        if (candidat) {
          proposer(candidat);
          return;
        }
      }
      const piece = position.board[square];
      setSelected(colorOf(piece) === position.turn ? square : null);
    },
    [position, exercise, etat.resolu, selected, proposer],
  );

  const arrows = useMemo((): Arrow[] => {
    if (!exercise || !etat.resolu) return [];
    // la flèche n'apparaît qu'une fois la position résolue : avant, elle
    // donnerait la réponse
    const [from, to] = [exercise.attendus[0].slice(0, 2), exercise.attendus[0].slice(2, 4)];
    return [[from, to]];
  }, [exercise, etat.resolu]);

  const badges = useMemo((): Record<number, SquareBadge> => {
    if (!exercise || !position) return {};
    const out: Record<number, SquareBadge> = {};
    casesIndice(exercise, etat).forEach((c) => {
      out[at(c)] = 'good';
    });
    return out;
  }, [exercise, position, etat]);

  // ---- liste des thèmes ----
  if (!exercise || !position) {
    const faits = EXERCISES.filter((e) => progress.exercises[e.id]).length;
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="nina"
          text={
            faits === 0
              ? 'Ici on ne lit pas, on joue. Trompe-toi autant que tu veux : je donne des indices.'
              : `${faits} exercices sur ${EXERCISES.length}. Continue !`
          }
        />
        <View style={[S.pad, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 }]}>
          <ProgressBar value={faits} max={EXERCISES.length} />
          <Text style={S.sectionMeta}>
            {faits}/{EXERCISES.length}
          </Text>
        </View>
        {THEMES.map((theme) => (
          <View key={theme.id}>
            <View style={S.sectionRow}>
              <Text style={S.sectionTitle}>
                {theme.icone} {theme.nom}
              </Text>
              <Text style={S.sectionMeta}>{theme.objectif}</Text>
            </View>
            <View style={[S.pad, { gap: 8 }]}>
              {exercisesByTheme(theme.id).map((ex) => (
                <ListItem
                  key={ex.id}
                  title={ex.consigne}
                  subtitle={`Niveau ${ex.niveau}`}
                  done={Boolean(progress.exercises[ex.id])}
                  onPress={() => ouvrir(ex)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  // ---- exercice en cours ----
  const indice = indiceCourant(exercise, etat);
  const message = etat.resolu
    ? `${etat.feedback?.titre ?? 'Bravo !'} ${exercise.explication}`
    : etat.horsSujet
      ? `Bon coup — mais ce n’est pas la question ici. ${exercise.consigne}`
      : indice
        ? indice.texte
        : etat.feedback
          ? `${etat.feedback.titre} ${etat.feedback.texte}`
          : exercise.consigne;
  const ton: BubbleTone = etat.resolu
    ? 'ok'
    : etat.horsSujet || indice
      ? 'neutral'
      : etat.feedback
        ? TON[etat.feedback.verdict]
        : 'neutral';

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble coach="nina" text={message} tone={ton} />
        <View style={styles.boardWrap}>
          <ChessBoard
            position={position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            selected={selected}
            targets={selected !== null ? movesFrom(position, selected) : []}
            arrows={arrows}
            badges={badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, { paddingTop: 10 }]}>
          <Text style={styles.consigne}>{exercise.consigne}</Text>
          {etat.erreurs > 0 && !etat.resolu ? (
            <Text style={styles.compte}>
              {etat.erreurs} essai{etat.erreurs > 1 ? 's' : ''} · {etat.indicesVus}/3 indice
              {etat.indicesVus > 1 ? 's' : ''}
            </Text>
          ) : null}
          {etat.resolu ? (
            <Text style={[styles.compte, { color: C.green }]}>
              +{pointsGagnes(etat)} points
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <ActionBar>
        <Action
          testID="action-indice"
          label={etat.indicesVus === 0 ? 'Indice' : `Indice ${etat.indicesVus + 1}`}
          onPress={() => setEtat(reduire(exercise, etat, { type: 'indice' }))}
          disabled={!indiceDisponible(etat)}
        />
        <Action
          testID="action-solution"
          label="Solution"
          onPress={() => setEtat(reduire(exercise, etat, { type: 'reveler' }))}
          disabled={etat.resolu}
        />
        <Action testID="action-rejouer" label="Rejouer" onPress={rejouer} />
        <Action testID="action-quitter" label="Quitter" primary onPress={() => setExercise(null)} />
      </ActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  consigne: { color: C.text, fontSize: 15, fontWeight: '700' },
  compte: { color: C.muted, fontSize: 12, marginTop: 4 },
});
