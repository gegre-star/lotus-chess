import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BOARD_THEMES, ChessBoard } from '../src/components/ChessBoard';
import { Button, Chips, Dialog } from '../src/components/UI';
import { C, S } from '../src/components/theme';
import { useProgress } from '../src/chess/ProgressContext';
import type { BoardTheme } from '../src/chess/progress';
import { START_FEN, parseFEN } from '../src/chess/engine';
import { jouerSon } from '../src/son';

const NOMS_THEMES: Record<BoardTheme, string> = {
  foret: 'Forêt',
  ocean: 'Océan',
  bois: 'Bois',
  nuit: 'Nuit',
};

type OuiNon = 'oui' | 'non';
const OUI_NON: { valeur: OuiNon; libelle: string }[] = [
  { valeur: 'oui', libelle: 'Oui' },
  { valeur: 'non', libelle: 'Non' },
];

const DEPART = parseFEN(START_FEN);

/** Safari sur iPhone ne sait pas faire vibrer une page web : on le dit plutôt que de laisser un réglage inerte. */
const vibrationPossible = typeof navigator !== 'undefined' && 'vibrate' in navigator;

const LIENS = [
  ['Stockfish (code source)', 'https://github.com/official-stockfish/Stockfish'],
  ['Version WebAssembly de Stockfish', 'https://github.com/nmrugg/stockfish.js'],
  ['Code de Lotus Chess', 'https://github.com/gegre-star/lotus-chess'],
] as const;

export default function SettingsScreen() {
  const { progress, setSettings, reset, avertissement } = useProgress();
  const r = progress.settings;
  const [confirmation, setConfirmation] = useState(false);

  return (
    <ScrollView style={S.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      {avertissement ? (
        <View style={[S.pad, { paddingTop: 12 }]}>
          <View style={[S.card, { borderColor: C.red, borderWidth: 1 }]}>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: '700' }}>{avertissement}</Text>
          </View>
        </View>
      ) : null}

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Échiquier</Text>
        <Text style={S.sectionMeta}>{NOMS_THEMES[r.board]}</Text>
      </View>
      <View style={[S.pad, { gap: 12 }]}>
        <Chips<BoardTheme>
          testID="theme"
          valeur={r.board}
          onChange={(board) => setSettings({ board })}
          options={(Object.keys(NOMS_THEMES) as BoardTheme[]).map((valeur) => ({
            valeur,
            libelle: NOMS_THEMES[valeur],
          }))}
        />
        <View style={{ alignItems: 'center' }}>
          <ChessBoard position={DEPART} size={220} theme={r.board} showCoords={r.coords} />
        </View>
        <View style={styles.palette}>
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((t) => (
            <View key={t} style={styles.pastille}>
              <View style={{ flex: 1, backgroundColor: BOARD_THEMES[t].light }} />
              <View style={{ flex: 1, backgroundColor: BOARD_THEMES[t].dark }} />
            </View>
          ))}
        </View>
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Affichage</Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <Text style={S.itemSub}>Coordonnées sur l’échiquier (a–h, 1–8)</Text>
        <Chips<OuiNon>
          testID="coords"
          valeur={r.coords ? 'oui' : 'non'}
          onChange={(v) => setSettings({ coords: v === 'oui' })}
          options={OUI_NON}
        />
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Sons</Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <Text style={S.itemSub}>Bruit des coups</Text>
        <Chips<OuiNon>
          testID="son"
          valeur={r.sound ? 'oui' : 'non'}
          onChange={(v) => {
            setSettings({ sound: v === 'oui' });
            // un aperçu à l'activation : sur iPhone le son ne démarre qu'après un geste
            if (v === 'oui') jouerSon('prise', { sound: true, vibration: false });
          }}
          options={OUI_NON}
        />
        <Text style={[S.itemSub, { marginTop: 6 }]}>Vibration à chaque coup</Text>
        <Chips<OuiNon>
          testID="vibration"
          valeur={r.vibration ? 'oui' : 'non'}
          onChange={(v) => setSettings({ vibration: v === 'oui' })}
          options={OUI_NON}
        />
        {!vibrationPossible ? (
          <Text style={styles.note}>
            Ce navigateur ne permet pas de faire vibrer l’appareil (c’est le cas de Safari sur
            iPhone). Le réglage sera pris en compte sur Android.
          </Text>
        ) : null}
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>Mes données</Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <Text style={styles.note}>
          Ta progression est enregistrée sur cet appareil, dans ce navigateur. Elle n’est envoyée
          nulle part.
        </Text>
        <Button label="Réinitialiser ma progression" variant="danger" onPress={() => setConfirmation(true)} />
      </View>

      <View style={S.sectionRow}>
        <Text style={S.sectionTitle}>À propos</Text>
      </View>
      <View style={[S.pad, { gap: 8 }]}>
        <Text style={styles.note}>
          Lotus Chess apprend les échecs pas à pas. Les adversaires jouent avec un moteur maison ;
          Stockfish 18, moteur libre sous licence GPL v3, sert à l’analyse de tes parties et aux
          niveaux « Stockfish ». Il tourne dans ton navigateur, sans rien envoyer à un serveur.
        </Text>
        {LIENS.map(([titre, url]) => (
          <Pressable
            key={url}
            accessibilityRole="link"
            onPress={() => void Linking.openURL(url)}
            style={styles.lien}
          >
            <Text style={styles.lienTexte}>{titre}</Text>
            <Text style={styles.lienUrl}>{url.replace('https://', '')}</Text>
          </Pressable>
        ))}
      </View>

      <Dialog
        visible={confirmation}
        title="Tout effacer ?"
        message="Points, leçons, problèmes, trophées et classement seront remis à zéro. Cette action est définitive."
        onClose={() => setConfirmation(false)}
      >
        <View style={{ gap: 8 }}>
          <Button
            label="Oui, tout effacer"
            variant="danger"
            onPress={() => {
              reset();
              setConfirmation(false);
            }}
          />
          <Button label="Annuler" variant="neutral" onPress={() => setConfirmation(false)} />
        </View>
      </Dialog>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  palette: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  pastille: { width: 34, height: 22, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  lien: { backgroundColor: C.surface, borderRadius: 10, padding: 10 },
  lienTexte: { color: C.text, fontSize: 13, fontWeight: '800' },
  lienUrl: { color: C.blue, fontSize: 11, marginTop: 2 },
});
