/**
 * Courbe d'évaluation d'une partie, cliquable.
 *
 * Une valeur par position, du point de vue des blancs : la surface claire
 * sous la courbe est la part des blancs, la surface sombre au-dessus celle des
 * noirs. L'axe vertical n'est **pas** en centipions mais en probabilité de
 * gain (`hauteurRelative`) : sur une échelle linéaire, un mat ou un avantage
 * de dix pions écraserait tout le reste de la partie contre le bord, et les
 * fluctuations qui comptent (de −1 à +1) deviendraient invisibles.
 *
 * Le toucher se capte par une rangée de zones transparentes, une par
 * position, et non par la coordonnée du toucher : `locationX` n'existe pas sur
 * un clic web, et la même logique doit marcher sur iPhone (web) comme en natif.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { hauteurRelative } from '../analysis/statistiques';
import { C } from './theme';

export interface MarqueurCourbe {
  /** Position de la courbe où poser le repère. */
  index: number;
  couleur: string;
}

export interface EvalGraphProps {
  /**
   * Évaluation de chaque position, en centipions, point de vue des blancs,
   * déjà écrêtée (`RevueComplete.courbe`). N + 1 valeurs pour N demi-coups.
   */
  courbe: readonly number[];
  /** Largeur en pixels : celle de l'échiquier, pour que tout s'aligne. */
  largeur: number;
  /** Hauteur en pixels (72 par défaut). */
  hauteur?: number;
  /** Position sélectionnée : une ligne verticale la repère. */
  index: number;
  /** Appelé avec l'indice de la position touchée. */
  onSelect: (index: number) => void;
  /** Repères colorés, par exemple sur les erreurs. */
  marqueurs?: readonly MarqueurCourbe[];
  /** Préfixe des identifiants de test, pour distinguer deux courbes sur un même écran. */
  testIDPrefix?: string;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Coordonnées écran de chaque valeur de la courbe.
 *
 * Les positions sont réparties de bord à bord (la première contre le côté
 * gauche, la dernière contre le droit) ; une courbe d'un seul point se centre.
 * L'ordonnée 0 est en haut, là où les blancs gagnent.
 */
export function pointsCourbe(courbe: readonly number[], largeur: number, hauteur: number): Point[] {
  const n = courbe.length;
  return courbe.map((cp, i) => ({
    x: n <= 1 ? largeur / 2 : (i / (n - 1)) * largeur,
    y: hauteurRelative(cp) * hauteur,
  }));
}

/** Contour de la surface des blancs : la courbe, puis le retour par le bas de l'image. */
export function surfaceBlancs(points: readonly Point[], largeur: number, hauteur: number): string {
  if (points.length === 0) return '';
  const haut = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
  return `${haut}L${largeur} ${hauteur}L0 ${hauteur}Z`;
}

/** Tracé de la courbe seule. */
export function traceCourbe(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
}

export function EvalGraph({
  courbe,
  largeur,
  hauteur = 72,
  index,
  onSelect,
  marqueurs = [],
  testIDPrefix = 'eval',
}: EvalGraphProps) {
  const points = pointsCourbe(courbe, largeur, hauteur);
  const courant = points[Math.min(Math.max(index, 0), points.length - 1)];

  return (
    <View style={{ width: largeur, height: hauteur }} testID={`${testIDPrefix}-graph`}>
      <Svg width={largeur} height={hauteur}>
        <Rect x={0} y={0} width={largeur} height={hauteur} fill="#3b3835" />
        {points.length > 0 ? <Path d={surfaceBlancs(points, largeur, hauteur)} fill="#e8e6e1" /> : null}
        <Line x1={0} y1={hauteur / 2} x2={largeur} y2={hauteur / 2} stroke={C.muted2} strokeWidth={1} opacity={0.7} />
        {points.length > 1 ? (
          <Path d={traceCourbe(points)} stroke={C.muted} strokeWidth={1.2} fill="none" />
        ) : null}
        {marqueurs.map((m) => {
          const p = points[m.index];
          return p ? <Circle key={`${m.index}-${m.couleur}`} cx={p.x} cy={p.y} r={3.2} fill={m.couleur} /> : null;
        })}
        {courant ? (
          <Line x1={courant.x} y1={0} x2={courant.x} y2={hauteur} stroke={C.gold} strokeWidth={1.5} />
        ) : null}
      </Svg>

      {/* zones tactiles : une colonne par position, centrée sur son point et
          transparente. Les deux extrémités n'ont qu'une demi-largeur. */}
      <View style={StyleSheet.absoluteFill} testID={`${testIDPrefix}-zones`}>
        {points.map((p, i) => {
          const demi = points.length <= 1 ? largeur / 2 : largeur / (points.length - 1) / 2;
          const gauche = Math.max(0, p.x - demi);
          const droite = Math.min(largeur, p.x + demi);
          return (
            <Pressable
              key={i}
              testID={`${testIDPrefix}-zone-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`Aller à la position ${i}`}
              onPress={() => onSelect(i)}
              style={{ position: 'absolute', top: 0, bottom: 0, left: gauche, width: droite - gauche }}
            />
          );
        })}
      </View>
    </View>
  );
}
