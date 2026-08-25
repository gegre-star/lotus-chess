import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ChessPiece } from './ChessPiece';
import {
  FILES,
  fileOf,
  findKing,
  gameStatus,
  rankOf,
  squareFromName,
  type Move,
  type Position,
} from '../chess/engine';
import type { BoardTheme } from '../chess/progress';

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  foret: { light: '#ebecd0', dark: '#779556' },
  ocean: { light: '#dee3e6', dark: '#5f87a8' },
  bois: { light: '#f0d9b5', dark: '#b58863' },
  nuit: { light: '#8d9aa5', dark: '#46545f' },
};

export type SquareBadge = 'good' | 'bad';
/** Une flèche : case de départ, case d'arrivée, couleur optionnelle. */
export type Arrow = [string, string] | [string, string, string];

const HIGHLIGHT = 'rgba(247,247,105,0.58)';
const CHECK = 'rgba(228,87,76,0.55)';
const DOT = 'rgba(20,20,16,0.20)';
const ARROW_COLOR = '#f0a63a';

interface ChessBoardProps {
  position: Position;
  size: number;
  theme?: BoardTheme;
  /** Vue depuis les noirs. */
  flipped?: boolean;
  showCoords?: boolean;
  selected?: number | null;
  /** Coups légaux à signaler par une pastille. */
  targets?: Move[];
  lastMove?: { from: number; to: number } | null;
  arrows?: Arrow[];
  badges?: Record<number, SquareBadge>;
  onPressSquare?: (square: number) => void;
}

/**
 * Trace une flèche pleine entre deux cases, en coordonnées d'échiquier
 * (une unité = une case), avec une pointe triangulaire.
 */
function arrowPath(from: number, to: number, flipped: boolean): string {
  let fx = fileOf(from) + 0.5;
  let fy = 7 - rankOf(from) + 0.5;
  let tx = fileOf(to) + 0.5;
  let ty = 7 - rankOf(to) + 0.5;
  if (flipped) {
    fx = 8 - fx;
    fy = 8 - fy;
    tx = 8 - tx;
    ty = 8 - ty;
  }
  const dx = tx - fx;
  const dy = ty - fy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const headLength = 0.4;
  const headWidth = 0.3;
  const shaft = 0.115;
  // on décolle la flèche du centre des cases pour ne pas masquer les pièces
  const ex = tx - ux * 0.3;
  const ey = ty - uy * 0.3;
  const bx = ex - ux * headLength;
  const by = ey - uy * headLength;
  const sx = fx + ux * 0.32;
  const sy = fy + uy * 0.32;

  return [
    `M${sx + px * shaft} ${sy + py * shaft}`,
    `L${bx + px * shaft} ${by + py * shaft}`,
    `L${bx + px * headWidth} ${by + py * headWidth}`,
    `L${ex} ${ey}`,
    `L${bx - px * headWidth} ${by - py * headWidth}`,
    `L${bx - px * shaft} ${by - py * shaft}`,
    `L${sx - px * shaft} ${sy - py * shaft}`,
    'Z',
  ].join('');
}

export function ChessBoard({
  position,
  size,
  theme = 'foret',
  flipped = false,
  showCoords = true,
  selected = null,
  targets = [],
  lastMove = null,
  arrows = [],
  badges = {},
  onPressSquare,
}: ChessBoardProps) {
  const cell = size / 8;
  const colors = BOARD_THEMES[theme];

  const targetMap = useMemo(() => {
    const map = new Map<number, Move>();
    targets.forEach((m) => map.set(m.to, m));
    return map;
  }, [targets]);

  const checkedKing = useMemo(() => {
    const st = gameStatus(position);
    return st === 'check' || st === 'mate' ? findKing(position, position.turn) : -1;
  }, [position]);

  // rangée 8 en haut, sauf si l'échiquier est retourné
  const squares: number[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    for (let file = 0; file < 8; file += 1) squares.push(rank * 8 + file);
  }
  const ordered = flipped ? squares.slice().reverse() : squares;

  return (
    <View style={[styles.board, { width: size, height: size }]}>
      {ordered.map((square) => {
        const file = fileOf(square);
        const rank = rankOf(square);
        const isDark = (file + rank) % 2 === 0;
        const piece = position.board[square];
        const move = targetMap.get(square);
        const isCapture = Boolean(move && (move.captured || move.enPassant));
        const highlighted =
          selected === square || lastMove?.from === square || lastMove?.to === square;
        // les repères se lisent sur le bord visible, qui change quand on retourne
        const showFile = flipped ? rank === 7 : rank === 0;
        const showRank = flipped ? file === 7 : file === 0;
        const badge = badges[square];

        return (
          <Pressable
            key={square}
            onPress={onPressSquare ? () => onPressSquare(square) : undefined}
            style={[
              styles.square,
              { width: cell, height: cell, backgroundColor: isDark ? colors.dark : colors.light },
            ]}
          >
            {highlighted ? <View style={[styles.fill, { backgroundColor: HIGHLIGHT }]} /> : null}
            {square === checkedKing && !badge ? (
              <View style={[styles.fill, { backgroundColor: CHECK }]} />
            ) : null}

            {showCoords && showRank ? (
              <Text
                style={[styles.coord, styles.coordRank, { color: isDark ? colors.light : colors.dark }]}
              >
                {rank + 1}
              </Text>
            ) : null}
            {showCoords && showFile ? (
              <Text
                style={[styles.coord, styles.coordFile, { color: isDark ? colors.light : colors.dark }]}
              >
                {FILES[file]}
              </Text>
            ) : null}

            {piece ? <ChessPiece piece={piece} size={cell * 0.92} /> : null}

            {move && !isCapture ? (
              <View
                style={[
                  styles.dot,
                  { width: cell * 0.3, height: cell * 0.3, borderRadius: cell * 0.15 },
                ]}
              />
            ) : null}
            {move && isCapture ? (
              <View
                style={[
                  styles.ring,
                  { width: cell * 0.92, height: cell * 0.92, borderRadius: cell * 0.46, borderWidth: cell * 0.08 },
                ]}
              />
            ) : null}

            {badge ? (
              <View
                style={[
                  styles.badge,
                  {
                    width: cell * 0.36,
                    height: cell * 0.36,
                    borderRadius: cell * 0.18,
                    backgroundColor: badge === 'good' ? '#81b64c' : '#e4574c',
                  },
                ]}
              >
                <Text style={[styles.badgeText, { fontSize: cell * 0.22 }]}>
                  {badge === 'good' ? '✓' : '✕'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}

      {arrows.length > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size} height={size} viewBox="0 0 8 8">
          {arrows.map(([from, to, color], i) => (
            <Path
              key={`${from}${to}${i}`}
              d={arrowPath(squareFromName(from), squareFromName(to), flipped)}
              fill={color ?? ARROW_COLOR}
              opacity={0.85}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 4, overflow: 'hidden' },
  square: { alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject },
  dot: { position: 'absolute', backgroundColor: DOT },
  ring: { position: 'absolute', borderColor: DOT },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '800' },
  coordRank: { top: 1, left: 3 },
  coordFile: { bottom: 0, right: 3 },
  badge: { position: 'absolute', top: -2, right: -2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800' },
});
