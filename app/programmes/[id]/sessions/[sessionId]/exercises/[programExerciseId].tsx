import { desc, eq, inArray } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import exerciseImages from '../../../../../../src/db/exerciseImages';
import { consumePendingAlt } from '../../../../../../src/utils/altPickerStore';

const SCREEN_WIDTH = Dimensions.get('window').width;

import { db } from '../../../../../../src/db';
import {
  exercises,
  exerciseLogs,
  programExercises,
  setLogs,
  workoutSessions,
} from '../../../../../../src/db/schema';

type ProgramExercise = typeof programExercises.$inferSelect;
type Exercise = typeof exercises.$inferSelect;
type SetLog = typeof setLogs.$inferSelect;

type HistoryEntry = {
  date: string;
  sets: (SetLog & { setIndex: number })[];
};

export default function ProgramExerciceDetailScreen() {
  const { id, sessionId, programExerciseId } = useLocalSearchParams<{
    id: string;
    sessionId: string;
    programExerciseId: string;
  }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [pe, setPe] = useState<ProgramExercise | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [alternatives, setAlternatives] = useState<Exercise[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [editMode, setEditMode] = useState(false);

  // Alternatives edit state
  const [editAltIds, setEditAltIds] = useState<string[]>([]);
  const [editAlts, setEditAlts] = useState<Exercise[]>([]);

  // Edit state mirrors all target fields + selectedVariation
  const [selectedVariation, setSelectedVariation] = useState('');
  const [customVariation, setCustomVariation] = useState('');
  const [showVariationInput, setShowVariationInput] = useState(false);
  const [setsMin, setSetsMin] = useState('');
  const [setsMax, setSetsMax] = useState('');
  const [repsMin, setRepsMin] = useState('');
  const [repsMax, setRepsMax] = useState('');
  const [weightMin, setWeightMin] = useState('');
  const [weightMax, setWeightMax] = useState('');
  const [rirMin, setRirMin] = useState('');
  const [rirMax, setRirMax] = useState('');
  const [restSeconds, setRestSeconds] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [tempo, setTempo] = useState('');

  const load = useCallback(async () => {
    if (!programExerciseId) return;

    const [row] = await db
      .select({ pe: programExercises, exercise: exercises })
      .from(programExercises)
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(eq(programExercises.id, programExerciseId));

    if (!row) return;
    setPe(row.pe);
    setExercise(row.exercise);

    // Load alternative exercises
    const altIds = (row.pe.alternativeExerciseIds as string[] | null) ?? [];
    let alts: Exercise[] = [];
    if (altIds.length > 0) {
      alts = await db.select().from(exercises).where(inArray(exercises.id, altIds));
    }
    setAlternatives(alts);
    setEditAltIds(altIds);
    setEditAlts(alts);

    // Load performance history
    const logs = await db
      .select({ el: exerciseLogs, ws: workoutSessions, sl: setLogs })
      .from(exerciseLogs)
      .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
      .innerJoin(setLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
      .where(eq(exerciseLogs.programExerciseId, programExerciseId))
      .orderBy(desc(workoutSessions.date));

    // Group by date
    const grouped: Record<string, (SetLog & { setIndex: number })[]> = {};
    for (const { ws, sl } of logs) {
      if (!grouped[ws.date]) grouped[ws.date] = [];
      grouped[ws.date].push({ ...sl, setIndex: grouped[ws.date].length + 1 });
    }
    setHistory(
      Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, sets]) => ({ date, sets }))
    );

    // Init edit state
    setSelectedVariation(row.pe.selectedVariation ?? '');
    setSetsMin(row.pe.targetSetsMin?.toString() ?? '');
    setSetsMax(row.pe.targetSetsMax?.toString() ?? '');
    setRepsMin(row.pe.targetRepsMin?.toString() ?? '');
    setRepsMax(row.pe.targetRepsMax?.toString() ?? '');
    setWeightMin(row.pe.targetWeightMin?.toString() ?? '');
    setWeightMax(row.pe.targetWeightMax?.toString() ?? '');
    setRirMin(row.pe.targetRirMin?.toString() ?? '');
    setRirMax(row.pe.targetRirMax?.toString() ?? '');
    setRestSeconds(row.pe.targetRestSeconds?.toString() ?? '');
    setDurationSeconds(row.pe.targetDurationSeconds?.toString() ?? '');
    setTempo(row.pe.tempo?.toString() ?? '');
  }, [programExerciseId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(useCallback(() => {
    const altId = consumePendingAlt();
    if (!altId) return;
    db.select().from(exercises).where(eq(exercises.id, altId)).then(([ex]) => {
      if (!ex) return;
      setEditAltIds((prev) => prev.includes(altId) ? prev : [...prev, altId]);
      setEditAlts((prev) => prev.find((x) => x.id === altId) ? prev : [...prev, ex]);
    });
  }, []));

  const handleSave = async () => {
    const toInt = (s: string) => (s.trim() ? parseInt(s.trim(), 10) : null);
    const toFloat = (s: string) => (s.trim() ? parseFloat(s.trim()) : null);

    const errors: string[] = [];
    const chkInt = (a: string, b: string, name: string) => {
      const mn = toInt(a), mx = toInt(b);
      if (mn != null && mx != null && mn > mx)
        errors.push(`${name} : min (${mn}) > max (${mx}).`);
    };
    chkInt(setsMin, setsMax, 'Séries');
    chkInt(repsMin, repsMax, 'Reps');
    const mnW = toFloat(weightMin), mxW = toFloat(weightMax);
    if (mnW != null && mxW != null && mnW > mxW)
      errors.push(`Poids : min (${mnW}) > max (${mxW}).`);
    chkInt(rirMin, rirMax, 'RIR');
    const t = tempo.trim();
    if (t && !/^\d+-\d+-\d+-\d+$/.test(t))
      errors.push('Tempo invalide. Format : n-n-n-n (ex : 3-1-1-0).');
    if (errors.length > 0) {
      Alert.alert('Vérification', errors.join('\n\n'));
      return;
    }

    await db
      .update(programExercises)
      .set({
        alternativeExerciseIds: editAltIds.length > 0 ? editAltIds : null,
        selectedVariation: selectedVariation || null,
        targetSetsMin: toInt(setsMin),
        targetSetsMax: toInt(setsMax),
        targetRepsMin: toInt(repsMin),
        targetRepsMax: toInt(repsMax),
        targetWeightMin: toFloat(weightMin),
        targetWeightMax: toFloat(weightMax),
        targetRirMin: toInt(rirMin),
        targetRirMax: toInt(rirMax),
        targetRestSeconds: toInt(restSeconds),
        targetDurationSeconds: toInt(durationSeconds),
        tempo: t || null,
      })
      .where(eq(programExercises.id, programExerciseId!));

    await load();
    setEditMode(false);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        editMode ? (
          <Pressable onPress={handleSave}>
            <Text style={styles.headerBtn}>Enregistrer</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setEditMode(true)}>
            <Text style={styles.headerBtn}>Modifier</Text>
          </Pressable>
        ),
    });
  }, [editMode, editAltIds, selectedVariation, setsMin, setsMax, repsMin, repsMax, weightMin, weightMax, rirMin, rirMax, restSeconds, durationSeconds, tempo]);

  if (!pe || !exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const exerciseVariations = (exercise.variations as string[] | null) ?? [];

  const addCustomVariation = () => {
    const val = customVariation.trim();
    if (!val) return;
    setSelectedVariation(val);
    setCustomVariation('');
    setShowVariationInput(false);
  };

  const displayRange = (min: number | null | undefined, max: number | null | undefined, unit = '') => {
    if (min == null && max == null) return '—';
    if (min != null && max != null && min !== max) return `${min}–${max}${unit}`;
    return `${min ?? max}${unit}`;
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Carousel photos */}
        {(() => {
          const staticImgs = (exerciseImages[exercise.id] ?? []).map((s) => ({ type: 'static' as const, source: s }));
          const customImgs = ((exercise.customImageUris as string[] | null) ?? []).map((u) => ({ type: 'uri' as const, source: u }));
          const allImgs = [...staticImgs, ...customImgs];
          if (allImgs.length === 0) return null;
          return (
            <View style={styles.carouselContainer}>
              <FlatList
                ref={flatListRef}
                data={allImgs}
                keyExtractor={(_, i) => String(i)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => {
                  setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
                }}
                renderItem={({ item }) => (
                  <Image
                    source={item.type === 'static' ? item.source : { uri: item.source }}
                    style={styles.carouselImage}
                    resizeMode="contain"
                  />
                )}
              />
              {allImgs.length > 1 && (
                <View style={styles.dots}>
                  {allImgs.map((_, i) => (
                    <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </View>
          );
        })()}

        {/* Nom exercice + tags */}
        <View style={styles.section}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <View style={styles.tagsRow}>
            {exercise.level && <Text style={styles.tag}>{exercise.level}</Text>}
            {exercise.category && <Text style={styles.tag}>{exercise.category}</Text>}
            {exercise.equipment && <Text style={styles.tag}>{exercise.equipment}</Text>}
          </View>
        </View>

        {/* Exercices alternatifs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercices alternatifs</Text>

          {!editMode ? (
            alternatives.length === 0 ? (
              <Text style={styles.valuePlaceholder}>Aucun exercice alternatif</Text>
            ) : (
              <FlatList
                horizontal
                data={alternatives}
                keyExtractor={(a) => a.id}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.altChip}
                    onPress={() => router.push(`/exercices/${item.id}`)}
                  >
                    <Text style={styles.altChipText}>{item.name}</Text>
                  </Pressable>
                )}
              />
            )
          ) : (
            <View>
              <View style={styles.altEditRow}>
                {editAlts.map((a) => (
                  <View key={a.id} style={styles.altChipEdit}>
                    <Text style={styles.altChipEditText} numberOfLines={1}>{a.name}</Text>
                    <Pressable
                      onPress={() => {
                        setEditAltIds(editAltIds.filter((x) => x !== a.id));
                        setEditAlts(editAlts.filter((x) => x.id !== a.id));
                      }}
                      style={styles.altChipRemove}
                    >
                      <Text style={styles.altChipRemoveText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable
                    style={styles.addAltBtn}
                    onPress={() => router.push(`/programmes/${id}/sessions/${sessionId}/exercises/${programExerciseId}/ajouter-alternative`)}
                  >
                    <Text style={styles.addAltBtnText}>+</Text>
                  </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Variante */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Variante</Text>
          {!editMode ? (
            <Text style={[styles.valueText, !pe.selectedVariation && styles.valuePlaceholder]}>
              {pe.selectedVariation ?? 'Aucune variante sélectionnée'}
            </Text>
          ) : (
            <>
              <View style={styles.variationChips}>
                {/* Option aucune variante */}
                <Pressable
                  style={[styles.varChip, !selectedVariation && styles.varChipActive]}
                  onPress={() => setSelectedVariation('')}
                >
                  <Text style={[styles.varChipText, !selectedVariation && styles.varChipTextActive]}>
                    Aucune
                  </Text>
                </Pressable>
                {exerciseVariations.map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.varChip, selectedVariation === v && styles.varChipActive]}
                    onPress={() => setSelectedVariation(v)}
                  >
                    <Text style={[styles.varChipText, selectedVariation === v && styles.varChipTextActive]}>
                      {v}
                    </Text>
                  </Pressable>
                ))}
                {/* Variante personnalisée active mais pas dans la liste */}
                {selectedVariation && !exerciseVariations.includes(selectedVariation) && (
                  <View style={[styles.varChip, styles.varChipActive]}>
                    <Text style={[styles.varChipText, styles.varChipTextActive]}>{selectedVariation}</Text>
                  </View>
                )}
                {/* Ajouter à la volée */}
                {showVariationInput ? (
                  <View style={styles.inlineInput}>
                    <TextInput
                      style={styles.inlineInputField}
                      value={customVariation}
                      onChangeText={setCustomVariation}
                      placeholder="Nom…"
                      autoFocus
                      onSubmitEditing={addCustomVariation}
                      returnKeyType="done"
                    />
                    <Pressable style={styles.inlineConfirm} onPress={addCustomVariation}>
                      <Text style={styles.inlineConfirmText}>OK</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={styles.addVarChip} onPress={() => setShowVariationInput(true)}>
                    <Text style={styles.addVarChipText}>+</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>

        {/* Objectifs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectifs</Text>

          {!editMode ? (
            // Mode affichage
            <View style={styles.targetGrid}>
              {[
                { label: 'Séries', val: displayRange(pe.targetSetsMin, pe.targetSetsMax) },
                { label: 'Répétitions', val: displayRange(pe.targetRepsMin, pe.targetRepsMax) },
                { label: 'Poids (kg)', val: displayRange(pe.targetWeightMin, pe.targetWeightMax, ' kg') },
                { label: 'RIR', val: displayRange(pe.targetRirMin, pe.targetRirMax) },
                { label: 'Repos (sec)', val: pe.targetRestSeconds != null ? `${pe.targetRestSeconds}s` : '—' },
                { label: 'Durée (sec)', val: pe.targetDurationSeconds != null ? `${pe.targetDurationSeconds}s` : '—' },
                { label: 'Tempo', val: pe.tempo != null ? String(pe.tempo) : '—' },
              ].map(({ label, val }) => (
                <View key={label} style={styles.targetRow}>
                  <Text style={styles.targetLabel}>{label}</Text>
                  <Text style={[styles.targetValue, val === '—' && styles.valuePlaceholder]}>{val}</Text>
                </View>
              ))}
            </View>
          ) : (
            // Mode édition
            <View>
              {[
                { label: 'Séries min', value: setsMin, onChange: setSetsMin },
                { label: 'Séries max', value: setsMax, onChange: setSetsMax },
                { label: 'Reps min', value: repsMin, onChange: setRepsMin },
                { label: 'Reps max', value: repsMax, onChange: setRepsMax },
                { label: 'Poids min (kg)', value: weightMin, onChange: setWeightMin, decimal: true },
                { label: 'Poids max (kg)', value: weightMax, onChange: setWeightMax, decimal: true },
                { label: 'RIR min', value: rirMin, onChange: setRirMin },
                { label: 'RIR max', value: rirMax, onChange: setRirMax },
                { label: 'Repos (sec)', value: restSeconds, onChange: setRestSeconds },
                { label: 'Durée (sec)', value: durationSeconds, onChange: setDurationSeconds },
                      ].map(({ label, value, onChange, decimal }) => (
                <View key={label} style={styles.inputRow}>
                  <Text style={styles.inputLabel}>{label}</Text>
                  <TextInput
                    style={styles.targetInput}
                    value={value}
                    onChangeText={onChange}
                    keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
                    placeholder="—"
                    placeholderTextColor="#ccc"
                  />
                </View>
              ))}
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>Tempo</Text>
                <TextInput
                  style={styles.targetInput}
                  value={tempo}
                  onChangeText={setTempo}
                  keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                  placeholder="3-1-1-0"
                  placeholderTextColor="#ccc"
                />
              </View>
            </View>
          )}
        </View>

        {/* Performances */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performances</Text>
          {history.length === 0 ? (
            <Text style={styles.placeholderText}>
              Aucune performance enregistrée pour cet exercice dans ce programme.
            </Text>
          ) : (
            history.map((entry) => (
              <View key={entry.date} style={styles.historyBlock}>
                <Text style={styles.historyDate}>{entry.date}</Text>
                {entry.sets.map((s) => (
                  <Text key={s.id} style={styles.historySet}>
                    Série {s.setIndex}
                    {s.weight != null ? ` · ${s.weight} kg` : ''}
                    {s.reps != null ? ` × ${s.reps}` : ''}
                    {s.rir != null ? ` · RIR ${s.rir}` : ''}
                    {s.durationSeconds != null ? ` · ${s.durationSeconds}s` : ''}
                  </Text>
                ))}
              </View>
            ))
          )}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { color: '#007AFF', fontSize: 16, marginRight: 4 },

  section: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  exerciseName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: '#555', backgroundColor: '#e8e8e8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },

  carouselContainer: { backgroundColor: '#fff' },
  carouselImage: { width: SCREEN_WIDTH, height: 220 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#007AFF', width: 18 },

  altChip: {
    backgroundColor: '#e8f0fe',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  altChipText: { color: '#007AFF', fontSize: 13, fontWeight: '500' },

  altEditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  altChipEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f0fe',
    borderRadius: 10,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 5,
    maxWidth: 180,
  },
  altChipEditText: { color: '#007AFF', fontSize: 13, fontWeight: '500', flex: 1 },
  altChipRemove: { padding: 4, marginLeft: 2 },
  altChipRemoveText: { color: '#007AFF', fontSize: 16, fontWeight: '700', lineHeight: 18 },
  addAltBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  addAltBtnText: { fontSize: 20, color: '#555', lineHeight: 24 },

  valueText: { fontSize: 15, color: '#111' },
  valuePlaceholder: { color: '#bbb', fontStyle: 'italic' },

  variationChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  varChipActive: { backgroundColor: '#AF52DE', borderColor: '#AF52DE' },
  varChipText: { fontSize: 13, color: '#444' },
  varChipTextActive: { color: '#fff' },
  addVarChip: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  addVarChipText: { fontSize: 20, color: '#555', lineHeight: 24 },
  inlineInput: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineInputField: {
    borderWidth: 1, borderColor: '#AF52DE', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, fontSize: 13, minWidth: 80,
  },
  inlineConfirm: { backgroundColor: '#AF52DE', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  inlineConfirmText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  targetGrid: { gap: 2 },
  targetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  targetLabel: { fontSize: 14, color: '#555' },
  targetValue: { fontSize: 15, fontWeight: '600', color: '#111' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  inputLabel: { fontSize: 14, color: '#555', flex: 1 },
  targetInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 7,
    fontSize: 14,
    width: 80,
    textAlign: 'right',
    backgroundColor: '#fafafa',
  },

  placeholderText: { fontSize: 14, color: '#aaa', fontStyle: 'italic', lineHeight: 20 },
  historyBlock: { marginBottom: 12 },
  historyDate: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  historySet: { fontSize: 14, color: '#333', lineHeight: 20, paddingLeft: 8 },
});
