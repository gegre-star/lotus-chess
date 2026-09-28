import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChessPiece } from './ChessPiece';
import { Button, Dialog } from './UI';
import { C } from './theme';
import type { Move, Piece, PieceType } from '../chess/engine';

const NOMS: Record<string, string> = {
  Q: 'Dame',
  R: 'Tour',
  B: 'Fou',
  N: 'Cavalier',
};
const ORDRE: PieceType[] = ['Q', 'R', 'B', 'N'];

interface Props {
  /** Coups de promotion possibles ; `null` ferme la fenêtre. */
  candidats: Move[] | null;
  /** Couleur du pion qui promeut, pour dessiner les pièces du bon camp. */
  blanc: boolean;
  onChoisir: (coup: Move) => void;
  onAnnuler: () => void;
}

/**
 * Choix de la pièce de promotion.
 *
 * Promouvoir d'office en dame supprimait la sous-promotion, qui décide parfois
 * de la partie (un cavalier qui donne mat là où la dame donne pat). Quatre
 * grosses cibles tactiles, la dame en premier : c'est presque toujours le
 * bon choix, donc le plus rapide à atteindre.
 */
export function PromotionDialog({ candidats, blanc, onChoisir, onAnnuler }: Props) {
  return (
    <Dialog visible={candidats !== null} title="Promouvoir en…" onClose={onAnnuler}>
      <View style={styles.rangee}>
        {ORDRE.map((type) => {
          const coup = candidats?.find((m) => m.promotion === type);
          if (!coup) return null;
          const piece = (blanc ? type : type.toLowerCase()) as Piece;
          return (
            <Pressable
              key={type}
              testID={`promotion-${type}`}
              accessibilityRole="button"
              accessibilityLabel={`Promouvoir en ${NOMS[type].toLowerCase()}`}
              onPress={() => onChoisir(coup)}
              style={({ pressed }) => [styles.choix, pressed ? styles.appuye : null]}
            >
              <ChessPiece piece={piece} size={54} />
              <Text style={styles.nom}>{NOMS[type]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="Annuler" variant="neutral" onPress={onAnnuler} style={{ marginTop: 12 }} />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  rangee: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  choix: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: C.surface2,
  },
  appuye: { backgroundColor: C.line },
  nom: { color: C.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
});
