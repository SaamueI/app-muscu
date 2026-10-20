import { eq } from 'drizzle-orm';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { db } from '../db';
import { exercises } from '../db/schema';
import type { SetLogData } from '../db/session';
import { kgToLb, lbToKg } from '../utils/weightUtils';

// Formulaire de saisie d'une série (poids, reps, RIR…), sans coquille de modal.
// Extrait de SetPerformanceModal (amélioration 01b) pour être réutilisé par le modal à
// onglets des séries « à encoder » (PendingSetsModal), un formulaire par onglet.

export type SetPerformanceFormProps = {
  onSave: (data: SetLogData) => void;
  weightUnit: 'kg' | 'lb';
  exerciseId: string;
  title: string;
  // Ligne sous le titre (ex. « Exécution : 0:42 »)
  subtitle?: string | null;
  prefillWeightKg?: number | null;
  prefillReps?: number | null;
  prefillRir?: number | null;
  prefillPartialReps?: number | null;
  prefillPdc?: boolean;
  // Remplie uniquement en édition : une nouvelle série ne reprend pas la note de la précédente
  prefillNote?: string | null;
  saveLabel?: string;
};

// Entier saisi → nombre, champ vide / illisible → null.
// Piège : `parseInt(s) || null` transformerait un 0 (RIR 0, 0 rep partielle) en null,
// car 0 est « falsy » en JavaScript. On teste donc NaN explicitement.
function parseIntOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export default function SetPerformanceForm({
  onSave,
  weightUnit: initialUnit,
  exerciseId,
  title,
  subtitle,
  prefillWeightKg,
  prefillReps,
  prefillRir,
  prefillPartialReps,
  prefillPdc,
  prefillNote,
  saveLabel = 'Valider',
}: SetPerformanceFormProps) {
  const [unit, setUnit] = useState<'kg' | 'lb'>(initialUnit);
  const [weight, setWeight] = useState(
    prefillWeightKg != null
      ? String(initialUnit === 'lb' ? Math.round(kgToLb(prefillWeightKg) * 10) / 10 : prefillWeightKg)
      : ''
  );
  const [reps, setReps] = useState(prefillReps != null ? String(prefillReps) : '');
  const [rir, setRir] = useState(prefillRir != null ? String(prefillRir) : '');
  const [partialReps, setPartialReps] = useState(prefillPartialReps != null ? String(prefillPartialReps) : '');
  const [pdc, setPdc] = useState(prefillPdc ?? false);
  const [note, setNote] = useState(prefillNote ?? '');

  const toggleUnit = async (newUnit: 'kg' | 'lb') => {
    if (newUnit === unit) return;
    // Convertir la valeur affichée
    const current = parseFloat(weight);
    if (!isNaN(current)) {
      const converted = newUnit === 'lb' ? kgToLb(current) : lbToKg(current);
      setWeight(String(Math.round(converted * 10) / 10));
    }
    setUnit(newUnit);
    // Sauvegarder la préférence sur l'exercice
    await db.update(exercises).set({ weightUnit: newUnit }).where(eq(exercises.id, exerciseId));
  };

  const handleSave = () => {
    const weightRaw = parseFloat(weight);
    const weightKg = isNaN(weightRaw) ? null : (unit === 'lb' ? lbToKg(weightRaw) : weightRaw);
    const data: SetLogData = {
      weight: weightKg,
      reps: parseIntOrNull(reps),
      rir: parseIntOrNull(rir),
      partialReps: parseIntOrNull(partialReps),
      pdc,
      durationSeconds: null,
      restSeconds: null,
      executionSeconds: null,
      note: note.trim() || null,
    };
    onSave(data);
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, subtitle ? styles.titleWithSub : null]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      {/* Unité */}
      <View style={styles.unitRow}>
        <Pressable
          onPress={() => toggleUnit('kg')}
          style={[styles.unitChip, unit === 'kg' && styles.unitChipActive]}
        >
          <Text style={[styles.unitText, unit === 'kg' && styles.unitTextActive]}>kg</Text>
        </Pressable>
        <Pressable
          onPress={() => toggleUnit('lb')}
          style={[styles.unitChip, unit === 'lb' && styles.unitChipActive]}
        >
          <Text style={[styles.unitText, unit === 'lb' && styles.unitTextActive]}>lb</Text>
        </Pressable>
      </View>

      {/* Poids */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Poids ({unit})</Text>
        <TextInput
          style={styles.input}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          placeholder="—"
        />
      </View>

      {/* Reps */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Répétitions</Text>
        <TextInput
          style={styles.input}
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          placeholder="—"
        />
      </View>

      {/* RIR */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>RIR</Text>
        <TextInput
          style={styles.input}
          value={rir}
          onChangeText={setRir}
          keyboardType="number-pad"
          placeholder="—"
        />
      </View>

      {/* Reps partielles */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Reps partielles</Text>
        <TextInput
          style={styles.input}
          value={partialReps}
          onChangeText={setPartialReps}
          keyboardType="number-pad"
          placeholder="—"
        />
      </View>

      {/* PDC */}
      <View style={[styles.field, styles.fieldRow]}>
        <Text style={styles.fieldLabel}>Poids de corps</Text>
        <Switch value={pdc} onValueChange={setPdc} />
      </View>

      {/* Note */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Note</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Note optionnelle"
        />
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveText}>{saveLabel}</Text>
      </Pressable>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
  titleWithSub: { marginBottom: 2 },
  subtitle: { fontSize: 14, color: '#8E8E93', marginBottom: 16 },
  unitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  unitChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  unitChipActive: {
    backgroundColor: '#007AFF',
  },
  unitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  unitTextActive: {
    color: '#FFFFFF',
  },
  field: {
    marginBottom: 16,
    gap: 6,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: '#1C1C1E',
    backgroundColor: '#FAFAFA',
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
