import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProgressProvider, useProgress } from '../src/chess/ProgressContext';
import { TROPHY_LABEL } from '../src/components/trophies';
import { Button, Dialog } from '../src/components/UI';
import { C } from '../src/components/theme';

/** Fenêtre de félicitations, affichée dès qu'un trophée est débloqué. */
function TrophyCelebration() {
  const { celebrating, dismissCelebration } = useProgress();
  return (
    <Dialog
      visible={celebrating !== null}
      title="Trophée débloqué !"
      onClose={dismissCelebration}
    >
      {celebrating ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 48 }}>{TROPHY_LABEL[celebrating.art] ?? '🏆'}</Text>
          <Text style={{ color: C.text, fontSize: 17, fontWeight: '800', marginTop: 8 }}>
            {celebrating.name}
          </Text>
          <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 16 }}>
            {celebrating.desc}
          </Text>
          <Button label="Super !" onPress={dismissCelebration} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : null}
    </Dialog>
  );
}

const icon = (glyph: string) => ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 18 }}>{glyph}</Text>
);

/** Engrenage des réglages, en haut à droite de chaque écran. */
function BoutonReglages() {
  const router = useRouter();
  return (
    <Pressable
      testID="ouvrir-reglages"
      accessibilityRole="button"
      accessibilityLabel="Réglages"
      onPress={() => router.push('/settings')}
      style={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <Text style={{ fontSize: 20 }}>⚙️</Text>
    </Pressable>
  );
}

export default function ChessLayout() {
  // Les libellés étaient rognés en bas de l'écran : la hauteur par défaut de la
  // barre ne laisse pas la place d'une icône, d'un libellé et de la zone
  // réservée aux gestes de l'iPhone (encoche, barre d'accueil).
  const insets = useSafeAreaInsets();
  return (
    <ProgressProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: C.app },
          headerTitleStyle: { color: C.text, fontWeight: '800' },
          headerTintColor: C.text,
          headerRight: () => <BoutonReglages />,
          tabBarStyle: {
            backgroundColor: C.surface,
            borderTopColor: 'rgba(255,255,255,0.06)',
            // l'icône (28 px) et le libellé (14 px) doivent tenir dans la hauteur
            // de l'onglet, marges internes comprises : à 60 px le libellé était
            // écrasé à 9 px de haut et rogné (« Jouer » devenait « louer »)
            height: 68 + insets.bottom,
            paddingTop: 4,
            paddingBottom: 4 + insets.bottom,
          },
          tabBarActiveTintColor: C.green,
          tabBarInactiveTintColor: C.muted2,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
        }}
      >
        {/* Route de repli : c'est un écran comme un autre pour le routeur, qui
            lui ajoutait donc un onglet « +not-found » et tronquait les libellés
            des cinq vrais. `href: null` la garde atteignable sans la lister. */}
        <Tabs.Screen name="+not-found" options={{ href: null }} />
        {/* Atteignable depuis « Apprendre » : un sixième onglet tronquerait
            les libellés des cinq autres. */}
        <Tabs.Screen name="games" options={{ href: null, title: 'Parties de maîtres' }} />
        <Tabs.Screen name="settings" options={{ href: null, title: 'Réglages' }} />
        <Tabs.Screen name="finales" options={{ href: null, title: 'Pratique des finales' }} />
        <Tabs.Screen
          name="index"
          options={{ title: 'Accueil', tabBarIcon: icon('♟') }}
        />
        <Tabs.Screen
          name="puzzles"
          options={{ title: 'Problèmes', tabBarIcon: icon('🧩') }}
        />
        <Tabs.Screen
          name="learn"
          options={{ title: 'Apprendre', tabBarIcon: icon('🎓') }}
        />
        <Tabs.Screen
          name="train"
          options={{ title: 'S’entraîner', tabBarLabel: 'Exercices', tabBarIcon: icon('⚖️') }}
        />
        <Tabs.Screen
          name="play"
          options={{ title: 'Jouer', tabBarIcon: icon('⚔') }}
        />
      </Tabs>
      <TrophyCelebration />
    </ProgressProvider>
  );
}
