import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { PromotionDialog } from '../src/components/PromotionDialog';
import { Action, ActionBar, Button, Dialog, ListItem } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { POINTS_FINALE, completerFinale } from '../src/chess/progress';
import { Cerveau } from '../src/chess/brain/cerveau';
import { niveauPourElo } from '../src/chess/brain/niveaux';
import { FINALES, evaluerFinale, type Finale, type IssueFinale } from '../src/chess/finales';
import { REFLEXION_MIN_MS, TRACE_MS, toucherCase } from '../src/chess/interaction';
import { auBot, jouer, nouvellePartie, type Partie } from '../src/chess/partie';
import { jouerSon } from '../src/son';
import type { Bot } from '../src/chess/content';
import {
  findMove,
  inCheck,
  movesFrom,
  parseFEN,
  squareFromName,
  squareName,
  toFEN,
  type Move,
  type Piece,
  type PieceType,
} from '../src/chess/engine';

/** L'adversaire de la pratique : il défend, ou attaque, au mieux. */
const ADVERSAIRE: Bot = {
  id: 'finale',
  nom: 'L’ordinateur',
  elo: 2300,
  depth: 0,
  gaffe: 0,
  say: '',
};

const NIVEAU_ETOILES = ['★', '★★', '★★★'];

const attendre = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default function FinalesScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [glisse, setGlisse] = useState(false);
  const boardSize = Math.min(width - 8, 460);

  const [finale, setFinale] = useState<Finale | null>(null);
  const [partie, setPartieEtat] = useState<Partie | null>(null);
  const partieRef = useRef<Partie | null>(null);
  const commit = useCallback((p: Partie | null) => {
    partieRef.current = p;
    setPartieEtat(p);
  }, []);

  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [ton, setTon] = useState<BubbleTone>('neutral');
  const [promo, setPromo] = useState<Move[] | null>(null);
  const [indice, setIndice] = useState<{ de: number; vers: number } | null>(null);
  const [issue, setIssue] = useState<IssueFinale>(null);
  /** Points touchés à la réussite : zéro si la finale avait déjà été réussie. */
  const [gain, setGain] = useState(0);
  const [trace, setTrace] = useState<{ from: number; to: number; piece: Piece } | null>(null);
  const traceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerveau = useRef<Cerveau | null>(null);
  const moteur = useCallback((): Cerveau => {
    if (!cerveau.current) cerveau.current = new Cerveau();
    return cerveau.current;
  }, []);

  useEffect(
    () => () => {
      if (traceTimer.current) clearTimeout(traceTimer.current);
    },
    [],
  );

  const demarrer = useCallback(
    (f: Finale) => {
      moteur().nouvellePartie();
      setFinale(f);
      commit(nouvellePartie(ADVERSAIRE, f.camp, null, parseFEN(f.fen)));
      setSelected(null);
      setPromo(null);
      setIndice(null);
      setIssue(null);
      setTrace(null);
      setTon('neutral');
      setMessage(f.consigne);
    },
    [commit, moteur],
  );

  /** Applique un coup et regarde si la finale est décidée. */
  const appliquer = useCallback(
    (coup: Move, parBot: boolean) => {
      const p = partieRef.current;
      if (!p || !finale || p.fin) return;
      const piece = p.position.board[coup.from];
      const suivante = jouer(p, coup);
      commit(suivante);
      setSelected(null);
      setIndice(null);
      setPromo(null);
      if (parBot && piece) {
        setTrace({ from: coup.from, to: coup.to, piece });
        if (traceTimer.current) clearTimeout(traceTimer.current);
        traceTimer.current = setTimeout(() => setTrace(null), TRACE_MS);
      } else {
        setTrace(null);
      }
      const resultat = evaluerFinale(finale, suivante);
      if (resultat) {
        setIssue(resultat);
        setTon(resultat === 'reussi' ? 'ok' : 'bad');
        setMessage(
          resultat === 'reussi'
            ? 'Bravo, finale réussie !'
            : suivante.fin?.statut === 'stalemate'
              ? 'Pat : la partie est nulle. Il fallait laisser une case au roi adverse.'
              : 'Raté cette fois. Relis le principe, puis recommence.',
        );
        jouerSon('fin', progress.settings);
        if (resultat === 'reussi') {
          setGain(progress.finales[finale.id] ? 0 : POINTS_FINALE);
          update((pr) => completerFinale(pr, finale.id));
        }
      } else {
        setTon('neutral');
        setMessage(inCheck(suivante.position, suivante.position.turn) ? 'Échec !' : '');
        jouerSon(coup.captured ? 'prise' : 'coup', progress.settings);
      }
    },
    [commit, finale, progress.finales, progress.settings, update],
  );

  /** L'ordinateur répond après le même délai que dans une partie. */
  useEffect(() => {
    if (!partie || !finale || issue || !auBot(partie)) return undefined;
    const id = partie.id;
    const fen = toFEN(partie.position);
    const depart = Date.now();
    let vivant = true;
    const minuteur = setTimeout(async () => {
      const p = partieRef.current;
      if (!p || p.id !== id) return;
      const a = moteur().analyser(p.position, { profondeur: niveauPourElo(2300).profondeur, tempsMs: 800 });
      if (!a.meilleur) return;
      const promoLettre = a.meilleur.length > 4 ? (a.meilleur[4].toUpperCase() as PieceType) : undefined;
      const coup = findMove(
        p.position,
        squareFromName(a.meilleur.slice(0, 2)),
        squareFromName(a.meilleur.slice(2, 4)),
        promoLettre,
      );
      if (!coup) return;
      const reste = REFLEXION_MIN_MS - (Date.now() - depart);
      if (reste > 0) await attendre(reste);
      const courante = partieRef.current;
      if (!vivant || !courante || courante.id !== id || courante.fin || toFEN(courante.position) !== fen) return;
      appliquer(coup, true);
    }, 120);
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
    // la partie est relue dans la référence
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partie?.id, partie?.position, partie?.fin, issue]);

  const onPressSquare = useCallback(
    (square: number) => {
      const p = partieRef.current;
      if (!p || p.fin || issue || p.position.turn !== p.side) return;
      const d = toucherCase(p.position, selected, square);
      if (d.type === 'coup') appliquer(d.move, false);
      else if (d.type === 'promotion') setPromo(d.candidats);
      else if (d.type === 'refus') {
        setSelected(null);
        setTon('bad');
        setMessage(d.message);
        jouerSon('erreur', progress.settings);
      } else setSelected(d.square);
    },
    [appliquer, issue, progress.settings, selected],
  );

  /** L'indice est libre ici : la pratique n'est pas classée. */
  const demanderIndice = useCallback(() => {
    const p = partieRef.current;
    if (!p || p.fin || issue || p.position.turn !== p.side) return;
    const a = moteur().analyser(p.position, { profondeur: 10, tempsMs: 600 });
    if (!a.meilleur) return;
    const f = (n: string) => n.charCodeAt(0) - 97 + (Number(n[1]) - 1) * 8;
    setIndice({ de: f(a.meilleur.slice(0, 2)), vers: f(a.meilleur.slice(2, 4)) });
    setTon('ok');
    setMessage(`Indice : joue ${a.meilleur.slice(0, 2)} → ${a.meilleur.slice(2, 4)}.`);
  }, [issue, moteur]);

  const fleches = useMemo((): Arrow[] => {
    const out: Arrow[] = [];
    if (trace) out.push([squareName(trace.from), squareName(trace.to), C.blue]);
    if (indice) out.push([squareName(indice.de), squareName(indice.vers), C.green]);
    return out;
  }, [trace, indice]);

  const badges = useMemo((): Record<number, SquareBadge> => (indice ? { [indice.de]: 'good' } : {}), [indice]);

  // ---- liste des finales ----
  if (!finale || !partie) {
    const faites = FINALES.filter((f) => progress.finales[f.id]).length;
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="lotus"
          text={
            faites === 0
              ? 'Ici on joue les finales jusqu’au bout contre l’ordinateur, qui se défend au mieux. Prends ton temps.'
              : `${faites} finale${faites > 1 ? 's' : ''} réussie${faites > 1 ? 's' : ''} sur ${FINALES.length}. Continue !`
          }
        />
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Pratique des finales</Text>
          <Text style={S.sectionMeta}>
            {faites}/{FINALES.length}
          </Text>
        </View>
        <View style={[S.pad, { gap: 8 }]}>
          {FINALES.map((f) => (
            <ListItem
              key={f.id}
              testID={`finale-${f.id}`}
              title={f.titre}
              subtitle={`${f.objectif === 'gagner' ? 'Objectif : gagner' : 'Objectif : tenir la nulle'} · ${NIVEAU_ETOILES[f.niveau - 1]}`}
              done={Boolean(progress.finales[f.id])}
              onPress={() => demarrer(f)}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  const jouable = !issue && !partie.fin;
  return (
    <View style={S.screen}>
      <ScrollView scrollEnabled={!glisse} contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble
          coach="lotus"
          text={auBot(partie) && jouable ? 'L’ordinateur réfléchit…' : message}
          tone={ton}
        />
        <View style={styles.boardWrap}>
          <ChessBoard
            onGlisser={setGlisse}
            position={partie.position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            flipped={finale.camp === 'b'}
            selected={selected}
            targets={selected !== null ? movesFrom(partie.position, selected) : []}
            lastMove={partie.moves[partie.moves.length - 1] ?? null}
            ghost={trace ? { square: trace.from, piece: trace.piece } : null}
            arrows={fleches}
            badges={badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, { paddingTop: 10 }]}>
          <Text style={S.sectionTitle}>{finale.titre}</Text>
          <Text style={styles.consigne}>{finale.consigne}</Text>
        </View>
      </ScrollView>
      <ActionBar>
        <Action testID="finale-indice" label="Indice" onPress={demanderIndice} disabled={!jouable} />
        <Action testID="finale-recommencer" label="Recommencer" onPress={() => demarrer(finale)} />
        <Action testID="finale-quitter" label="Quitter" primary onPress={() => { commit(null); setFinale(null); }} />
      </ActionBar>

      <PromotionDialog
        candidats={promo}
        blanc={finale.camp === 'w'}
        onChoisir={(m) => appliquer(m, false)}
        onAnnuler={() => setPromo(null)}
      />

      <Dialog
        visible={issue !== null}
        title={issue === 'reussi' ? 'Finale réussie !' : 'Pas cette fois'}
        message={
          issue === 'reussi'
            ? `${gain > 0 ? `+${gain} points. ` : ''}${finale.principe}`
            : finale.principe
        }
        onClose={() => setIssue(null)}
      >
        <View style={{ gap: 8 }}>
          <Button label="Recommencer" onPress={() => demarrer(finale)} />
          <Button label="Choisir une autre finale" variant="neutral" onPress={() => { commit(null); setFinale(null); setIssue(null); }} />
          <Button label="Voir la position" variant="neutral" onPress={() => setIssue(null)} />
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  consigne: { color: C.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
});
