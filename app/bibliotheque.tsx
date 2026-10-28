import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { PromotionDialog } from '../src/components/PromotionDialog';
import { Action, ActionBar, ListItem } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { terminerBibliotheque } from '../src/chess/progress';
import { PROBLEMES_LICHESS } from '../src/chess/problemes-lichess';
import {
  THEMES_FR,
  caseIndice,
  choisirProbleme,
  coupsRestants,
  demarrer,
  jouer,
  libelleTheme,
  themeDe,
  type EtatLichess,
} from '../src/chess/lichess';
import { REFLEXION_MIN_MS, toucherCase } from '../src/chess/interaction';
import { makeMove, movesFrom, type Move, type Position } from '../src/chess/engine';

interface Session {
  /** État « de vérité » : la ligne de solution, côté correction. */
  etat: EtatLichess;
  /** Position affichée (en retard d'un coup pendant que l'adversaire « réfléchit »). */
  position: Position;
  selected: number | null;
  lastMove: Move | null;
  badges: Record<number, SquareBadge>;
  arrows: Arrow[];
  message: string;
  tone: BubbleTone;
  hints: number;
  /** Le résultat est déjà enregistré : il ne l'est qu'une fois par problème. */
  compte: boolean;
  /** Au moins une erreur : le problème compte comme raté, même s'il est ensuite résolu. */
  echoue: boolean;
  termine: boolean;
  /** L'adversaire est en train de répondre : les touches sont ignorées. */
  occupe: boolean;
  debut: number;
}

const nomCamp = (c: 'w' | 'b') => (c === 'w' ? 'blancs' : 'noirs');

function nouvelleSession(etat: EtatLichess): Session {
  return {
    etat,
    position: etat.position,
    selected: null,
    lastMove: etat.coupAdverse,
    badges: {},
    arrows: [],
    message: `Les ${nomCamp(etat.joueur)} jouent — trouve le meilleur coup ! (niveau ${etat.probleme.rating})`,
    tone: 'neutral',
    hints: 0,
    compte: false,
    echoue: false,
    termine: false,
    occupe: false,
    debut: Date.now(),
  };
}

export default function BibliothequeScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const b = progress.bibliotheque;

  const sessionRef = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const commit = useCallback((s: Session | null) => {
    sessionRef.current = s;
    setSession(s);
  }, []);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [glisse, setGlisse] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  const boardSize = Math.min(width - 8, 460);

  /** Thèmes proposés en filtre, avec le nombre de problèmes de chacun. */
  const themes = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of PROBLEMES_LICHESS) n.set(themeDe(p), (n.get(themeDe(p)) ?? 0) + 1);
    return [...n.entries()].filter(([, c]) => c >= 8).sort((a, c) => c[1] - a[1]);
  }, []);

  /** Enregistre le résultat du problème, une seule fois. */
  const enregistrer = useCallback(
    (s: Session, reussi: boolean): Session => {
      if (s.compte) return s;
      const secondes = Math.max(1, Math.round((Date.now() - s.debut) / 1000));
      update((p) =>
        terminerBibliotheque(p, s.etat.probleme.id, s.etat.probleme.rating, {
          reussi,
          indice: s.hints > 0,
          secondes,
        }),
      );
      return { ...s, compte: true };
    },
    [update],
  );

  const ouvrir = useCallback(
    (tirage?: string | null) => {
      if (minuteur.current) clearTimeout(minuteur.current);
      setPromo(null);
      const filtre = tirage === undefined ? theme : tirage;
      const p = choisirProbleme(PROBLEMES_LICHESS, b.note, b.vus, Math.random, filtre);
      commit(nouvelleSession(demarrer(p)));
    },
    [b.note, b.vus, commit, theme],
  );

  const conclure = useCallback(
    (s: Session, position: Position, lastMove: Move): Session => {
      const reussi = !s.echoue;
      const fin = enregistrer(s, reussi);
      return {
        ...fin,
        position,
        lastMove,
        selected: null,
        arrows: [],
        badges: { [lastMove.to]: reussi ? 'good' : 'bad' },
        termine: true,
        occupe: false,
        message: `Résolu ! ${libelleTheme(s.etat.probleme)}.${s.echoue ? ' (Compté comme raté : une erreur avait été faite.)' : ''}`,
        tone: 'ok',
      };
    },
    [enregistrer],
  );

  const jouerCoup = useCallback(
    (move: Move) => {
      const s = sessionRef.current;
      if (!s || s.termine || s.occupe) return;
      const v = jouer(s.etat, move);

      if (v.type === 'faux') {
        commit({
          ...enregistrer(s, false),
          echoue: true,
          selected: null,
          arrows: [],
          badges: { [move.to]: 'bad' },
          message: 'Ce n’est pas le bon coup. Réessaie !',
          tone: 'bad',
        });
        return;
      }

      const apresJoueur = makeMove(s.position, move);
      if (!v.reponse) {
        commit(conclure({ ...s, etat: v.etat }, apresJoueur, move));
        return;
      }
      const reponse = v.reponse;
      const id = s.etat.probleme.id;
      commit({
        ...s,
        position: apresJoueur,
        lastMove: move,
        selected: null,
        arrows: [],
        badges: { [move.to]: 'good' },
        occupe: true,
      });
      // même délai que partout ailleurs : un coup adverse instantané ne se lit pas
      minuteur.current = setTimeout(() => {
        const live = sessionRef.current;
        if (!live || live.etat.probleme.id !== id) return;
        if (v.etat.resolu) {
          commit(conclure({ ...live, etat: v.etat }, v.etat.position, reponse));
          return;
        }
        commit({
          ...live,
          etat: v.etat,
          position: v.etat.position,
          lastMove: reponse,
          badges: {},
          occupe: false,
          message: 'Bien vu ! Continue la combinaison.',
          tone: 'ok',
        });
      }, REFLEXION_MIN_MS);
    },
    [commit, conclure, enregistrer],
  );

  const onPressSquare = useCallback(
    (square: number) => {
      const s = sessionRef.current;
      if (!s || s.termine || s.occupe) return;
      const decision = toucherCase(s.position, s.selected, square);
      if (decision.type === 'selection') {
        commit({ ...s, selected: decision.square, badges: {} });
      } else if (decision.type === 'refus') {
        commit({ ...s, selected: null, badges: {}, arrows: [], message: decision.message, tone: 'bad' });
      } else if (decision.type === 'promotion') {
        setPromo(decision.candidats);
      } else {
        jouerCoup(decision.move);
      }
    },
    [commit, jouerCoup],
  );

  const indice = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.termine || s.occupe) return;
    const depart = caseIndice(s.etat);
    const coup = s.etat.probleme.coups[s.etat.etape];
    if (!depart || !coup) return;
    if (s.hints === 0) {
      commit({
        ...s,
        hints: 1,
        message: `Regarde du côté de la pièce en ${depart.toUpperCase()}. (Un indice réduit le gain de niveau.)`,
        tone: 'neutral',
      });
      return;
    }
    commit({
      ...s,
      hints: s.hints + 1,
      arrows: [[coup.slice(0, 2), coup.slice(2, 4)]],
      message: 'La flèche montre le coup.',
      tone: 'neutral',
    });
  }, [commit]);

  const solution = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.occupe) return;
    const fin = s.termine ? s : { ...enregistrer(s, false), echoue: true };
    commit({
      ...fin,
      termine: true,
      selected: null,
      arrows: coupsRestants(s.etat).map(([a, c]) => [a, c, C.blue] as Arrow),
      message: s.termine
        ? `${libelleTheme(s.etat.probleme)}.`
        : 'Voici la solution. Ce problème compte comme raté.',
      tone: 'neutral',
    });
  }, [commit, enregistrer]);

  const suivant = useCallback(() => ouvrir(), [ouvrir]);

  // ------------------------------------------------------------ écran d'accueil
  if (!session) {
    const restants = PROBLEMES_LICHESS.filter((p) => !b.vus[p.id]).length;
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="nina"
          text={
            b.joues === 0
              ? 'Ici, chaque problème a un niveau, et toi aussi ! Réussis-en pour monter, rate-en pour descendre.'
              : `Ton niveau : ${b.note}. ${b.reussis} réussis sur ${b.joues}. On continue ?`
          }
        />
        <View style={[S.pad, styles.stats]} testID="bibliotheque-stats">
          <View style={styles.stat}>
            <Text style={S.statValue} testID="bibliotheque-note">{b.note}</Text>
            <Text style={S.statLabel}>NIVEAU</Text>
          </View>
          <View style={styles.stat}>
            <Text style={S.statValue}>{b.serie}</Text>
            <Text style={S.statLabel}>SÉRIE</Text>
          </View>
          <View style={styles.stat}>
            <Text style={S.statValue}>{b.meilleure}</Text>
            <Text style={S.statLabel}>RECORD</Text>
          </View>
        </View>
        <View style={[S.pad, { paddingTop: 12 }]}>
          <ListItem
            title={b.joues === 0 ? '▶ Commencer' : '▶ Problème suivant'}
            subtitle={`${restants} problèmes encore jamais vus sur ${PROBLEMES_LICHESS.length}`}
            onPress={() => ouvrir()}
            testID="bibliotheque-commencer"
          />
        </View>
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Thème</Text>
          <Text style={S.sectionMeta}>{theme ? THEMES_FR[theme] : 'tous mélangés'}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[[null, PROBLEMES_LICHESS.length] as [string | null, number], ...themes].map(([t, n]) => {
            const actif = theme === t;
            return (
              <Pressable
                key={t ?? 'tous'}
                testID={`theme-${t ?? 'tous'}`}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
                onPress={() => setTheme(t)}
                style={[styles.chip, actif ? styles.chipActif : null]}
              >
                <Text style={[styles.chipTexte, actif ? styles.chipTexteActif : null]}>
                  {t ? THEMES_FR[t] : 'Tous'} · {n}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </ScrollView>
    );
  }

  // ------------------------------------------------------------------ problème
  const { etat } = session;
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
            flipped={etat.joueur === 'b'}
            selected={session.selected}
            targets={session.selected !== null ? movesFrom(session.position, session.selected) : []}
            lastMove={session.lastMove}
            arrows={session.arrows}
            badges={session.badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, styles.hud]}>
          <Text style={S.statValue} testID="bibliotheque-note-en-jeu">{b.note}</Text>
          <Text style={[S.statLabel, { color: C.gold }]}>SÉRIE {b.serie}</Text>
          <Text style={[S.sectionMeta, { marginLeft: 'auto' }]}>
            {session.termine ? `${libelleTheme(etat.probleme)} · ` : ''}
            {etat.probleme.rating}
          </Text>
        </View>
      </ScrollView>
      <ActionBar>
        {session.termine ? (
          <>
            <Action label="Solution" onPress={solution} testID="bibliotheque-solution" />
            <Action label="Suivant" primary onPress={suivant} testID="bibliotheque-suivant" />
            <Action label="Quitter" onPress={() => commit(null)} testID="bibliotheque-quitter" />
          </>
        ) : (
          <>
            <Action label="Indice" onPress={indice} testID="bibliotheque-indice" />
            <Action label="Solution" onPress={solution} testID="bibliotheque-solution" />
            <Action label="Quitter" onPress={() => commit(null)} testID="bibliotheque-quitter" />
          </>
        )}
      </ActionBar>
      <PromotionDialog
        candidats={promo}
        blanc={etat.joueur === 'w'}
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
  stats: { flexDirection: 'row', gap: 12, paddingTop: 6 },
  stat: { flex: 1, alignItems: 'center' },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  chipActif: { backgroundColor: C.green, borderColor: C.green },
  chipTexte: { color: C.text, fontSize: 13, fontWeight: '700' },
  chipTexteActif: { color: '#000' },
});
