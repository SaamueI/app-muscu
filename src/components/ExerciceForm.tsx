import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

// ─── Données de référence ─────────────────────────────────────────────────────

const DEFAULT_MUSCLES = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves',
  'chest', 'forearms', 'glutes', 'hamstrings', 'lats',
  'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders',
  'traps', 'triceps',
];

const DEFAULT_EQUIPMENT = [
  'barbell', 'dumbbell', 'cable', 'machine', 'kettlebells',
  'bands', 'body only', 'e-z curl bar', 'medicine ball', 'exercise ball',
];

const DEFAULT_CATEGORIES = [
  'strength', 'stretching', 'plyometrics', 'strongman',
  'powerlifting', 'cardio', 'olympic weightlifting',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExerciceFormValues {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  description: string;
  measurementType: 'reps' | 'time';
  equipment: string;
  category: string;
  notes: string;
  variations: string[];
  customImageUris: string[];
}

interface Props {
  initial?: Partial<ExerciceFormValues>;
  onSubmit: (values: ExerciceFormValues) => void;
  submitLabel: string;
}

// ─── Sous-composant : sélecteur de chips avec ajout personnalisé ──────────────

interface ChipSelectorProps {
  label: string;
  options: string[];
  selected: string[];
  multiSelect?: boolean;
  onToggle: (item: string) => void;
  activeColor?: string;
}

function ChipSelector({
  label,
  options,
  selected,
  multiSelect = true,
  onToggle,
  activeColor = '#007AFF',
}: ChipSelectorProps) {
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const addCustom = () => {
    const val = inputValue.trim().toLowerCase();
    if (!val) return;
    if (![...options, ...customOptions].includes(val)) {
      setCustomOptions((prev) => [...prev, val]);
    }
    onToggle(val);
    setInputValue('');
    setShowInput(false);
  };

  const allOptions = [...options, ...customOptions];

  return (
    <View style={chipStyles.section}>
      <Text style={chipStyles.label}>{label}</Text>
      <View style={chipStyles.grid}>
        {allOptions.map((item) => {
          const active = selected.includes(item);
          return (
            <Pressable
              key={item}
              style={[chipStyles.chip, active && { backgroundColor: activeColor, borderColor: activeColor }]}
              onPress={() => onToggle(item)}
            >
              <Text style={[chipStyles.chipText, active && chipStyles.chipTextActive]}>{item}</Text>
            </Pressable>
          );
        })}
        {showInput ? (
          <View style={chipStyles.inlineInput}>
            <TextInput
              style={chipStyles.inlineInputField}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Nom…"
              autoFocus
              onSubmitEditing={addCustom}
              returnKeyType="done"
            />
            <Pressable style={chipStyles.inlineConfirm} onPress={addCustom}>
              <Text style={chipStyles.inlineConfirmText}>OK</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={chipStyles.addChip} onPress={() => setShowInput(true)}>
            <Text style={chipStyles.addChipText}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  section: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12, borderRadius: 12, padding: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipText: { fontSize: 13, color: '#444' },
  chipTextActive: { color: '#fff' },
  addChip: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  addChipText: { fontSize: 20, color: '#555', lineHeight: 24 },
  inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineInputField: {
    borderWidth: 1, borderColor: '#007AFF', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, minWidth: 80,
  },
  inlineConfirm: { backgroundColor: '#007AFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  inlineConfirmText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});

// ─── Formulaire principal ─────────────────────────────────────────────────────

export default function ExerciceForm({ initial, onSubmit, submitLabel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [primaryMuscles, setPrimaryMuscles] = useState<string[]>(initial?.primaryMuscles ?? []);
  const [secondaryMuscles, setSecondaryMuscles] = useState<string[]>(initial?.secondaryMuscles ?? []);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [measurementType, setMeasurementType] = useState<'reps' | 'time'>(initial?.measurementType ?? 'reps');
  const [equipment, setEquipment] = useState(initial?.equipment ? [initial.equipment] : [] as string[]);
  const [category, setCategory] = useState(initial?.category ? [initial.category] : [] as string[]);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [variations, setVariations] = useState<string[]>(initial?.variations ?? []);
  const [newVariation, setNewVariation] = useState('');
  const [customImageUris, setCustomImageUris] = useState<string[]>(initial?.customImageUris ?? []);

  const toggleMulti = (list: string[], setList: (v: string[]) => void) => (item: string) => {
    setList(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  };

  const toggleSingle = (list: string[], setList: (v: string[]) => void) => (item: string) => {
    setList(list.includes(item) ? [] : [item]);
  };

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', "L'accès à la galerie est nécessaire pour ajouter des photos.");
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

  const removeImage = (uri: string) => {
    setCustomImageUris((prev) => prev.filter((u) => u !== uri));
  };

  const addVariation = () => {
    const val = newVariation.trim();
    if (!val || variations.includes(val)) return;
    setVariations((prev) => [...prev, val]);
    setNewVariation('');
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      primaryMuscles,
      secondaryMuscles,
      description,
      measurementType,
      equipment: equipment[0] ?? '',
      category: category[0] ?? '',
      notes,
      variations,
      customImageUris,
    });
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Nom */}
      <View style={styles.section}>
        <Text style={styles.label}>Nom *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex : Développé couché"
        />
      </View>

      {/* Mesure */}
      <View style={styles.section}>
        <Text style={styles.label}>Type de mesure</Text>
        <View style={styles.row}>
          <Text style={measurementType === 'reps' ? styles.measureActive : styles.measureInactive}>Répétitions</Text>
          <Switch
            value={measurementType === 'time'}
            onValueChange={(v) => setMeasurementType(v ? 'time' : 'reps')}
          />
          <Text style={measurementType === 'time' ? styles.measureActive : styles.measureInactive}>Durée</Text>
        </View>
      </View>

      {/* Catégorie */}
      <ChipSelector
        label="Catégorie"
        options={DEFAULT_CATEGORIES}
        selected={category}
        multiSelect={false}
        onToggle={toggleSingle(category, setCategory)}
        activeColor="#FF9500"
      />

      {/* Muscles principaux */}
      <ChipSelector
        label="Muscles principaux"
        options={DEFAULT_MUSCLES}
        selected={primaryMuscles}
        onToggle={toggleMulti(primaryMuscles, setPrimaryMuscles)}
        activeColor="#007AFF"
      />

      {/* Muscles secondaires */}
      <ChipSelector
        label="Muscles secondaires"
        options={DEFAULT_MUSCLES}
        selected={secondaryMuscles}
        onToggle={toggleMulti(secondaryMuscles, setSecondaryMuscles)}
        activeColor="#34C759"
      />

      {/* Équipement */}
      <ChipSelector
        label="Équipement"
        options={DEFAULT_EQUIPMENT}
        selected={equipment}
        multiSelect={false}
        onToggle={toggleSingle(equipment, setEquipment)}
        activeColor="#AF52DE"
      />

      {/* Photos */}
      <View style={styles.section}>
        <Text style={styles.label}>Photos</Text>
        <View style={styles.photoRow}>
          {customImageUris.map((uri) => (
            <Pressable key={uri} onLongPress={() => removeImage(uri)} style={styles.photoThumb}>
              <Image source={{ uri }} style={styles.photoThumbImage} />
              <Pressable style={styles.photoRemove} onPress={() => removeImage(uri)}>
                <Text style={styles.photoRemoveText}>×</Text>
              </Pressable>
            </Pressable>
          ))}
          <Pressable style={styles.photoAdd} onPress={pickImages}>
            <Text style={styles.photoAddText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.photoHint}>Appui long sur une photo pour la supprimer</Text>
      </View>

      {/* Description */}
      <View style={styles.section}>
        <Text style={styles.label}>Description / Instructions</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Décris l'exercice…"
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
            <Pressable
              onPress={() => setVariations((prev) => prev.filter((x) => x !== v))}
              style={styles.variationRemove}
            >
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

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.label}>Notes personnelles</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Conseils, variantes…"
          multiline
          numberOfLines={3}
        />
      </View>

      <Pressable
        style={[styles.submitButton, !name.trim() && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!name.trim()}
      >
        <Text style={styles.submitText}>{submitLabel}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  section: { backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12, marginTop: 12, borderRadius: 12, padding: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fafafa' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  measureActive: { fontSize: 15, fontWeight: '600', color: '#007AFF' },
  measureInactive: { fontSize: 15, color: '#aaa' },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
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
  photoHint: { fontSize: 11, color: '#aaa', marginTop: 2 },

  submitButton: {
    backgroundColor: '#007AFF', margin: 12, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginBottom: 40,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },

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
});
