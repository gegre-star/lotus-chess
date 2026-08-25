import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { Action, ActionBar, Button, ListItem } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { markGameSeen } from '../src/chess/progress';
import { GAMES, type FamousGame } from '../src/chess/content';
import { createEngine } from '../src/analysis';
import { comparerAuMaitre, commenter, type Comparaison } from '../src/analysis/comparer';
import {
  START_FEN,
  colorOf,
  findMove,
  makeMove,
  movesFrom,
  parseFEN,
  squareFromName as at,
  type Move,
  type Position,
} from '../src/chess/engine';

/** Position avant chaque demi-coup, et le coup joué depuis chacune. */
function derouler(game: FamousGame): { positions: Position[]; coups: Move[] } {
  const positions: Position[] = [parseFEN(START_FEN)];
  const coups: Move[] = [];
  game.coups.forEach(([from, to, promo]) => {
    const pos = positions[positions.length - 1];
    const move = findMove(pos, at(from), at(to), promo) ?? findMove(pos, at(from), at(to))!;
    coups.push(move);
    positions.push(makeMove(pos, move));
  });
  return { positions, coups };
}

export default function GamesScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [game, setGame] = useState<FamousGame | null>(null);
  const [ply, setPly] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [comparaison, setComparaison] = useState<Comparaison | null>(null);
  const [reflexion, setReflexion] = useState(false);
  const [revele, setRevele] = useState(false);
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);

  const boardSize = Math.min(width - 8, 460);

  useEffect(
    () => () => {
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  const parcours = useMemo(() => (game ? derouler(game) : null), [game]);
  const position = parcours?.positions[ply] ?? null;
  const coupMaitre = parcours?.coups[ply] ?? null;
  const termine = Boolean(parcours && ply >= parcours.coups.length);
  const aToi = Boolean(game && position && !termine && position.turn === game.heros);
  const nomMaitre = game ? (game.heros === 'w' ? game.blancs : game.noirs) : '';

  const ouvrir = useCallback((g: FamousGame) => {
    setGame(g);
    setPly(0);
    setSelected(null);
    setComparaison(null);
    setRevele(false);
  }, []);

  const avancer = useCallback(() => {
    if (!parcours) return;
    setPly((n) => Math.min(parcours.coups.length, n + 1));
    setComparaison(null);
    setSelected(null);
    setRevele(false);
  }, [parcours]);

  // le camp adverse joue tout seul : on ne fait deviner que les coups du maître
  useEffect(() => {
    if (!game || !position || termine || aToi || comparaison) return undefined;
    const h = setTimeout(avancer, 700);
    return () => clearTimeout(h);
  }, [game, position, termine, aToi, comparaison, avancer]);

  useEffect(() => {
    if (termine && game && !progress.seenGames[game.id]) {
      update((p) => markGameSeen(p, game.id));
    }
  }, [termine, game, progress.seenGames, update]);

  const proposer = useCallback(
    async (essai: Move) => {
      if (!position || !coupMaitre) return;
      if (!engine.current) engine.current = createEngine();
      setReflexion(true);
      try {
        setComparaison(await comparerAuMaitre(engine.current, position, essai, coupMaitre));
      } finally {
        setReflexion(false);
      }
    },
    [position, coupMaitre],
  );

  const onPressSquare = useCallback(
    (square: number) => {
      if (!position || !aToi || comparaison || reflexion) return;
      if (selected !== null) {
        const candidat = movesFrom(position, selected).find((m) => m.to === square);
        if (candidat) {
          setSelected(null);
          void proposer(candidat);
          return;
        }
      }
      const piece = position.board[square];
      setSelected(colorOf(piece) === position.turn ? square : null);
    },
    [position, aToi, comparaison, reflexion, selected, proposer],
  );

  const fleches = useMemo((): Arrow[] => {
    const seg = (uci: string, couleur: string): Arrow => [
      uci.slice(0, 2),
      uci.slice(2, 4),
      couleur,
    ];
    if (comparaison) {
      return comparaison.identique
        ? [seg(comparaison.maitre, C.green)]
        : [seg(comparaison.joue, C.red), seg(comparaison.maitre, C.green)];
    }
    if (revele && coupMaitre) return [seg(uciOf(coupMaitre), C.green)];
    return [];
  }, [comparaison, revele, coupMaitre, position]);

  // ---- liste des parties ----
  if (!game || !position || !parcours) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="lotus"
          text="Rejoue les plus belles parties de l’histoire. À chaque coup du maître, c’est toi qui cherches — puis on compare."
        />
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Parties de maîtres</Text>
          <Text style={S.sectionMeta}>{GAMES.length} parties</Text>
        </View>
        <View style={[S.pad, { gap: 8 }]}>
          {GAMES.map((g) => (
            <ListItem
              key={g.id}
              title={g.titre}
              subtitle={`${g.blancs} — ${g.noirs} · ${g.lieu}`}
              done={Boolean(progress.seenGames[g.id])}
              onPress={() => ouvrir(g)}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  // ---- partie en cours ----
  const message = reflexion
    ? 'Je compare avec la partie…'
    : comparaison
      ? `${commenter(comparaison, nomMaitre)} ${comparaison.feedback.texte}`
      : termine
        ? `Partie terminée. ${game.lecon}`
        : aToi
          ? `Coup ${Math.floor(ply / 2) + 1}. À toi : que jouerait ${nomMaitre} ?`
          : `${nomMaitre} attend la réponse adverse…`;
  const ton: BubbleTone = comparaison
    ? comparaison.identique
      ? 'ok'
      : 'neutral'
    : 'neutral';

  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble coach="lotus" text={message} tone={ton} />
        <View style={styles.boardWrap}>
          <ChessBoard
            position={position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            flipped={game.heros === 'b'}
            selected={selected}
            targets={selected !== null ? movesFrom(position, selected) : []}
            arrows={fleches}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={[S.pad, { paddingTop: 10 }]}>
          <Text style={styles.titre}>{game.titre}</Text>
          <Text style={styles.sous}>
            {game.blancs} — {game.noirs} · {game.lieu}
          </Text>
          {comparaison && !comparaison.identique ? (
            <Text style={[styles.sous, { color: C.green, marginTop: 6 }]}>
              Flèche verte : le coup de {nomMaitre}. Flèche rouge : le tien.
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <ActionBar>
        <Action
          testID="parties-montrer"
          label="Montrer"
          onPress={() => setRevele(true)}
          disabled={!aToi || Boolean(comparaison) || reflexion}
        />
        <Action
          testID="parties-suivant"
          label={termine ? 'Terminé' : 'Suivant ▶'}
          primary
          onPress={avancer}
          disabled={termine || reflexion || (aToi && !comparaison && !revele)}
        />
        <Action testID="parties-quitter" label="Quitter" onPress={() => setGame(null)} />
      </ActionBar>
    </View>
  );
}

/** Coup au format UCI. */
const uciOf = (m: Move): string =>
  `${'abcdefgh'[m.from % 8]}${Math.floor(m.from / 8) + 1}${'abcdefgh'[m.to % 8]}${Math.floor(m.to / 8) + 1}`;

const styles = StyleSheet.create({
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  titre: { color: C.text, fontSize: 15, fontWeight: '800' },
  sous: { color: C.muted, fontSize: 12, marginTop: 3 },
});
