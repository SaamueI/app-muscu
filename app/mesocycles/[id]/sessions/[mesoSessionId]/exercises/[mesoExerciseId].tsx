import { asc, eq, inArray } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ExerciseImageCarousel } from '../../../../../../src/components/ExerciseImageCarousel';
import { db } from '../../../../../../src/db';
import { saveTargetMemory } from '../../../../../../src/db/meso';
import { exercises, mesoExercises, mesoSets } from '../../../../../../src/db/schema';
import { consumePendingAlt } from '../../../../../../src/utils/altPickerStore';
import { generateId } from '../../../../../../src/utils/generateId';

type MesoExercise = typeof mesoExercises.$inferSelect;
type Exercise = typeof exercises.$inferSelect;
type MesoSet = typeof mesoSets.$inferSelect;

type SetForm = {
  repsMin: string; repsMax: string;
  weightMin: string; weightMax: string;
  rirMin: string; rirMax: string;
  rest: string; duration: string; tempo: string;
};

const EMPTY: SetForm = {
  repsMin: '', repsMax: '', weightMin: '', weightMax: '',
  rirMin: '', rirMax: '', rest: '', duration: '', tempo: '',
};

const RIR_INFO =
  "RIR — Reps In Reserve\n\nNombre de répétitions encore possibles en fin de série avant l'échec. " +
  "RIR 2 = vous arrêtez la série 2 reps avant de ne plus pouvoir en faire. " +
  "Plus le RIR est bas, plus la série est intense (RIR 0 = échec musculaire).";

const TEMPO_INFO =
  "Tempo d'exécution\n\nDurée en secondes de chaque phase du mouvement, au format " +
  "excentrique - pause basse - concentrique - pause haute.\n\n" +
  "Ex : 3-1-1-0 → 3s pour descendre, 1s en bas, 1s pour monter, 0s en haut.";

const pad2 = (n: number) => String(n).padStart(2, '0');

function secondsToMMSS(n: number | null): string {
  if (n == null) return '';
  return `${Math.floor(n / 60)}:${pad2(n % 60)}`;
}

function mmssToSeconds(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [mm, ss] = t.split(':');
    const m = parseInt(mm || '0', 10) || 0;
    const s = parseInt(ss || '0', 10) || 0;
    return m * 60 + s;
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

function toForm(s: MesoSet): SetForm {
  const v = (n: number | null) => (n != null ? String(n) : '');
  return {
    repsMin: v(s.targetRepsMin), repsMax: v(s.targetRepsMax),
    weightMin: v(s.targetWeightMin), weightMax: v(s.targetWeightMax),
    rirMin: v(s.targetRirMin), rirMax: v(s.targetRirMax),
    rest: secondsToMMSS(s.targetRestSeconds),
    duration: secondsToMMSS(s.targetDurationSeconds),
    tempo: s.tempo ?? '',
  };
}

const range = (min: number | null, max: number | null, unit = '') => {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max}${unit}`;
  return `${min ?? max}${unit}`;
};

export default function MesoExerciceDetailScreen() {
  const { id, mesoSessionId, mesoExerciseId, edit } = useLocalSearchParams<{
    id: string; mesoSessionId: string; mesoExerciseId: string; edit?: string;
  }>();
  const navigation = useNavigation();
  const router = useRouter();

  const [me, setMe] = useState<MesoExercise | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [alternatives, setAlternatives] = useState<Exercise[]>([]);
  const [sets, setSets] = useState<MesoSet[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [forms, setForms] = useState<SetForm[]>([]);
  const autoEdited = useRef(false);

  // Édition : alternatives / variante / note
  const [editAltIds, setEditAltIds] = useState<string[]>([]);
  const [editAlts, setEditAlts] = useState<Exercise[]>([]);
  const [selectedVariation, setSelectedVariation] = useState('');
  const [customVariation, setCustomVariation] = useState('');
  const [showVariationInput, setShowVariationInput] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!mesoExerciseId) return;
    const [row] = await db
      .select({ me: mesoExercises, exercise: exercises })
      .from(mesoExercises)
      .innerJoin(exercises, eq(mesoExercises.exerciseId, exercises.id))
      .where(eq(mesoExercises.id, mesoExerciseId));
    if (!row) return;
    setMe(row.me);
    setExercise(row.exercise);

    const altIds = (row.me.alternativeExerciseIds as string[] | null) ?? [];
    let alts: Exercise[] = [];
    if (altIds.length > 0) {
      alts = await db.select().from(exercises).where(inArray(exercises.id, altIds));
    }
    setAlternatives(alts);
    setEditAltIds(altIds);
    setEditAlts(alts);
    setSelectedVariation(row.me.selectedVariation ?? '');
    setNote(row.me.note ?? '');

    const rows = await db
      .select()
      .from(mesoSets)
      .where(eq(mesoSets.mesoExerciseId, mesoExerciseId))
      .orderBy(asc(mesoSets.setNumber));
    setSets(rows);

    // Ouverture directe en mode édition (tap depuis la liste en édition)
    if (edit === '1' && !autoEdited.current) {
      autoEdited.current = true;
      setForms(rows.length > 0 ? rows.map(toForm) : [{ ...EMPTY }]);
      setEditMode(true);
    }
  }, [mesoExerciseId, edit]);

  useEffect(() => { load(); }, [load]);

  // Récupération de l'alternative choisie dans le picker — séparé de `load`
  // pour ne pas écraser l'état d'édition en cours au retour du picker.
  useFocusEffect(useCallback(() => {
    const altId = consumePendingAlt();
    if (!altId) return;
    db.select().from(exercises).where(eq(exercises.id, altId)).then(([ex]) => {
      if (!ex) return;
      setEditAltIds((prev) => prev.includes(altId) ? prev : [...prev, altId]);
      setEditAlts((prev) => prev.find((x) => x.id === altId) ? prev : [...prev, ex]);
    });
  }, []));

  const enterEdit = () => {
    setForms(sets.length > 0 ? sets.map(toForm) : [{ ...EMPTY }]);
    setEditMode(true);
  };

  const addCustomVariation = () => {
    const val = customVariation.trim();
    if (!val) return;
    setSelectedVariation(val);
    setCustomVariation('');
    setShowVariationInput(false);
  };

  const handleSave = async () => {
    const toInt = (s: string) => (s.trim() ? parseInt(s.trim(), 10) : null);
    const toFloat = (s: string) => (s.trim() ? parseFloat(s.trim()) : null);

    const errors: string[] = [];
    for (let i = 0; i < forms.length; i++) {
      const f = forms[i];
      const label = `Série ${i + 1}`;
      const t = f.tempo.trim();
      if (t && !/^\d+-\d+-\d+-\d+$/.test(t))
        errors.push(`${label} — Tempo invalide. Format : n-n-n-n (ex : 3-1-1-0).`);
      const chkInt = (a: string, b: string, name: string) => {
        const mn = toInt(a), mx = toInt(b);
        if (mn != null && mx != null && mn > mx)
          errors.push(`${label} — ${name} : min (${mn}) > max (${mx}).`);
      };
      const chkFloat = (a: string, b: string, name: string) => {
        const mn = toFloat(a), mx = toFloat(b);
        if (mn != null && mx != null && mn > mx)
          errors.push(`${label} — ${name} : min (${mn}) > max (${mx}).`);
      };
      chkInt(f.repsMin, f.repsMax, 'Reps');
      chkFloat(f.weightMin, f.weightMax, 'Poids');
      chkInt(f.rirMin, f.rirMax, 'RIR');
    }
    if (errors.length > 0) {
      Alert.alert('Vérification', errors.join('\n\n'));
      return;
    }

    await db
      .update(mesoExercises)
      .set({
        alternativeExerciseIds: editAltIds.length > 0 ? editAltIds : null,
        selectedVariation: selectedVariation || null,
        note: note.trim() || null,
      })
      .where(eq(mesoExercises.id, mesoExerciseId!));

    await db.delete(mesoSets).where(eq(mesoSets.mesoExerciseId, mesoExerciseId!));
    for (let i = 0; i < forms.length; i++) {
      const f = forms[i];
      await db.insert(mesoSets).values({
        id: generateId(),
        mesoExerciseId: mesoExerciseId!,
        setNumber: i + 1,
        targetRepsMin: toInt(f.repsMin), targetRepsMax: toInt(f.repsMax),
        targetWeightMin: toFloat(f.weightMin), targetWeightMax: toFloat(f.weightMax),
        targetRirMin: toInt(f.rirMin), targetRirMax: toInt(f.rirMax),
        targetRestSeconds: mmssToSeconds(f.rest), targetDurationSeconds: mmssToSeconds(f.duration),
        tempo: f.tempo.trim() || null,
      });
    }
    await saveTargetMemory(mesoSessionId!);
    setEditMode(false);
    await load();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        editMode ? (
          <Pressable onPress={handleSave}><Text style={styles.headerBtn}>Enregistrer</Text></Pressable>
        ) : (
          <Pressable onPress={enterEdit}><Text style={styles.headerBtn}>Modifier</Text></Pressable>
        ),
    });
  }, [editMode, forms, sets, editAltIds, selectedVariation, note]);

  const updateForm = (i: number, key: keyof SetForm, val: string) =>
    setForms((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)));
  const addSet = () => setForms((prev) => [...prev, { ...EMPTY }]);
  const removeSet = (i: number) => setForms((prev) => prev.filter((_, idx) => idx !== i));
  const dupSet = (i: number) =>
    setForms((prev) => {
      const copy = [...prev];
      copy.splice(i + 1, 0, { ...prev[i] });
      return copy;
    });

  const InfoBtn = ({ text }: { text: string }) => (
    <Pressable hitSlop={8} onPress={() => Alert.alert('', text)}>
      <Text style={styles.infoBtn}>ⓘ</Text>
    </Pressable>
  );

  const pair = (
    label: string, kMin: keyof SetForm, kMax: keyof SetForm, i: number,
    opts: { decimal?: boolean; info?: string } = {}
  ) => (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {opts.info ? <InfoBtn text={opts.info} /> : null}
      </View>
      <TextInput
        style={styles.fieldInput}
        value={forms[i][kMin]}
        onChangeText={(t) => updateForm(i, kMin, t)}
        keyboardType={opts.decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="min" placeholderTextColor="#ccc"
      />
      <TextInput
        style={styles.fieldInput}
        value={forms[i][kMax]}
        onChangeText={(t) => updateForm(i, kMax, t)}
        keyboardType={opts.decimal ? 'decimal-pad' : 'number-pad'}
        placeholder="max" placeholderTextColor="#ccc"
      />
    </View>
  );

  const timeField = (label: string, k: keyof SetForm, i: number) => (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <TextInput
        style={[styles.fieldInput, styles.fieldInputWide]}
        value={forms[i][k]}
        onChangeText={(t) => updateForm(i, k, t)}
        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
        placeholder="mm:ss" placeholderTextColor="#ccc"
      />
    </View>
  );

  const tempoField = (i: number) => (
    <View style={styles.fieldRow}>
      <View style={styles.fieldLabelWrap}>
        <Text style={styles.fieldLabel}>Tempo</Text>
        <InfoBtn text={TEMPO_INFO} />
      </View>
      <TextInput
        style={[styles.fieldInput, styles.fieldInputWide]}
        value={forms[i].tempo}
        onChangeText={(t) => updateForm(i, 'tempo', t)}
        placeholder="3-1-1-0" placeholderTextColor="#ccc"
      />
    </View>
  );

  if (!me || !exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const exerciseVariations = (exercise.variations as string[] | null) ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Carousel photos (jamais éditable ici) */}
        <ExerciseImageCarousel
          exerciseId={exercise.id}
          customImageUris={exercise.customImageUris as string[] | null}
        />

        {/* Nom + tags */}
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
                onPress={() => router.push(`/mesocycles/${id}/sessions/${mesoSessionId}/exercises/${mesoExerciseId}/ajouter-alternative`)}
              >
                <Text style={styles.addAltBtnText}>+</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Variante */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Variante</Text>
          {!editMode ? (
            <Text style={[styles.valueText, !me.selectedVariation && styles.valuePlaceholder]}>
              {me.selectedVariation ?? 'Aucune variante sélectionnée'}
            </Text>
          ) : (
            <View style={styles.variationChips}>
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
              {selectedVariation && !exerciseVariations.includes(selectedVariation) && (
                <View style={[styles.varChip, styles.varChipActive]}>
                  <Text style={[styles.varChipText, styles.varChipTextActive]}>{selectedVariation}</Text>
                </View>
              )}
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
          )}
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Note de la séance planifiée</Text>
          {!editMode ? (
            <Text style={[styles.valueText, !me.note && styles.valuePlaceholder]}>
              {me.note ?? 'Aucune note'}
            </Text>
          ) : (
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Ex : attention au dos, monter la charge cette semaine…"
              placeholderTextColor="#ccc"
              multiline
              textAlignVertical="top"
            />
          )}
          {exercise.notes ? (
            <>
              <Text style={[styles.sectionTitle, styles.catalogNoteTitle]}>Note de l'exercice</Text>
              <Text style={[styles.valueText, styles.catalogNoteText]}>{exercise.notes}</Text>
            </>
          ) : null}
        </View>

        {!editMode ? (
          // ─── Lecture : uniquement les objectifs non-null ───
          sets.length === 0 ? (
            <View style={styles.section}>
              <Text style={styles.empty}>Aucun objectif. Appuie sur Modifier pour en ajouter.</Text>
            </View>
          ) : (
            sets.map((s) => {
              const lines = [
                ['Reps', range(s.targetRepsMin, s.targetRepsMax)],
                ['Poids', range(s.targetWeightMin, s.targetWeightMax, ' kg')],
                ['RIR', range(s.targetRirMin, s.targetRirMax)],
                ['Repos', s.targetRestSeconds != null ? secondsToMMSS(s.targetRestSeconds) : null],
                ['Durée', s.targetDurationSeconds != null ? secondsToMMSS(s.targetDurationSeconds) : null],
                ['Tempo', s.tempo ?? null],
              ].filter(([, v]) => v != null) as [string, string][];
              return (
                <View key={s.id} style={styles.section}>
                  <Text style={styles.setTitle}>Série {s.setNumber}</Text>
                  {lines.length === 0 ? (
                    <Text style={styles.empty}>Aucun objectif renseigné.</Text>
                  ) : (
                    lines.map(([label, val]) => (
                      <View key={label} style={styles.readRow}>
                        <Text style={styles.readLabel}>{label}</Text>
                        <Text style={styles.readValue}>{val}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )
        ) : (
          // ─── Édition : tous les champs ───
          <>
            {forms.map((_, i) => (
              <View key={i} style={styles.section}>
                <View style={styles.setHead}>
                  <Text style={styles.setTitle}>Série {i + 1}</Text>
                  <View style={styles.setHeadActions}>
                    <Pressable hitSlop={8} onPress={() => dupSet(i)}>
                      <Text style={styles.dupSet}>Dupliquer</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => removeSet(i)}>
                      <Text style={styles.removeSet}>Supprimer</Text>
                    </Pressable>
                  </View>
                </View>
                {pair('Reps (min/max)', 'repsMin', 'repsMax', i)}
                {pair('Poids kg (min/max)', 'weightMin', 'weightMax', i, { decimal: true })}
                {pair('RIR (min/max)', 'rirMin', 'rirMax', i, { info: RIR_INFO })}
                {timeField('Repos (mm:ss)', 'rest', i)}
                {timeField('Durée (mm:ss)', 'duration', i)}
                {tempoField(i)}
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={addSet}>
              <Text style={styles.addBtnText}>+ Ajouter une série</Text>
            </Pressable>
          </>
        )}
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
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  exerciseName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: '#555', backgroundColor: '#e8e8e8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },

  valueText: { fontSize: 15, color: '#111' },
  valuePlaceholder: { color: '#bbb', fontStyle: 'italic' },

  altChip: {
    backgroundColor: '#e8f0fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7, marginRight: 8,
  },
  altChipText: { color: '#007AFF', fontSize: 13, fontWeight: '500' },
  altEditRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  altChipEdit: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f0fe',
    borderRadius: 10, paddingLeft: 10, paddingRight: 4, paddingVertical: 5, maxWidth: 180,
  },
  altChipEditText: { color: '#007AFF', fontSize: 13, fontWeight: '500', flex: 1 },
  altChipRemove: { padding: 4, marginLeft: 2 },
  altChipRemoveText: { color: '#007AFF', fontSize: 16, fontWeight: '700', lineHeight: 18 },
  addAltBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0',
    borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center',
  },
  addAltBtnText: { fontSize: 20, color: '#555', lineHeight: 24 },

  variationChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  varChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
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

  noteInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 14, backgroundColor: '#fafafa', minHeight: 70,
  },
  catalogNoteTitle: { marginTop: 12 },
  catalogNoteText: { color: '#888' },

  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  setHeadActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  setTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 8 },
  dupSet: { fontSize: 13, color: '#007AFF' },
  removeSet: { fontSize: 13, color: '#FF3B30' },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },

  readRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  readLabel: { fontSize: 14, color: '#555' },
  readValue: { fontSize: 15, fontWeight: '600', color: '#111' },

  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLabel: { fontSize: 14, color: '#555' },
  infoBtn: { fontSize: 15, color: '#007AFF' },
  fieldInput: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 7,
    fontSize: 14, width: 64, textAlign: 'center', backgroundColor: '#fafafa',
  },
  fieldInputWide: { width: 84 },

  addBtn: {
    marginHorizontal: 12, marginTop: 12, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#f0f7ff',
    borderWidth: 1, borderColor: '#c8e0ff', borderStyle: 'dashed',
  },
  addBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
});
