import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ChessBoard, type Arrow, type SquareBadge } from '../src/components/ChessBoard';
import { CoachBubble, type BubbleTone } from '../src/components/CoachBubble';
import { Action, ActionBar, Button, Dialog, ListItem } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import { BOTS, type Bot } from '../src/chess/content';
import { finishGame } from '../src/chess/progress';
import { chooseMove, hangingSquare, updateElo } from '../src/chess/ai';
import { createEngine } from '../src/analysis';
import { revoirPartie, type CoupRevu } from '../src/analysis/review';
import { perteEnPions, type Verdict } from '../src/chess/coaching';
import {
  START_FEN,
  castleByRook,
  colorOf,
  findKing,
  inCheck,
  gameStatus,
  makeMove,
  movesFrom,
  parseFEN,
  squareName,
  toSAN,
  type Color,
  type Move,
  type Position,
} from '../src/chess/engine';

interface GameState {
  bot: Bot;
  side: Color;
  position: Position;
  history: Position[];
  moves: Move[];
  sans: string[];
  selected: number | null;
  lastMove: Move | null;
  over: boolean;
  message: string;
  tone: BubbleTone;
  badges: Record<number, SquareBadge>;
}

const VERDICT_COULEUR: Record<Verdict, string> = {
  brillant: C.gold,
  bon: C.green,
  imprecision: C.blue,
  erreur: '#d2723a',
  gaffe: C.red,
};

const newGame = (bot: Bot, side: Color): GameState => ({
  bot,
  side,
  position: parseFEN(START_FEN),
  history: [],
  moves: [],
  sans: [],
  selected: null,
  lastMove: null,
  over: false,
  message: `${bot.nom} : « ${bot.say} »`,
  tone: 'neutral',
  badges: {},
});

export default function PlayScreen() {
  const { width } = useWindowDimensions();
  const { progress, update } = useProgress();
  const [game, setGame] = useState<GameState | null>(null);
  const [review, setReview] = useState<CoupRevu[] | null>(null);
  const [revueIndex, setRevueIndex] = useState(0);
  const [analysing, setAnalysing] = useState<string | null>(null);
  // un seul moteur pour tout l'écran : le démarrer coûte le chargement du wasm
  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  const [endDialog, setEndDialog] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const boardSize = Math.min(width - 8, 460);
  const botColor = (g: GameState): Color => (g.side === 'w' ? 'b' : 'w');
  // état dérivé plutôt que stocké : c'est vrai exactement quand le trait est
  // au bot, il n'y a donc rien à synchroniser
  const botPense = Boolean(game && !game.over && game.position.turn === botColor(game));

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // le worker Stockfish survivrait au démontage de l'écran
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  const conclude = useCallback(
    (g: GameState): GameState => {
      const status = gameStatus(g.position);
      if (status !== 'mate' && status !== 'stalemate') return g;

      const badges: Record<number, SquareBadge> = {};
      let result: 'win' | 'loss' | 'draw';
      let message: string;

      if (status === 'mate') {
        badges[findKing(g.position, g.position.turn)] = 'bad';
        const winner: Color = g.position.turn === 'w' ? 'b' : 'w';
        if (winner === g.side) {
          result = 'win';
          message = 'Échec et mat — tu as gagné !';
        } else {
          result = 'loss';
          message = `Échec et mat pour ${g.bot.nom}. Rejoue, tu vas y arriver.`;
        }
      } else {
        result = 'draw';
        message = 'Pat : aucun coup légal, partie nulle.';
      }

      const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
      const newElo = updateElo(progress.elo, g.bot.elo, score);
      update((p) => finishGame(p, g.bot.nom, result, newElo));
      setEndDialog(`${message}\nClassement : ${newElo} (${newElo >= progress.elo ? '+' : ''}${newElo - progress.elo})`);

      return { ...g, over: true, badges, message, tone: result === 'win' ? 'ok' : 'bad' };
    },
    [progress.elo, update],
  );

  const applyMove = useCallback(
    (g: GameState, move: Move): GameState => {
      const before = g.position;
      const after = makeMove(before, move);
      const mover = colorOf(before.board[move.from]);
      const next: GameState = {
        ...g,
        position: after,
        history: [...g.history, before],
        moves: [...g.moves, move],
        sans: [...g.sans, toSAN(before, move, after)],
        selected: null,
        lastMove: move,
        badges: {},
        message: g.message,
        tone: 'neutral',
      };

      const settled = conclude(next);
      if (settled.over) return settled;

      if (mover === g.side) {
        // le coach avertit quand le coup laisse une pièce en prise
        const hanging = hangingSquare(after);
        if (hanging >= 0) {
          return {
            ...settled,
            message: `Attention : ta pièce en ${squareName(hanging).toUpperCase()} peut être capturée.`,
            tone: 'bad',
          };
        }
        if (move.captured) return { ...settled, message: 'Bonne capture.', tone: 'neutral' };
      }
      return settled;
    },
    [conclude],
  );

  // fait jouer l'ordinateur dès que c'est son tour
  /**
   * Le bot joue dès que le trait lui revient.
   *
   * L'effet ne dépend que de la position et de la fin de partie. Il dépendait
   * autrefois de `game` tout entier tout en appelant `setGame` dès sa première
   * ligne : chaque exécution changeait sa propre dépendance, relançait l'effet,
   * et le nettoyage annulait le minuteur avant qu'il ne se déclenche. Le bot ne
   * jouait donc jamais et la partie restait bloquée après le premier coup.
   */
  useEffect(() => {
    if (!game || game.over || game.position.turn !== botColor(game)) return undefined;
    const handle = setTimeout(() => {
      setGame((g) => {
        if (!g || g.over || g.position.turn !== (g.side === 'w' ? 'b' : 'w')) return g;
        const move = chooseMove(g.position, { depth: g.bot.depth, gaffe: g.bot.gaffe });
        if (!move) return g;
        return applyMove(g, move);
      });
    }, 120);
    timer.current = handle;
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.position, game?.over, applyMove]);

  /**
   * Position avant chaque demi-coup de la partie.
   *
   * `positionsRevue[n]` est la position telle qu'elle était avant le n-ième
   * demi-coup — c'est celle où le joueur avait encore le choix, donc la seule
   * sur laquelle montrer une alternative ait du sens.
   */
  const positionsRevue = useMemo(() => {
    if (!game) return [];
    const suite: Position[] = [parseFEN(START_FEN)];
    game.moves.forEach((m, i) => suite.push(makeMove(suite[i], m)));
    return suite;
  }, [game]);

  const onPressSquare = useCallback(
    (square: number) => {
      setGame((g) => {
        if (!g || g.over || g.position.turn !== g.side) return g;
        if (g.position.turn !== g.side) return g;

        if (g.selected !== null) {
          const candidates = movesFrom(g.position, g.selected).filter((m) => m.to === square);
          if (candidates.length > 0) {
            const move = candidates.find((m) => m.promotion === 'Q') ?? candidates[0];
            return applyMove(g, move);
          }
          // toucher sa propre tour est l'autre geste courant pour roquer
          const roque = castleByRook(g.position, g.selected, square);
          if (roque) return applyMove(g, roque);
        }

        const piece = g.position.board[square];
        const sien = colorOf(piece) === g.position.turn;
        // un refus muet laisse croire que le coup est interdit sans dire
        // pourquoi ; l'échec est de loin la raison la plus fréquente
        const message =
          g.selected !== null && !sien && inCheck(g.position, g.position.turn)
            ? 'Ton roi est en échec : il faut d’abord parer la menace.'
            : g.message;
        return { ...g, selected: sien ? square : null, message };
      });
    },
    [applyMove],
  );

  const undo = useCallback(() => {
    setGame((g) => {
      if (!g || g.history.length === 0) return g;
      let index = g.history.length - 1;
      // on remonte aussi le coup de l'ordinateur, pour rendre la main au joueur
      if (index > 0 && g.history[index].turn !== g.side) index -= 1;
      return {
        ...g,
        position: g.history[index],
        history: g.history.slice(0, index),
        moves: g.moves.slice(0, index),
        sans: g.sans.slice(0, index),
        selected: null,
        lastMove: null,
        over: false,
        badges: {},
      };
    });
  }, []);

  const analyse = useCallback(async () => {
    if (!game) return;
    if (!engine.current) engine.current = createEngine();
    setAnalysing('Analyse en cours…');
    try {
      const revue = await revoirPartie(
        engine.current,
        parseFEN(START_FEN),
        game.moves,
        game.sans,
        game.side,
        {
          depth: 10,
          onProgress: (fait, total) => setAnalysing(`Analyse ${fait}/${total}`),
        },
      );
      setReview(revue);
      setRevueIndex(0);
    } finally {
      setAnalysing(null);
    }
  }, [game]);

  // ---- choix de l'adversaire ----
  if (!game) {
    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="robi"
          text="Choisis ton adversaire. Commence par Pixou si tu débutes — il joue presque au hasard."
        />
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Adversaires</Text>
          <Text style={S.sectionMeta}>Ton classement : {progress.elo}</Text>
        </View>
        <View style={[S.pad, { gap: 8 }]}>
          {BOTS.map((bot) => (
            <ListItem
              key={bot.id}
              title={`${bot.nom} · ${bot.elo}`}
              subtitle={bot.say}
              onPress={() => setGame(newGame(bot, 'w'))}
            />
          ))}
        </View>
      </ScrollView>
    );
  }

  // ---- analyse de la partie ----
  if (review) {
    const good = review.filter((r) => r.verdict === 'bon' || r.verdict === 'brillant').length;
    const courant = review[Math.min(revueIndex, review.length - 1)];
    // on affiche la position **avant** le coup : c'est celle où l'élève avait
    // le choix, donc la seule où montrer une alternative a du sens
    const avant = positionsRevue[courant.ply - 1] ?? parseFEN(START_FEN);
    const fautif = courant.verdict !== 'bon' && courant.verdict !== 'brillant';

    return (
      <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 28 }}>
        <CoachBubble
          coach="robi"
          text={`${good} bons coups sur ${review.length}. ${
            review.some((r) => r.verdict === 'gaffe')
              ? 'Regarde les gaffes : c’est là que la partie bascule.'
              : 'Partie très propre !'
          }`}
        />

        <View style={styles.boardWrap}>
          <ChessBoard
            position={avant}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            flipped={game.side === 'b'}
            arrows={flechesRevue(courant, fautif)}
          />
        </View>

        <View style={[S.pad, { paddingTop: 10 }]}>
          <Text style={styles.revueTitre}>
            {courant.ply}. {courant.san} — {courant.titre}
          </Text>
          <Text style={styles.revueTexte}>{courant.texte}</Text>
          {fautif && courant.meilleur ? (
            <Text style={[styles.revueTexte, { color: C.green }]}>
              Flèche verte : le coup qu’il fallait jouer. Flèche rouge : le tien.
            </Text>
          ) : null}
        </View>

        <ActionBar>
          <Action
            testID="revue-precedent"
            label="◀ Précédent"
            onPress={() => setRevueIndex((i) => Math.max(0, i - 1))}
            disabled={revueIndex === 0}
          />
          <Action
            testID="revue-suivant"
            label="Suivant ▶"
            primary
            onPress={() => setRevueIndex((i) => Math.min(review.length - 1, i + 1))}
            disabled={revueIndex >= review.length - 1}
          />
        </ActionBar>

        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Tes coups</Text>
          <Text style={S.sectionMeta}>
            {revueIndex + 1}/{review.length}
          </Text>
        </View>
        <View style={[S.pad, { gap: 6 }]}>
          {review.map((r, i) => (
            <Pressable
              key={`${r.san}-${i}`}
              testID={`revue-coup-${i}`}
              onPress={() => setRevueIndex(i)}
              style={[
                S.card,
                S.row,
                i === revueIndex ? { borderColor: C.green, borderWidth: 1 } : null,
              ]}
            >
              <View style={[styles.tag, { backgroundColor: VERDICT_COULEUR[r.verdict] }]} />
              <Text style={[S.itemTitle, { width: 70 }]}>
                {i + 1}. {r.san}
              </Text>
              <Text style={[S.itemSub, { flex: 1 }]}>
                {r.titre}
                {ecart(r.perte)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[S.pad, { paddingTop: 14 }]}>
          <Button label="Retour" onPress={() => setReview(null)} variant="neutral" />
        </View>
      </ScrollView>
    );
  }

  // ---- partie en cours ----
  return (
    <View style={S.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <CoachBubble
          coach="robi"
          text={botPense ? `${game.bot.nom} réfléchit…` : game.message}
          tone={botPense ? 'neutral' : game.tone}
        />
        <View style={styles.boardWrap}>
          <ChessBoard
            position={game.position}
            size={boardSize}
            theme={progress.settings.board}
            showCoords={progress.settings.coords}
            flipped={game.side === 'b'}
            selected={game.selected}
            targets={game.selected !== null ? movesFrom(game.position, game.selected) : []}
            lastMove={game.lastMove}
            badges={game.badges}
            onPressSquare={onPressSquare}
          />
        </View>
        <View style={S.sectionRow}>
          <Text style={S.sectionTitle}>Coups</Text>
          <Text style={S.sectionMeta}>{game.bot.nom} · {game.bot.elo}</Text>
        </View>
        <View style={[S.pad, styles.moveList]}>
          {game.sans.length === 0 ? (
            <Text style={S.muted}>À toi de jouer.</Text>
          ) : (
            game.sans.map((san, i) => (
              <Text key={`${san}-${i}`} style={styles.move}>
                {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                {san}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
      <ActionBar>
        <Action label="Annuler" onPress={undo} disabled={game.history.length === 0 || analysing !== null} />
        <Action
          label={analysing ?? (game.over ? 'Analyser' : 'Nouvelle')}
          primary
          disabled={analysing !== null}
          onPress={game.over ? analyse : () => setGame(newGame(game.bot, game.side))}
        />
        <Action label="Quitter" onPress={() => setGame(null)} disabled={analysing !== null} />
      </ActionBar>

      <Dialog
        visible={endDialog !== null}
        title="Partie terminée"
        message={endDialog ?? undefined}
        onClose={() => setEndDialog(null)}
      >
        <View style={{ gap: 8 }}>
          <Button
            label="Analyser la partie"
            onPress={() => {
              setEndDialog(null);
              analyse();
            }}
          />
          <Button
            label="Rejouer"
            variant="neutral"
            onPress={() => {
              setEndDialog(null);
              setGame(newGame(game.bot, game.side));
            }}
          />
        </View>
      </Dialog>
    </View>
  );
}

/** Écart affiché à côté du verdict, muet quand il ne veut rien dire. */
function ecart(perte: number): string {
  const pions = perteEnPions(perte);
  // au-delà du seuil c'est un mat qui se joue : « −989,4 » n'aurait aucun sens
  if (pions === null) return ' · mat en jeu';
  return pions > 0.3 ? ` · −${pions.toFixed(1).replace('.', ',')}` : '';
}

/**
 * Flèches de la revue : en rouge le coup joué, en vert celui qu'il fallait
 * jouer. Sur un bon coup on ne trace que le coup joué — deux flèches
 * identiques n'apprendraient rien.
 */
function flechesRevue(coup: CoupRevu, fautif: boolean): Arrow[] {
  const seg = (uci: string, couleur: string): Arrow => [uci.slice(0, 2), uci.slice(2, 4), couleur];
  if (!fautif || !coup.meilleur || coup.meilleur === coup.joue) {
    return [seg(coup.joue, C.green)];
  }
  return [seg(coup.joue, C.red), seg(coup.meilleur, C.green)];
}

const styles = StyleSheet.create({
  revueTitre: { color: C.text, fontSize: 15, fontWeight: '800' },
  revueTexte: { color: C.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  boardWrap: { alignItems: 'center', paddingTop: 4 },
  moveList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  move: { color: C.muted, fontSize: 13, fontWeight: '700' },
  tag: { width: 10, height: 22, borderRadius: 4 },
});
