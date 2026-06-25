import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { db } from '../../../../../src/db';
import { exercises, programExercises, programSessions } from '../../../../../src/db/schema';

type Session = typeof programSessions.$inferSelect;
type ProgramExercise = typeof programExercises.$inferSelect;

type Item = ProgramExercise & { exerciseName: string };

const SESSION_COLORS = [
  '#007AFF', '#34C759', '#FF3B30', '#FF9500',
  '#AF52DE', '#5AC8FA', '#FF2D55', '#FFCC00',
];

const DAYS: Array<{ key: string; label: string }> = [
  { key: 'Monday', label: 'Lun' },
  { key: 'Tuesday', label: 'Mar' },
  { key: 'Wednesday', label: 'Mer' },
  { key: 'Thursday', label: 'Jeu' },
  { key: 'Friday', label: 'Ven' },
  { key: 'Saturday', label: 'Sam' },
  { key: 'Sunday', label: 'Dim' },
];

export default function ModifierSeanceScreen() {
  const { id, sessionId, from } = useLocalSearchParams<{ id: string; sessionId: string; from?: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#007AFF');
  const [day, setDay] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [s] = await db.select().from(programSessions).where(eq(programSessions.id, sessionId));
    if (s) {
      setSession(s);
      setName(s.name);
      setColor(s.color);
      setDay(s.day ?? null);
    }

    const rows = await db
      .select({ pe: programExercises, exercise: exercises })
      .from(programExercises)
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(eq(programExercises.programSessionId, sessionId))
      .orderBy(programExercises.order);

    setItems(rows.map(({ pe, exercise }) => ({ ...pe, exerciseName: exercise.name })));
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const moveItem = (index: number, direction: -1 | 1) => {
    const newItems = [...items];
    const target = index + direction;
    if (target < 0 || target >= newItems.length) return;
    [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
    setItems(newItems);
  };

  const deleteItem = (item: Item) => {
    Alert.alert('Supprimer', `Retirer "${item.exerciseName}" de cette séance ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await db.delete(programExercises).where(eq(programExercises.id, item.id));
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim() || !sessionId) return;
    await db
      .update(programSessions)
      .set({ name: name.trim(), color, day: (day as Session['day']) ?? undefined })
      .where(eq(programSessions.id, sessionId));

    for (let i = 0; i < items.length; i++) {
      await db
        .update(programExercises)
        .set({ order: i })
        .where(eq(programExercises.id, items[i].id));
    }
    if (from === 'new') {
      router.replace(`/programmes/${id}/sessions/${sessionId}`);
    } else {
      router.back();
    }
  };

  if (!session) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>

        {/* Nom */}
        <View style={styles.section}>
          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom de la séance"
            returnKeyType="done"
          />
        </View>

        {/* Couleur */}
        <View style={styles.section}>
          <Text style={styles.label}>Couleur</Text>
          <View style={styles.colorRow}>
            {SESSION_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colorCircle, { backgroundColor: c }, color === c && styles.colorCircleSelected]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {/* Jour */}
        <View style={styles.section}>
          <Text style={styles.label}>Jour</Text>
          <View style={styles.daysRow}>
            {DAYS.map((d) => (
              <Pressable
                key={d.key}
                style={[styles.dayChip, day === d.key && styles.dayChipActive]}
                onPress={() => setDay(day === d.key ? null : d.key)}
              >
                <Text style={[styles.dayChipText, day === d.key && styles.dayChipTextActive]}>
                  {d.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Exercices réordonnables */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Exercices</Text>
            {items.map((item, index) => (
              <View key={item.id} style={styles.exerciseRow}>
                <View style={styles.arrowCol}>
                  <Pressable
                    onPress={() => moveItem(index, -1)}
                    disabled={index === 0}
                    style={[styles.arrowBtn, index === 0 && styles.arrowBtnDisabled]}
                  >
                    <Text style={styles.arrowText}>▲</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => moveItem(index, 1)}
                    disabled={index === items.length - 1}
                    style={[styles.arrowBtn, index === items.length - 1 && styles.arrowBtnDisabled]}
                  >
                    <Text style={styles.arrowText}>▼</Text>
                  </Pressable>
                </View>
                <Text style={styles.exerciseName} numberOfLines={1}>{item.exerciseName}</Text>
                <Pressable onPress={() => deleteItem(item)} style={styles.trashBtn}>
                  <Text style={styles.trashBtnText}>🗑</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Enregistrer */}
        <Pressable
          style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!name.trim()}
        >
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  section: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },

  colorRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  colorCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorCircleSelected: { borderColor: '#111', transform: [{ scale: 1.15 }] },

  daysRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  dayChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  dayChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  dayChipText: { fontSize: 13, color: '#444' },
  dayChipTextActive: { color: '#fff' },

  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 8,
  },
  arrowCol: { flexDirection: 'column', gap: 2 },
  arrowBtn: { padding: 4 },
  arrowBtnDisabled: { opacity: 0.2 },
  arrowText: { fontSize: 12, color: '#555' },
  exerciseName: { flex: 1, fontSize: 15, color: '#111' },
  trashBtn: { padding: 6 },
  trashBtnText: { fontSize: 16 },

  saveBtn: {
    backgroundColor: '#007AFF',
    marginHorizontal: 12,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
