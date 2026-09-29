import React, { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ChessPiece } from './ChessPiece';
import {
  Case,
  CIBLE_AUCUNE,
  CIBLE_CAPTURE,
  CIBLE_COUP,
  type CodeCible,
  type SquareBadge,
} from './PlateauCase';
import { ECHELLE_VOL, useGlisserDeposer } from './GlisserDeposer';
import {
  FILES,
  colorOf,
  fileOf,
  findKing,
  inCheck,
  rankOf,
  squareFromName,
  type Move,
  type Piece,
  type Position,
} from '../chess/engine';
import type { BoardTheme } from '../chess/progress';

export type { SquareBadge };

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> = {
  foret: { light: '#ebecd0', dark: '#779556' },
  ocean: { light: '#dee3e6', dark: '#5f87a8' },
  bois: { light: '#f0d9b5', dark: '#b58863' },
  nuit: { light: '#8d9aa5', dark: '#46545f' },
};

/** Une flèche : case de départ, case d'arrivée, couleur optionnelle. */
export type Arrow = [string, string] | [string, string, string];

const ARROW_COLOR = '#f0a63a';

// Valeurs par défaut hors de la fonction : `targets = []` dans les paramètres
// créerait un tableau neuf à chaque rendu, et casserait tous les `useMemo`.
const AUCUN_COUP: Move[] = [];
const AUCUNE_FLECHE: Arrow[] = [];
const AUCUN_BADGE: Record<number, SquareBadge> = {};

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
  /**
   * Pièce estompée laissée sur la case de départ du dernier coup.
   *
   * Sur un écran de téléphone, un coup adverse ne se voit pas : la pièce est
   * ailleurs, et rien ne dit d'où elle vient. Le fantôme montre le point de
   * départ pendant un instant, le temps de comprendre le déplacement.
   */
  ghost?: { square: number; piece: Piece } | null;
  arrows?: Arrow[];
  badges?: Record<number, SquareBadge>;
  /**
   * Toucher d'une case. Un glissement en produit deux : la case de départ au
   * début du geste, la case d'arrivée à la fin (voir `GlisserDeposer`).
   * Sans ce gestionnaire l'échiquier est inerte, glisser compris.
   */
  onPressSquare?: (square: number) => void;
  /**
   * Cette pièce peut-elle être saisie ? Par défaut : toute pièce du camp au
   * trait.
   *
   * Le composant ne connaît pas les règles de l'écran (camp du joueur, tour de
   * l'adversaire, exercice qui n'autorise qu'une pièce). Cette prop sert à
   * éviter un glissement qui ne mènerait nulle part ; elle n'est pas la seule
   * garde : le glissement n'est de toute façon suivi que tant que `selected`
   * désigne la case de départ, ce que seul l'écran décide.
   */
  peutGlisser?: (square: number) => boolean;
  /**
   * Prévient l'écran qu'un glissement commence (`true`) ou finit (`false`).
   * Sur natif, l'écran y fige sa `ScrollView` (`scrollEnabled={!actif}`) :
   * sans cela, elle peut reprendre le geste et l'annuler en plein vol. Sur le
   * web, `touch-action: none` suffit et cette prop est facultative.
   */
  onGlisser?: (actif: boolean) => void;
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

  // Les marges et la pointe se réduisent sur les flèches courtes. À taille
  // fixe elles consommaient 1,02 case pour une flèche d'une case — soit plus
  // que sa longueur : la poussée de pion, le coup le plus fréquent des
  // leçons, ne s'affichait qu'en moignon.
  const marge = Math.min(0.3, len * 0.12);
  const debut = Math.min(0.32, len * 0.18);
  const headLength = Math.min(0.4, len * 0.4);
  const headWidth = Math.min(0.3, len * 0.3);
  const shaft = Math.min(0.115, len * 0.115);
  // on décolle la flèche du centre des cases pour ne pas masquer les pièces
  const ex = tx - ux * marge;
  const ey = ty - uy * marge;
  const bx = ex - ux * headLength;
  const by = ey - uy * headLength;
  const sx = fx + ux * debut;
  const sy = fy + uy * debut;

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

/** Les 64 cases dans l'ordre d'affichage : rangée 8 en haut, colonne a à gauche. */
const ORDRE: number[] = [];
for (let rang = 7; rang >= 0; rang -= 1) {
  for (let fichier = 0; fichier < 8; fichier += 1) ORDRE.push(rang * 8 + fichier);
}
// retourner l'échiquier, c'est lire les mêmes cases à l'envers
const ORDRE_RETOURNE = ORDRE.slice().reverse();

/**
 * Réglages propres au navigateur, sur la racine de l'échiquier.
 *
 * - `touch-action: none` : sans lui, Safari iPhone fait défiler la page sous
 *   le doigt dès que le glissement commence, et annule le geste.
 * - `user-select: none` : un glissement à la souris sélectionnait le texte
 *   des coordonnées (les « 3 » et « 2 » surlignés en bleu).
 * - `-webkit-touch-callout: none` : évite le menu contextuel d'iOS sur appui long.
 * Absents du typage de React Native, d'où l'assertion ; ignorés hors web.
 */
const STYLE_NAVIGATEUR = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
  WebkitTapHighlightColor: 'transparent',
} as unknown as ViewStyle;

/**
 * Flèches, dessinées à part : elles ne changent que si les flèches changent,
 * jamais quand un coup ou une sélection re-rend l'échiquier.
 */
const Fleches = memo(function Fleches({
  fleches,
  size,
  flipped,
}: {
  fleches: Arrow[];
  size: number;
  flipped: boolean;
}) {
  // Sans `pointerEvents="none"`, ce calque recouvre l'échiquier et absorbe
  // tous les touchers : les cases deviennent intouchables dès qu'une flèche
  // est affichée.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="arrow-overlay">
      <Svg width={size} height={size} viewBox="0 0 8 8">
        {fleches.map(([from, to, color], i) => (
          <Path
            key={`${from}${to}${i}`}
            d={arrowPath(squareFromName(from), squareFromName(to), flipped)}
            fill={color ?? ARROW_COLOR}
            opacity={0.85}
          />
        ))}
      </Svg>
    </View>
  );
});

function ChessBoardBase({
  position,
  size,
  theme = 'foret',
  flipped = false,
  showCoords = true,
  selected = null,
  targets = AUCUN_COUP,
  lastMove = null,
  ghost = null,
  arrows = AUCUNE_FLECHE,
  badges = AUCUN_BADGE,
  onPressSquare,
  peutGlisser,
  onGlisser,
}: ChessBoardProps) {
  const cell = size / 8;
  const colors = BOARD_THEMES[theme];
  const plateauRef = useRef<View>(null);

  // Le gestionnaire de l'écran change d'identité quand l'écran se re-rend ;
  // les cases n'en connaissent qu'un, stable, qui lit la version à jour ici.
  const surCase = useRef(onPressSquare);
  useLayoutEffect(() => {
    surCase.current = onPressSquare;
  });
  const appuiDirect = useCallback((carre: number) => surCase.current?.(carre), []);

  const {
    gestes,
    glisse,
    position: positionVol,
    ignorerAppui,
  } = useGlisserDeposer({
    plateauRef,
    taille: size,
    retourne: flipped,
    selectionnee: selected,
    peutGlisser:
      peutGlisser ??
      ((carre) => {
        const piece = position.board[carre];
        return piece !== null && colorOf(piece) === position.turn;
      }),
    actif: Boolean(onPressSquare),
    surAppui: appuiDirect,
    surGlisser: onGlisser,
  });

  const appuyer = useCallback(
    (carre: number) => {
      if (ignorerAppui(carre)) return;
      surCase.current?.(carre);
    },
    [ignorerAppui],
  );

  // Le glissement ne se montre que tant que l'écran garde la pièce sélectionnée :
  // c'est sa façon d'accepter le premier toucher (voir `GlisserDeposer`).
  const vol = glisse && selected === glisse.depart && position.board[glisse.depart] ? glisse : null;

  const codesCible = useMemo(() => {
    const codes = new Uint8Array(64);
    targets.forEach((m) => {
      codes[m.to] = m.captured || m.enPassant ? CIBLE_CAPTURE : CIBLE_COUP;
    });
    return codes;
  }, [targets]);

  // on interroge `inCheck` plutôt que `gameStatus` : un statut de nulle
  // (matériel insuffisant, 50 coups) masquerait le roi en échec, et cela évite
  // de générer tous les coups légaux à chaque rendu
  const checkedKing = useMemo(
    () => (inCheck(position, position.turn) ? findKing(position, position.turn) : -1),
    [position],
  );

  // Des flèches identiques de contenu mais neuves d'identité (les écrans les
  // reconstruisent à chaque rendu) ne doivent pas redessiner le calque.
  const cleFleches = arrows.map((a) => a.join('>')).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flechesStables = useMemo(() => arrows, [cleFleches]);

  const pieceEnVol = vol ? position.board[vol.depart] : null;
  const tailleVol = cell * 0.92;

  return (
    // La racine n'écrête pas : la pièce en vol dépasse de l'échiquier quand on la
    // porte vers un bord. Le rognage aux coins arrondis est fait par le fond.
    <View
      ref={plateauRef}
      testID="plateau"
      style={[
        { width: size, height: size },
        // au-dessus des voisins (bulle du coach, barre d'actions) le temps du vol
        vol ? styles.enVol : null,
        Platform.OS === 'web' ? STYLE_NAVIGATEUR : null,
      ]}
      {...gestes}
    >
      <View style={[styles.board, { width: size, height: size }]}>
        {(flipped ? ORDRE_RETOURNE : ORDRE).map((carre) => {
          const file = fileOf(carre);
          const rank = rankOf(carre);
          const isDark = (file + rank) % 2 === 0;
          // les repères se lisent sur le bord visible, qui change quand on retourne
          const showFile = flipped ? rank === 7 : rank === 0;
          const showRank = flipped ? file === 7 : file === 0;
          const piece = position.board[carre];

          return (
            <Case
              key={carre}
              carre={carre}
              piece={piece}
              taille={cell}
              fond={isDark ? colors.dark : colors.light}
              couleurRepere={isDark ? colors.light : colors.dark}
              surbrillance={
                selected === carre || lastMove?.from === carre || lastMove?.to === carre
              }
              selectionnee={selected === carre}
              cible={(codesCible[carre] ?? CIBLE_AUCUNE) as CodeCible}
              echec={carre === checkedKing}
              badge={badges[carre] ?? null}
              // le fantôme ne recouvre jamais une pièce : la case s'en charge
              fantome={ghost?.square === carre ? ghost.piece : null}
              repereRang={showCoords && showRank ? String(rank + 1) : null}
              repereColonne={showCoords && showFile ? FILES[file] : null}
              survolee={vol?.sur === carre}
              estompee={vol?.depart === carre}
              surAppui={onPressSquare ? appuyer : undefined}
            />
          );
        })}

        {flechesStables.length > 0 ? (
          <Fleches fleches={flechesStables} size={size} flipped={flipped} />
        ) : null}
      </View>

      {pieceEnVol ? (
        <Animated.View
          pointerEvents="none"
          testID="piece-en-vol"
          style={[
            styles.vol,
            {
              width: tailleVol,
              height: tailleVol,
              left: -tailleVol / 2,
              top: -tailleVol / 2,
              transform: [
                { translateX: positionVol.x },
                { translateY: positionVol.y },
                { scale: ECHELLE_VOL },
              ],
            },
          ]}
        >
          <ChessPiece piece={pieceEnVol} size={tailleVol} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Mémoïsé aussi : un écran qui se re-rend pour une autre raison (minuteur,
 * bulle du coach) et repasse les mêmes props ne coûte alors rien. Les écrans
 * qui reconstruisent `targets` ou `arrows` à chaque rendu re-rendent l'échiquier,
 * mais pas ses cases, qui ne dépendent que de primitives.
 */
export const ChessBoard = memo(ChessBoardBase);

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 4, overflow: 'hidden' },
  enVol: { zIndex: 1000 },
  vol: {
    position: 'absolute',
    boxShadow: '0px 6px 10px rgba(0,0,0,0.35)',
  },
});
