import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChessPiece } from './ChessPiece';
import { squareName, type Piece } from '../chess/engine';

export type SquareBadge = 'good' | 'bad';

/** Ce que la case dessine pour un coup possible : rien, une pastille, ou un anneau de capture. */
export const CIBLE_AUCUNE = 0;
export const CIBLE_COUP = 1;
export const CIBLE_CAPTURE = 2;
export type CodeCible = typeof CIBLE_AUCUNE | typeof CIBLE_COUP | typeof CIBLE_CAPTURE;

const HIGHLIGHT = 'rgba(247,247,105,0.58)';
const CHECK = 'rgba(228,87,76,0.55)';
const DOT = 'rgba(20,20,16,0.20)';
const SURVOL_FOND = 'rgba(255,255,255,0.28)';
const SURVOL_CADRE = 'rgba(255,255,255,0.9)';

/**
 * Sonde de rendu, pour les tests uniquement.
 *
 * Prouver qu'un `React.memo` sert à quelque chose demande de compter les
 * rendus réels d'une case, et ce compteur n'est observable de nulle part
 * ailleurs : les props de `Case` sont des primitives, un test ne peut pas
 * les « voir » re-rendre. Le crochet reste `null` en production, le coût est
 * un test de nullité par rendu de case.
 */
export const sondeRendu: { surRendu: ((carre: number) => void) | null } = { surRendu: null };

const NOM_PIECE: Record<string, string> = {
  k: 'roi',
  q: 'dame',
  r: 'tour',
  b: 'fou',
  n: 'cavalier',
  p: 'pion',
};
/** Le féminin s'accorde avec la pièce : « dame blanche », « tour noire ». */
const FEMININ = new Set(['q', 'r']);

/** « pion blanc », « dame noire »… ou « vide ». */
export function nomPiece(piece: Piece | null): string {
  if (!piece) return 'vide';
  const type = piece.toLowerCase();
  const blanc = piece === piece.toUpperCase();
  const couleur = blanc ? 'blanc' : 'noir';
  return `${NOM_PIECE[type]} ${FEMININ.has(type) ? `${couleur}${blanc ? 'he' : 'e'}` : couleur}`;
}

/**
 * Libellé lu par le lecteur d'écran : « e4, pion blanc », « e5, vide », avec
 * l'état ajouté à la fin quand il y en a un.
 *
 * Sans libellé, VoiceOver annonçait 64 boutons sans nom : impossible de savoir
 * où l'on est, ni ce qu'une case contient. On place la case d'abord parce que
 * c'est ce qu'on cherche en explorant l'échiquier au doigt.
 */
export function libelleCase(
  carre: number,
  piece: Piece | null,
  etat: { selectionnee?: boolean; cible?: number; echec?: boolean } = {},
): string {
  const parts = [squareName(carre), nomPiece(piece)];
  if (etat.selectionnee) parts.push('sélectionnée');
  if (etat.cible) parts.push('coup possible');
  if (etat.echec) parts.push('roi en échec');
  return parts.join(', ');
}

export interface CaseProps {
  carre: number;
  piece: Piece | null;
  taille: number;
  /** Couleurs de la case et de son repère, déjà résolues : des chaînes, comparables par valeur. */
  fond: string;
  couleurRepere: string;
  surbrillance: boolean;
  selectionnee: boolean;
  cible: CodeCible;
  echec: boolean;
  badge: SquareBadge | null;
  /** Pièce estompée laissée par le dernier coup adverse, seulement si la case est vide. */
  fantome: Piece | null;
  /** Repères de rang / colonne à afficher sur cette case, ou `null`. */
  repereRang: string | null;
  repereColonne: string | null;
  /** Case sous le doigt pendant un glissement. */
  survolee: boolean;
  /** Pièce que l'on est en train de glisser : elle reste, mais estompée. */
  estompee: boolean;
  /** Un seul gestionnaire pour tout l'échiquier : la case lui donne son index. */
  surAppui?: (carre: number) => void;
}

/**
 * Une case de l'échiquier.
 *
 * Toutes ses props sont des primitives, et `surAppui` est stable : c'est ce qui
 * permet à `React.memo` de sauter la case quand rien ne la concerne. Avant,
 * chacune des 64 cases recréait sa closure `onPress` et son tableau de styles à
 * chaque rendu de l'échiquier — donc à chaque tic de minuteur de l'écran.
 */
export const Case = memo(function Case({
  carre,
  piece,
  taille,
  fond,
  couleurRepere,
  surbrillance,
  selectionnee,
  cible,
  echec,
  badge,
  fantome,
  repereRang,
  repereColonne,
  survolee,
  estompee,
  surAppui,
}: CaseProps) {
  sondeRendu.surRendu?.(carre);

  const appuyer = useCallback(() => surAppui?.(carre), [surAppui, carre]);

  return (
    <Pressable
      testID={`square-${squareName(carre)}`}
      onPress={surAppui ? appuyer : undefined}
      // le rôle et le libellé n'ajoutent aucune zone : la case garde sa taille
      accessibilityRole="button"
      accessibilityLabel={libelleCase(carre, piece, { selectionnee, cible, echec })}
      accessibilityState={{ selected: selectionnee }}
      style={[styles.square, { width: taille, height: taille, backgroundColor: fond }]}
    >
      {surbrillance ? <View style={[styles.fill, { backgroundColor: HIGHLIGHT }]} /> : null}
      {echec && !badge ? <View style={[styles.fill, { backgroundColor: CHECK }]} /> : null}
      {survolee ? (
        <View
          style={[
            styles.fill,
            styles.survol,
            { borderWidth: Math.max(2, taille * 0.06) },
          ]}
        />
      ) : null}

      {repereRang ? (
        <Text style={[styles.coord, styles.coordRank, { color: couleurRepere }]}>{repereRang}</Text>
      ) : null}
      {repereColonne ? (
        <Text style={[styles.coord, styles.coordFile, { color: couleurRepere }]}>
          {repereColonne}
        </Text>
      ) : null}

      {piece ? <ChessPiece piece={piece} size={taille * 0.92} opacite={estompee ? 0.3 : 1} /> : null}
      {!piece && fantome ? (
        <View style={styles.ghost} testID={`ghost-${squareName(carre)}`}>
          <ChessPiece piece={fantome} size={taille * 0.92} />
        </View>
      ) : null}

      {cible === CIBLE_COUP ? (
        <View
          style={[
            styles.dot,
            { width: taille * 0.3, height: taille * 0.3, borderRadius: taille * 0.15 },
          ]}
        />
      ) : null}
      {cible === CIBLE_CAPTURE ? (
        <View
          style={[
            styles.ring,
            {
              width: taille * 0.92,
              height: taille * 0.92,
              borderRadius: taille * 0.46,
              borderWidth: taille * 0.08,
            },
          ]}
        />
      ) : null}

      {badge ? (
        <View
          style={[
            styles.badge,
            {
              width: taille * 0.36,
              height: taille * 0.36,
              borderRadius: taille * 0.18,
              backgroundColor: badge === 'good' ? '#81b64c' : '#e4574c',
            },
          ]}
        >
          <Text style={[styles.badgeText, { fontSize: taille * 0.22 }]}>
            {badge === 'good' ? '✓' : '✕'}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  ghost: { position: 'absolute', opacity: 0.35 },
  square: { alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject },
  survol: { backgroundColor: SURVOL_FOND, borderColor: SURVOL_CADRE },
  dot: { position: 'absolute', backgroundColor: DOT },
  ring: { position: 'absolute', borderColor: DOT },
  coord: { position: 'absolute', fontSize: 9, fontWeight: '800' },
  coordRank: { top: 1, left: 3 },
  coordFile: { bottom: 0, right: 3 },
  badge: { position: 'absolute', top: -2, right: -2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800' },
});
