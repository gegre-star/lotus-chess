import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import type { Piece } from '../chess/engine';

/**
 * Pièces dessinées en vectoriel, sur une grille de 45 × 45.
 *
 * Chaque pièce combine des formes pleines (`body`) et des traits de détail
 * (`detail`), pour que les pièces noires restent lisibles sur cases sombres.
 */
const BODY = { strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const DETAIL = { fill: 'none', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const PIECE_COLORS = {
  white: { fill: '#fafaf8', edge: '#3a3733', detail: '#3a3733' },
  black: { fill: '#4b4845', edge: '#171614', detail: '#c9c5bf' },
} as const;

interface Skin {
  fill: string;
  edge: string;
  detail: string;
}

function King({ s }: { s: Skin }) {
  return (
    <>
      <Path d="M22.5 11.6V6M20 8h5" fill="none" stroke={s.edge} {...BODY} />
      <Path
        d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Path
        d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4v3.5V23.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Path
        d="M12.5 30c5.5-3 14.5-3 20 0M12.5 33.5c5.5-3 14.5-3 20 0M12.5 37c5.5-3 14.5-3 20 0"
        stroke={s.detail}
        {...DETAIL}
      />
    </>
  );
}

function Queen({ s }: { s: Skin }) {
  const crown = [
    [6, 12],
    [14, 9],
    [22.5, 8],
    [31, 9],
    [39, 12],
  ] as const;
  return (
    <>
      {crown.map(([cx, cy]) => (
        <Circle key={`${cx}`} cx={cx} cy={cy} r={2.1} fill={s.fill} stroke={s.edge} {...BODY} />
      ))}
      <Path
        d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1L25.5 24.5 22.5 10l-3 14.5L14.3 10.9 14 25 6.5 13.5 9 26z"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Path
        d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1 2.5-1 2.5-1.5 1.5 0 2.5 0 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4z"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Path d="M11.5 30c3.5-1 16.5-1 22 0M12.5 33.5h20" stroke={s.detail} {...DETAIL} />
    </>
  );
}

function Rook({ s }: { s: Skin }) {
  return (
    <>
      <Path d="M9 39h27v-3H9v3z" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M12.5 32l1.5-2.5h17l1.5 2.5h-20z" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M12 36v-4h21v4H12z" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M14 29.5v-13h17v13H14z" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M14 16.5L11 14V9h4v2h5V9h5v2h5V9h4v5l-3 2.5H14z" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M12 36h21M13 32h19M14 29.5h17M11 14h23" stroke={s.detail} {...DETAIL} />
    </>
  );
}

function Bishop({ s }: { s: Skin }) {
  return (
    <>
      <Path
        d="M9 36c3.4-1 10.1.4 13.5-2 3.4 2.4 10.1 1 13.5 2 0 0 1.7.5 3 2-.7 1-1.7 1-3 .5-3.4-1-10.1.4-13.5-1-3.4 1.4-10.1 0-13.5 1-1.4.5-2.3.5-3-.5 1.4-2 3-2 3-2z"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Path
        d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Circle cx={22.5} cy={8} r={2.4} fill={s.fill} stroke={s.edge} {...BODY} />
      <Path d="M17.5 26h10M15 30h15M22.5 15.5v5M20 18h5" stroke={s.detail} {...DETAIL} />
    </>
  );
}

function Knight({ s }: { s: Skin }) {
  return (
    <>
      <Path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill={s.fill} stroke={s.edge} {...BODY} />
      <Path
        d="M24 18c.4 2.9-5.6 7.4-8 9-3 2-2.8 4.3-5 4-1-.9 1.4-3 0-3-1 0 .2 1.2-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.9-1.9 2-3.5c-.7-1-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.8-2 2.5-3c1 0 1 3 1 3"
        fill={s.fill}
        stroke={s.edge}
        {...BODY}
      />
      <Circle cx={9.2} cy={25.6} r={0.9} fill={s.detail} />
      <Ellipse
        cx={14.7}
        cy={15.7}
        rx={0.7}
        ry={1.7}
        fill={s.detail}
        transform="rotate(30 14.7 15.7)"
      />
    </>
  );
}

function Pawn({ s }: { s: Skin }) {
  return (
    <Path
      d="M22.5 9c-2.2 0-4 1.8-4 4 0 .9.3 1.7.8 2.4A7 7 0 0 0 16 21c0 2 .9 3.8 2.4 5-3 1.1-7.4 5.6-7.4 13.5h23c0-7.9-4.4-12.4-7.4-13.5a6.5 6.5 0 0 0 2.4-5c0-2.4-1.3-4.5-3.3-5.6.5-.7.8-1.5.8-2.4 0-2.2-1.8-4-4-4z"
      fill={s.fill}
      stroke={s.edge}
      {...BODY}
    />
  );
}

const SHAPES = { k: King, q: Queen, r: Rook, b: Bishop, n: Knight, p: Pawn } as const;

interface ChessPieceProps {
  piece: Piece;
  size: number;
}

export function ChessPiece({ piece, size }: ChessPieceProps) {
  const white = piece === piece.toUpperCase();
  const skin = white ? PIECE_COLORS.white : PIECE_COLORS.black;
  const Shape = SHAPES[piece.toLowerCase() as keyof typeof SHAPES];
  return (
    <Svg width={size} height={size} viewBox="0 0 45 45">
      <Shape s={skin} />
    </Svg>
  );
}
