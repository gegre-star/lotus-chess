import React from 'react';
import { Text, View } from 'react-native';
import { Tabs } from 'expo-router';
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

export default function ChessLayout() {
  return (
    <ProgressProvider>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: C.app },
          headerTitleStyle: { color: C.text, fontWeight: '800' },
          headerTintColor: C.text,
          tabBarStyle: { backgroundColor: C.surface, borderTopColor: 'rgba(255,255,255,0.06)' },
          tabBarActiveTintColor: C.green,
          tabBarInactiveTintColor: C.muted2,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '800' },
        }}
      >
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
          name="play"
          options={{ title: 'Jouer', tabBarIcon: icon('⚔') }}
        />
      </Tabs>
      <TrophyCelebration />
    </ProgressProvider>
  );
}
