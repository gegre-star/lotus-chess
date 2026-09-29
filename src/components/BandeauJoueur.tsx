import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChessPiece } from './ChessPiece';
import { C } from './theme';
import type { Piece } from '../chess/engine';

interface Props {
  nom: string;
  elo?: number;
  /** Pièces adverses prises par ce joueur, dans l'ordre d'affichage. */
  prises: Piece[];
  /** Avantage matériel de ce joueur en pions ; affiché seulement s'il est positif. */
  avantage: number;
  /** Temps à afficher (« 9:41 »), ou absent sans pendule. */
  temps?: string;
  /** La pendule de ce joueur court. */
  actif?: boolean;
  /** Le temps est presque écoulé. */
  urgent?: boolean;
  testID?: string;
}

/**
 * Bandeau au-dessus et au-dessous de l'échiquier : qui joue, ce qu'il a pris,
 * son avance de matériel, son temps. C'est ce qui donne à l'écran l'allure
 * d'une vraie partie plutôt que d'un plateau nu, et il remplit les 300 pixels
 * vides que l'écran de jeu laissait sur iPhone.
 */
export function BandeauJoueur({ nom, elo, prises, avantage, temps, actif, urgent, testID }: Props) {
  return (
    <View style={styles.ligne} testID={testID}>
      <View style={styles.gauche}>
        <Text style={styles.nom} numberOfLines={1}>
          {nom}
          {elo ? <Text style={styles.elo}>{`  ${elo}`}</Text> : null}
        </Text>
        <View style={styles.prises}>
          {prises.map((p, i) => {
            // les pièces identiques se chevauchent, comme sur chess.com
            const suite = i > 0 && prises[i - 1] === p;
            return (
              <View key={`${p}${i}`} style={{ marginLeft: suite ? -6 : i === 0 ? 0 : 2 }}>
                <ChessPiece piece={p} size={17} />
              </View>
            );
          })}
          {avantage > 0 ? <Text style={styles.avantage}>{`+${avantage}`}</Text> : null}
        </View>
      </View>
      {temps !== undefined ? (
        <View style={[styles.horloge, actif ? styles.horlogeActive : null, urgent ? styles.horlogeUrgente : null]}>
          <Text style={[styles.temps, actif ? styles.tempsActif : null]}>{temps}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 5,
    minHeight: 44,
  },
  gauche: { flex: 1, paddingRight: 8 },
  nom: { color: C.text, fontSize: 14, fontWeight: '800' },
  elo: { color: C.muted, fontSize: 12, fontWeight: '700' },
  prises: { flexDirection: 'row', alignItems: 'center', minHeight: 19, marginTop: 1 },
  avantage: { color: C.muted, fontSize: 12, fontWeight: '800', marginLeft: 6 },
  horloge: {
    minWidth: 78,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: C.surface,
    alignItems: 'center',
  },
  horlogeActive: { backgroundColor: '#ffffff' },
  horlogeUrgente: { backgroundColor: C.red },
  temps: { color: C.muted, fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
  tempsActif: { color: '#262421' },
});
