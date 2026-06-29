import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { lbToKg, kgToLb } from '../utils/weightUtils';
import { db } from '../db';
import { exercises } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { SetLogData } from '../db/session';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (data: SetLogData) => void;
  weightUnit: 'kg' | 'lb';
  exerciseId: string;
  setNumber: number;
  side?: 'L' | 'R' | null;
  prefillWeightKg?: number | null;
  prefillReps?: number | null;
  prefillRir?: number | null;
  prefillPartialReps?: number | null;
  prefillPdc?: boolean;
};

export default function SetPerformanceModal({
  visible,
  onClose,
  onSave,
  weightUnit: initialUnit,
  exerciseId,
  setNumber,
  side,
  prefillWeightKg,
  prefillReps,
  prefillRir,
  prefillPartialReps,
  prefillPdc,
}: Props) {
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
  const [note, setNote] = useState('');

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
      reps: parseInt(reps, 10) || null,
      rir: parseInt(rir, 10) || null,
      partialReps: parseInt(partialReps, 10) || null,
      pdc,
      durationSeconds: null,
      restSeconds: null,
      executionSeconds: null,
    };
    onSave(data);
  };

  const sideLabel = side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '';
  const title = `Série ${setNumber}${sideLabel}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheet}
      >
        <View style={styles.handle} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{title}</Text>

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
            <Text style={styles.saveText}>Valider</Text>
          </Pressable>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C7C7CC',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 16,
  },
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
