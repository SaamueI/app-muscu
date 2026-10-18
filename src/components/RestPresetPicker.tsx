import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import DurationPickerModal from './DurationPickerModal';

type Preset = { id: string; seconds: number; sortOrder: number };

type Props = {
  presets: Preset[];
  // Repos actuellement choisi par l'utilisateur pour cet exercice (null = aucun : on suit le plan)
  overrideSeconds: number | null;
  // Repos prévu par le méso/programme (chip « Prévu … » présélectionnée tant qu'aucun override)
  plannedSeconds: number | null;
  onSelect: (seconds: number) => void;
  onSelectPlanned: () => void;
  onEditPresets: () => void;
};

function secondsToLabel(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}:${String(rem).padStart(2, '0')}`;
}

export default function RestPresetPicker({
  presets,
  overrideSeconds,
  plannedSeconds,
  onSelect,
  onSelectPlanned,
  onEditPresets,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const plannedActive = plannedSeconds != null && overrideSeconds == null;
  // Durée choisie à la volée qui n'est pas l'un des raccourcis : chip dédiée, pour la voir
  const customActive = overrideSeconds != null && !presets.some((p) => p.seconds === overrideSeconds);
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Temps de repos</Text>
      <View style={styles.row}>
        {plannedSeconds != null && (
          <Pressable
            onPress={onSelectPlanned}
            style={[styles.chip, plannedActive && styles.chipActive]}
          >
            <Text style={[styles.chipText, plannedActive && styles.chipTextActive]}>
              Prévu {secondsToLabel(plannedSeconds)}
            </Text>
          </Pressable>
        )}
        {presets.map((p) => {
          const active = p.seconds === overrideSeconds;
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
        {customActive && (
          <Pressable onPress={() => setCustomOpen(true)} style={[styles.chip, styles.chipActive]}>
            <Text style={[styles.chipText, styles.chipTextActive]}>{secondsToLabel(overrideSeconds!)}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setCustomOpen(true)} style={[styles.chip, styles.chipCustom]}>
          <Text style={styles.chipCustomText}>＋ Autre</Text>
        </Pressable>
        <Pressable onPress={onEditPresets} style={styles.editButton}>
          <Text style={styles.editText}>Modifier les raccourcis</Text>
        </Pressable>
      </View>

      <DurationPickerModal
        visible={customOpen}
        title="Temps de repos"
        initialSeconds={overrideSeconds ?? plannedSeconds ?? 90}
        onClose={() => setCustomOpen(false)}
        onConfirm={(seconds) => {
          setCustomOpen(false);
          onSelect(seconds);
        }}
      />
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
    flexWrap: 'wrap',
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
  chipCustom: { backgroundColor: '#E8F0FE' },
  chipCustomText: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  editText: {
    fontSize: 15,
    color: '#007AFF',
  },
});
