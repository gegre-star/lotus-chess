import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { CoachId } from '../chess/content';

export type BubbleTone = 'neutral' | 'ok' | 'bad';

interface CoachInfo {
  name: string;
  role: string;
  avatar: (size: number) => React.ReactNode;
}

/** Les trois entraîneurs de l'application. */
export const COACHES: Record<CoachId, CoachInfo> = {
  lotus: {
    name: 'Maître Lotus',
    role: 'entraîneur',
    avatar: (size) => (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} fill="#3d5a45" />
        <Path d="M12 64c0-11 9-17 20-17s20 6 20 17z" fill="#2f6f5e" />
        <Circle cx={32} cy={28} r={15} fill="#e8bf9a" />
        <Path d="M17 28c0-12 7-17 15-17s15 5 15 17c0-6-6-8-15-8s-15 2-15 8z" fill="#d9d5cd" />
        <Path d="M20 36c2 8 6 12 12 12s10-4 12-12c0 10-4 15-12 15s-10-5-12-15z" fill="#d9d5cd" />
        <Circle cx={26} cy={28} r={2} fill="#2b2721" />
        <Circle cx={38} cy={28} r={2} fill="#2b2721" />
        <Path d="M27 36h10" stroke="#b98a68" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    ),
  },
  nina: {
    name: 'Nina',
    role: 'tacticienne',
    avatar: (size) => (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} fill="#4a3d5a" />
        <Path d="M12 64c0-11 9-17 20-17s20 6 20 17z" fill="#e8a33d" />
        <Circle cx={32} cy={29} r={14} fill="#f0c9a5" />
        <Path d="M18 30c-1-14 6-19 14-19s15 5 14 19c-2-7-6-9-14-9s-12 2-14 9z" fill="#3b2b22" />
        <Path d="M46 24c5 2 6 8 4 13-3-4-4-9-4-13z" fill="#3b2b22" />
        <Circle cx={26} cy={29} r={2} fill="#2b2721" />
        <Circle cx={38} cy={29} r={2} fill="#2b2721" />
        <Path d="M28 36c2 2 6 2 8 0" stroke="#c9836a" strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    ),
  },
  robi: {
    name: 'Robi',
    role: 'moteur',
    avatar: (size) => (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Rect width={64} height={64} fill="#2f4a5a" />
        <Rect x={16} y={20} width={32} height={26} rx={8} fill="#b9c4cc" />
        <Rect x={22} y={28} width={8} height={7} rx={3} fill="#5b9fd6" />
        <Rect x={34} y={28} width={8} height={7} rx={3} fill="#5b9fd6" />
        <Rect x={26} y={40} width={12} height={3} rx={1.5} fill="#7d8791" />
        <Path d="M32 20v-6" stroke="#b9c4cc" strokeWidth={3} />
        <Circle cx={32} cy={12} r={3.5} fill="#81b64c" />
        <Rect x={10} y={28} width={6} height={10} rx={3} fill="#7d8791" />
        <Rect x={48} y={28} width={6} height={10} rx={3} fill="#7d8791" />
      </Svg>
    ),
  },
};

interface CoachBubbleProps {
  coach: CoachId;
  text: string;
  tone?: BubbleTone;
}

export function CoachBubble({ coach, text, tone = 'neutral' }: CoachBubbleProps) {
  const info = COACHES[coach];
  const nameColor = tone === 'ok' ? '#4d7a2e' : tone === 'bad' ? '#c0362c' : '#22201d';
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>{info.avatar(52)}</View>
      <View style={styles.bubble}>
        <View style={styles.tail} />
        <Text style={styles.who}>
          <Text style={[styles.name, { color: nameColor }]}>{info.name}</Text>
          <Text style={styles.role}>{`  ${info.role}`}</Text>
        </Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 14, paddingVertical: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: '#3b3835' },
  bubble: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 11, minHeight: 52 },
  // petite pointe qui relie la bulle à l'avatar
  tail: {
    position: 'absolute',
    left: -6,
    top: 16,
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderRightWidth: 7,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#fff',
  },
  who: { marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '800' },
  role: { fontSize: 11, color: '#6d6862', fontWeight: '700' },
  text: { fontSize: 15, color: '#22201d', fontWeight: '600', lineHeight: 20 },
});
