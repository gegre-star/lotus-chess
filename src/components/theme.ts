import { StyleSheet } from 'react-native';

/** Palette sombre de Lotus Chess, commune à tous les écrans. */
export const C = {
  bg: '#21201d',
  app: '#262421',
  surface: '#312e2b',
  surface2: '#3b3835',
  line: '#4a4643',
  text: '#ffffff',
  muted: '#a5a19c',
  muted2: '#78736e',
  green: '#81b64c',
  greenDark: '#5d8f34',
  gold: '#e8a33d',
  red: '#e4574c',
  blue: '#5b9fd6',
} as const;

export const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.app },
  pad: { paddingHorizontal: 14 },
  title: { color: C.text, fontSize: 19, fontWeight: '800' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  sectionMeta: { color: C.muted, fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 14, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
  itemSub: { color: C.muted, fontSize: 12 },
  muted: { color: C.muted, fontSize: 13 },
  center: { alignItems: 'center', justifyContent: 'center' },
  track: { height: 11, borderRadius: 6, backgroundColor: '#1b1a18', overflow: 'hidden', flex: 1 },
  trackFill: { height: '100%', borderRadius: 6, backgroundColor: C.green },
  statValue: { color: C.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
});

/** Bouton principal de l'application, avec son ombre portée « en relief ». */
export const buttonStyles = StyleSheet.create({
  base: {
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: C.green, borderBottomWidth: 3, borderBottomColor: C.greenDark },
  neutral: { backgroundColor: C.surface2, borderBottomWidth: 3, borderBottomColor: '#2a2724' },
  danger: { backgroundColor: C.red, borderBottomWidth: 3, borderBottomColor: '#8e2f28' },
  label: { color: C.text, fontSize: 15, fontWeight: '800' },
});
