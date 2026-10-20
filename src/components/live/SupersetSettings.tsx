import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { ExKey, RestMode } from '../../utils/supersetSequence';

export type SupersetExerciseSettings = {
  name: string;
  unilateral: boolean;
  // Grisé quand une série de cet exercice est à moitié faite (on ne change pas de mode en cours de série)
  unilateralDisabled: boolean;
  restBetweenSides: boolean;
  halveRest: boolean;
};

type Props = {
  restMode: RestMode;
  onRestModeChange: (mode: RestMode) => void;
  a: SupersetExerciseSettings;
  b: SupersetExerciseSettings;
  onUnilateralChange: (key: ExKey, value: boolean) => void;
  onRestBetweenSidesChange: (key: ExKey, value: boolean) => void;
  onHalveRestChange: (key: ExKey, value: boolean) => void;
  // « Encoder les perfs à la pause » (amélioration 01b)
  deferEncoding: boolean;
  onDeferEncodingChange: (value: boolean) => void;
};

const MODES: { value: RestMode; label: string }[] = [
  { value: 'perExercise', label: 'Entre chaque exercice' },
  { value: 'perRound', label: '1 fois sur 2' },
];

// Une ligne de résumé par exercice unilatéral : « Tirage : unilatéral, repos entre côtés ÷ 2 ».
function summarize(restMode: RestMode, deferEncoding: boolean, exercises: SupersetExerciseSettings[]): string {
  const parts = [restMode === 'perExercise' ? 'Repos entre chaque exercice' : 'Repos 1 fois sur 2'];
  if (deferEncoding) parts.push('perfs encodées à la pause');
  for (const e of exercises) {
    if (!e.unilateral) continue;
    const detail = ['unilatéral'];
    if (e.restBetweenSides) detail.push(e.halveRest ? 'repos entre côtés ÷ 2' : 'repos entre côtés');
    parts.push(`${e.name} : ${detail.join(', ')}`);
  }
  return parts.join(' · ');
}

// Bloc « Réglages du superset » : tout ce qui décide où tombent les repos, regroupé et
// réglable à tout moment. Replié par défaut avec un résumé, pour que les boutons
// Commencer / Terminer restent atteignables sans scroller. Un réglage s'applique à partir
// de la prochaine étape.
export default function SupersetSettings({
  restMode,
  onRestModeChange,
  a,
  b,
  onUnilateralChange,
  onRestBetweenSidesChange,
  onHalveRestChange,
  deferEncoding,
  onDeferEncodingChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const renderExercise = (key: ExKey, e: SupersetExerciseSettings) => (
    <View key={key} style={styles.exerciseBlock}>
      <Text style={styles.exerciseName} numberOfLines={1}>{e.name}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, e.unilateralDisabled && styles.disabledText]}>Unilatéral</Text>
        <Switch
          value={e.unilateral}
          disabled={e.unilateralDisabled}
          onValueChange={(v) => onUnilateralChange(key, v)}
          trackColor={{ true: '#007AFF' }}
        />
      </View>
      {e.unilateral && (
        <View style={[styles.row, styles.indent]}>
          <Text style={styles.label}>Repos entre chaque côté</Text>
          <Switch
            value={e.restBetweenSides}
            onValueChange={(v) => onRestBetweenSidesChange(key, v)}
            trackColor={{ true: '#007AFF' }}
          />
        </View>
      )}
      {e.unilateral && e.restBetweenSides && (
        <View style={[styles.row, styles.indent2]}>
          <Text style={styles.label}>Diviser le repos par 2</Text>
          <Switch
            value={e.halveRest}
            onValueChange={(v) => onHalveRestChange(key, v)}
            trackColor={{ true: '#007AFF' }}
          />
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.section}>
      <Pressable onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.title}>Réglages du superset {expanded ? '▾' : '▸'}</Text>
        {!expanded && <Text style={styles.summary}>{summarize(restMode, deferEncoding, [a, b])}</Text>}
      </Pressable>

      {expanded && (
        <>
          <View style={styles.modeRow}>
            <Text style={styles.label}>Repos</Text>
            {MODES.map((m) => {
              const active = restMode === m.value;
              return (
                <Pressable
                  key={m.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onRestModeChange(m.value)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.row}>
            <View style={styles.labelBlock}>
              <Text style={styles.label}>Encoder les perfs à la pause</Text>
              <Text style={styles.hint}>
                Sans repos après une série, pas de saisie : les séries enchaînées s'encodent au repos suivant.
              </Text>
            </View>
            <Switch value={deferEncoding} onValueChange={onDeferEncodingChange} trackColor={{ true: '#007AFF' }} />
          </View>
          {renderExercise('a', a)}
          {renderExercise('b', b)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summary: { fontSize: 14, color: '#1C1C1E', marginTop: 4 },
  modeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F2F2F7' },
  chipActive: { backgroundColor: '#007AFF' },
  chipText: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  chipTextActive: { color: '#FFFFFF' },
  exerciseBlock: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C6C6C8', paddingTop: 8 },
  exerciseName: { fontSize: 15, fontWeight: '600', color: '#1C1C1E' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  indent: { paddingLeft: 16 },
  indent2: { paddingLeft: 32 },
  label: { fontSize: 14, color: '#1C1C1E' },
  labelBlock: { flex: 1, paddingRight: 8 },
  hint: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  disabledText: { color: '#8E8E93' },
});
