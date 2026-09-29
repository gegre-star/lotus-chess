import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CoachBubble } from '../src/components/CoachBubble';
import { Button, ProgressBar } from '../src/components/UI';
import { TROPHY_LABEL } from '../src/components/trophies';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { LESSONS, PUZZLES, SECTIONS, TROPHIES } from '../src/chess/content';
import {
  BONUS_DU_JOUR,
  CIBLES_DU_JOUR,
  XP_PER_LEVEL,
  levelOf,
  objectifsAffiches,
  serieVivante,
  xpIntoLevel,
} from '../src/chess/progress';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={[S.card, styles.stat]}>
      <Text style={S.statValue}>{value}</Text>
      <Text style={S.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

export default function ChessHome() {
  const router = useRouter();
  const { progress } = useProgress();

  const nextLesson = useMemo(
    () => LESSONS.find((l) => !progress.lessons[l.id]) ?? LESSONS[0],
    [progress.lessons],
  );
  const lessonsDone = Object.keys(progress.lessons).length;
  const puzzlesDone = Object.keys(progress.puzzles).length;
  const trophiesWon = Object.keys(progress.trophies).length;
  const level = levelOf(progress.xp);
  const jour = objectifsAffiches(progress);
  const serie = serieVivante(progress);
  const objectifs: { cle: string; icone: string; libelle: string; fait: number; cible: number }[] = [
    { cle: 'lecons', icone: '🎓', libelle: 'Leçon', fait: jour.lecons, cible: CIBLES_DU_JOUR.lecons },
    { cle: 'problemes', icone: '🧩', libelle: 'Problèmes', fait: jour.problemes, cible: CIBLES_DU_JOUR.problemes },
    { cle: 'parties', icone: '⚔', libelle: 'Partie', fait: jour.parties, cible: CIBLES_DU_JOUR.parties },
  ];

  const greeting =
    trophiesWon === 0
      ? 'Bienvenue ! Commence par une leçon, tu gagneras tes premiers points.'
      : `${progress.xp} points, classement ${progress.elo}. On continue ?`;

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
      <CoachBubble coach="lotus" text={greeting} />

      <View style={[S.pad, { gap: 10 }]}>
        <View style={[S.card, styles.hero]}>
          <Text style={styles.heroTitle}>Leçon suivante</Text>
          <Text style={styles.heroSub}>
            {nextLesson.title} · {SECTIONS[nextLesson.sec].name}
          </Text>
          {/* La route est `/learn` : `/chess/learn` n'a jamais existé, et le
              bouton principal de l'accueil retombait sur l'écran « page
              introuvable », donc sur l'accueil. */}
          <Button label="Continuer" onPress={() => router.push('/learn')} style={{ marginTop: 10 }} />
        </View>
      </View>

      <View style={[S.pad, styles.levelRow]}>
        <View style={styles.levelChip}>
          <Text style={styles.levelText}>{level}</Text>
        </View>
        <ProgressBar value={xpIntoLevel(progress.xp)} max={XP_PER_LEVEL} />
        <View style={styles.levelChip}>
          <Text style={[styles.levelText, { color: C.muted2 }]}>{level + 1}</Text>
        </View>
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Objectifs du jour</Text>
        <Text style={[S.sectionMeta, serie > 0 ? { color: C.gold } : null]} testID="serie-jours">
          {serie > 0 ? `🔥 ${serie} jour${serie > 1 ? 's' : ''} de suite` : 'Commence une série'}
        </Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <View style={[S.card, { gap: 10 }]}>
          {objectifs.map((o) => {
            const atteint = o.fait >= o.cible;
            return (
              <View key={o.cle} style={S.row} testID={`objectif-${o.cle}`}>
                <Text style={{ fontSize: 18 }}>{o.icone}</Text>
                <Text style={[S.itemTitle, { fontSize: 14, width: 84 }]}>{o.libelle}</Text>
                <ProgressBar value={Math.min(o.fait, o.cible)} max={o.cible} />
                <Text style={[S.sectionMeta, { width: 34, textAlign: 'right' }, atteint ? { color: C.green } : null]}>
                  {atteint ? '✓' : `${o.fait}/${o.cible}`}
                </Text>
              </View>
            );
          })}
          <Text style={S.itemSub}>
            {jour.bonus
              ? `Bonus du jour touché : +${BONUS_DU_JOUR} points.`
              : `Les trois objectifs remplis rapportent +${BONUS_DU_JOUR} points.`}
          </Text>
        </View>
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Statistiques</Text>
      </View>
      <View style={[S.pad, styles.grid]}>
        <Stat value={progress.elo} label="Classement" />
        <Stat value={progress.xp} label="Points" />
        <Stat value={`${progress.wins}V ${progress.losses}D`} label="Parties" />
        <Stat value={progress.bestStreak} label="Série max" />
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Progression</Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <View style={[S.card, S.row]}>
          <Text style={{ fontSize: 20 }}>🎓</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.itemTitle}>Leçons</Text>
            <Text style={S.itemSub}>
              {lessonsDone} / {LESSONS.length} terminées
            </Text>
          </View>
        </View>
        <View style={[S.card, S.row]}>
          <Text style={{ fontSize: 20 }}>🧩</Text>
          <View style={{ flex: 1 }}>
            <Text style={S.itemTitle}>Problèmes</Text>
            <Text style={S.itemSub}>
              {puzzlesDone} / {PUZZLES.length} résolus
            </Text>
          </View>
        </View>
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Trophées</Text>
        <Text style={S.sectionMeta}>
          {trophiesWon} / {TROPHIES.length}
        </Text>
      </View>
      <View style={[S.pad, styles.trophyGrid]}>
        {TROPHIES.map((t) => {
          const won = Boolean(progress.trophies[t.id]);
          return (
            <View key={t.id} style={[styles.trophy, won ? styles.trophyWon : null]}>
              <Text style={{ fontSize: 22, opacity: won ? 1 : 0.25 }}>
                {TROPHY_LABEL[t.art] ?? '🏆'}
              </Text>
              <Text
                style={[styles.trophyName, { color: won ? C.gold : C.muted2 }]}
                numberOfLines={2}
              >
                {t.name}
              </Text>
            </View>
          );
        })}
      </View>

      {progress.history.length > 0 ? (
        <>
          <View style={S.sectionRow}>
            <Text style={S.sectionTitle}>Dernières parties</Text>
          </View>
          <View style={[S.pad, { gap: 6 }]}>
            {progress.history
              .slice()
              .reverse()
              .slice(0, 5)
              .map((g, i) => (
                <View key={`${g.bot}-${i}`} style={[S.card, S.row]}>
                  <View
                    style={[
                      styles.result,
                      {
                        backgroundColor:
                          g.result === 'win' ? C.green : g.result === 'loss' ? C.red : C.muted2,
                      },
                    ]}
                  >
                    <Text style={styles.resultText}>
                      {g.result === 'win' ? 'V' : g.result === 'loss' ? 'D' : 'N'}
                    </Text>
                  </View>
                  <Text style={[S.itemTitle, { flex: 1 }]}>{g.bot}</Text>
                  <Text style={S.itemSub}>
                    {g.eloDelta >= 0 ? '+' : ''}
                    {g.eloDelta}
                  </Text>
                </View>
              ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#33452a' },
  heroTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  heroSub: { color: '#cfd6c4', fontSize: 13, marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12 },
  levelChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { color: C.gold, fontSize: 15, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '46%' },
  trophyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  trophy: {
    flexBasis: '22%',
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 4,
  },
  trophyWon: { backgroundColor: '#3d3a2c' },
  trophyName: { fontSize: 9, fontWeight: '800', textAlign: 'center' },
  result: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  resultText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
