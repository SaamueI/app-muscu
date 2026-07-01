import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Preset = { id: string; seconds: number; sortOrder: number };

type Props = {
  presets: Preset[];
  lastUsedSeconds: number | null;
  onSelect: (seconds: number) => void;
  onEditPresets: () => void;
};

function secondsToLabel(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}:${String(rem).padStart(2, '0')}`;
}

export default function RestPresetPicker({ presets, lastUsedSeconds, onSelect, onEditPresets }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Temps de repos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {presets.map((p) => {
          const active = p.seconds === lastUsedSeconds;
          return (
            <Pressable
              key={p.id}
              onPress={() => onSelect(p.seconds)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {secondsToLabel(p.seconds)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable onPress={onEditPresets} style={styles.editButton}>
          <Text style={styles.editText}>Modifier</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  chipActive: {
    backgroundColor: '#007AFF',
  },
  chipText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: {
    fontSize: 15,
    color: '#007AFF',
  },
});
