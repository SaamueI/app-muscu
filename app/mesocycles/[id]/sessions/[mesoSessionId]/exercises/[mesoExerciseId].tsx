import { asc, eq } from 'drizzle-orm';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '../../../../../../src/db';
import { saveTargetMemory } from '../../../../../../src/db/meso';
import { exercises, mesoExercises, mesoSets } from '../../../../../../src/db/schema';
import { generateId } from '../../../../../../src/utils/generateId';

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
  const { mesoSessionId, mesoExerciseId, edit } = useLocalSearchParams<{
    id: string; mesoSessionId: string; mesoExerciseId: string; edit?: string;
  }>();
  const navigation = useNavigation();

  const [name, setName] = useState('');
  const [sets, setSets] = useState<MesoSet[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [forms, setForms] = useState<SetForm[]>([]);
  const autoEdited = useRef(false);

  const load = useCallback(async () => {
    if (!mesoExerciseId) return;
    const [me] = await db.select().from(mesoExercises).where(eq(mesoExercises.id, mesoExerciseId));
    if (me) {
      const [ex] = await db.select().from(exercises).where(eq(exercises.id, me.exerciseId));
      setName(ex?.name ?? 'Exercice');
    }
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

  const enterEdit = () => {
    setForms(sets.length > 0 ? sets.map(toForm) : [{ ...EMPTY }]);
    setEditMode(true);
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
  }, [editMode, forms, sets]);

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{name}</Text>
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
  headerBtn: { color: '#007AFF', fontSize: 16, marginRight: 4 },

  header: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#111' },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
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
