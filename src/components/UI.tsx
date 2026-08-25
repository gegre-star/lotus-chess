import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { C, S, buttonStyles } from './theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', disabled, style }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        buttonStyles.base,
        buttonStyles[variant],
        { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={buttonStyles.label}>{label}</Text>
    </Pressable>
  );
}

/** Barre d'actions en bas d'écran : trois boutons de largeur égale. */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

interface ActionProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}

export function Action({ label, onPress, primary, disabled }: ActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        primary ? buttonStyles.primary : null,
        { opacity: disabled ? 0.35 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.actionLabel, primary ? { color: '#fff' } : null]}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={S.track}>
      <View style={[S.trackFill, { width: `${ratio * 100}%` }]} />
    </View>
  );
}

interface ListItemProps {
  title: string;
  subtitle?: string;
  done?: boolean;
  onPress: () => void;
  left?: React.ReactNode;
}

export function ListItem({ title, subtitle, done, onPress, left }: ListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, done ? styles.itemDone : null, pressed ? styles.pressed : null]}
    >
      {left ? <View style={styles.itemIcon}>{left}</View> : null}
      <View style={{ flex: 1 }}>
        <Text style={S.itemTitle}>{title}</Text>
        {subtitle ? <Text style={S.itemSub}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>{done ? '✓' : '›'}</Text>
    </Pressable>
  );
}

interface DialogProps {
  visible: boolean;
  title: string;
  message?: string;
  children?: React.ReactNode;
  onClose?: () => void;
}

export function Dialog({ visible, title, message, children, onClose }: DialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          {message ? <Text style={styles.dialogMessage}>{message}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.app,
  },
  action: {
    flex: 1,
    borderRadius: 11,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: C.surface,
  },
  actionLabel: { color: C.muted, fontSize: 13, fontWeight: '800' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
  },
  itemDone: { borderLeftColor: C.green },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: C.surface2 },
  chevron: { color: C.muted2, fontSize: 18, fontWeight: '800' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12,11,10,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { backgroundColor: C.surface, borderRadius: 20, padding: 20, width: '100%', maxWidth: 340 },
  dialogTitle: { color: C.gold, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  dialogMessage: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 16 },
});
