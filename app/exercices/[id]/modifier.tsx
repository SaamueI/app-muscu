import * as ImagePicker from 'expo-image-picker';
import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ExerciceForm, { ExerciceFormValues } from '../../../src/components/ExerciceForm';
import { db } from '../../../src/db';
import { exercises } from '../../../src/db/schema';

type Exercise = typeof exercises.$inferSelect;

// ─── Formulaire restreint (exercices du dataset) ──────────────────────────────

function RestrictedEditForm({ exercise }: { exercise: Exercise }) {
  const router = useRouter();
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [variations, setVariations] = useState<string[]>(
    (exercise.variations as string[] | null) ?? []
  );
  const [customImageUris, setCustomImageUris] = useState<string[]>(
    (exercise.customImageUris as string[] | null) ?? []
  );
  const [newVariation, setNewVariation] = useState('');

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setCustomImageUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const addVariation = () => {
    const val = newVariation.trim();
    if (!val || variations.includes(val)) return;
    setVariations((prev) => [...prev, val]);
    setNewVariation('');
  };

  const removeVariation = (v: string) => {
    setVariations((prev) => prev.filter((x) => x !== v));
  };

  const handleSave = async () => {
    await db
      .update(exercises)
      .set({
        notes: notes || null,
        variations: variations.length > 0 ? variations : null,
        customImageUris: customImageUris.length > 0 ? customImageUris : null,
      })
      .where(eq(exercises.id, exercise.id));
    router.back();
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.hint}>
        Les exercices prédéfinis ne peuvent pas être modifiés en profondeur.
        Tu peux ajouter des photos, des notes et des variations.
      </Text>

      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos personnelles</Text>
        <View style={styles.photoRow}>
          {customImageUris.map((uri) => (
            <View key={uri} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoThumbImage} />
              <Pressable
                style={styles.photoRemove}
                onPress={() => setCustomImageUris((prev) => prev.filter((u) => u !== uri))}
              >
                <Text style={styles.photoRemoveText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.photoAdd} onPress={pickImages}>
            <Text style={styles.photoAddText}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.label}>Notes personnelles</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Conseils, ressentis, points d'attention…"
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Variations */}
      <View style={styles.section}>
        <Text style={styles.label}>Variations</Text>
        {variations.map((v) => (
          <View key={v} style={styles.variationRow}>
            <Text style={styles.variationText}>{v}</Text>
            <Pressable onPress={() => removeVariation(v)} style={styles.variationRemove}>
              <Text style={styles.variationRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.addVariationRow}>
          <TextInput
            style={[styles.input, styles.addVariationInput]}
            value={newVariation}
            onChangeText={setNewVariation}
            placeholder="Ex : 30°, prise neutre, unilatéral…"
            onSubmitEditing={addVariation}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.addVariationButton, !newVariation.trim() && styles.addVariationDisabled]}
            onPress={addVariation}
            disabled={!newVariation.trim()}
          >
            <Text style={styles.addVariationButtonText}>Ajouter</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Enregistrer</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Écran principal ──────────────────────────────────────────────────────────

export default function ModifierExerciceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);

  useEffect(() => {
    if (!id) return;
    db.select()
      .from(exercises)
      .where(eq(exercises.id, id))
      .then(([row]) => setExercise(row ?? null));
  }, [id]);

  const handleFullSubmit = async (values: ExerciceFormValues) => {
    await db
      .update(exercises)
      .set({
        name: values.name,
        primaryMuscles: values.primaryMuscles,
        secondaryMuscles: values.secondaryMuscles.length > 0 ? values.secondaryMuscles : null,
        description: values.description || null,
        measurementType: values.measurementType,
        equipment: values.equipment || null,
        category: values.category || null,
        notes: values.notes || null,
        weightUnit: values.weightUnit ?? null,
        variations: values.variations.length > 0 ? values.variations : null,
        customImageUris: values.customImageUris.length > 0 ? values.customImageUris : null,
      })
      .where(eq(exercises.id, id!));
    router.back();
  };

  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  if (!exercise.isCustom) {
    return <RestrictedEditForm exercise={exercise} />;
  }

  return (
    <ExerciceForm
      initial={{
        name: exercise.name,
        primaryMuscles: exercise.primaryMuscles as string[],
        secondaryMuscles: (exercise.secondaryMuscles as string[] | null) ?? [],
        description: exercise.description ?? '',
        measurementType: exercise.measurementType,
        weightUnit: (exercise.weightUnit as 'kg' | 'lb' | null) ?? null,
        equipment: exercise.equipment ?? '',
        category: exercise.category ?? '',
        notes: exercise.notes ?? '',
        variations: (exercise.variations as string[] | null) ?? [],
        customImageUris: (exercise.customImageUris as string[] | null) ?? [],
      }}
      onSubmit={handleFullSubmit}
      submitLabel="Enregistrer"
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: {
    margin: 16, marginBottom: 4, fontSize: 13, color: '#888',
    fontStyle: 'italic', lineHeight: 18,
  },
  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12,
    marginTop: 12, borderRadius: 12, padding: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fafafa' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden' },
  photoThumbImage: { width: 80, height: 80 },
  photoRemove: {
    position: 'absolute', top: 2, right: 2, width: 20, height: 20,
    borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 14, lineHeight: 18 },
  photoAdd: {
    width: 80, height: 80, borderRadius: 8, backgroundColor: '#f0f0f0',
    borderWidth: 1.5, borderColor: '#ccc', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddText: { fontSize: 32, color: '#999' },

  variationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  variationText: { fontSize: 15, color: '#222', flex: 1 },
  variationRemove: { paddingHorizontal: 8, paddingVertical: 4 },
  variationRemoveText: { fontSize: 20, color: '#aaa', lineHeight: 22 },

  addVariationRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  addVariationInput: { flex: 1 },
  addVariationButton: {
    backgroundColor: '#007AFF', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  addVariationDisabled: { opacity: 0.4 },
  addVariationButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  saveButton: {
    backgroundColor: '#007AFF', margin: 16, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 40,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
