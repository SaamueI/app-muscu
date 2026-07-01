import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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
import { syncMesoCalendarEvents } from '../../../../../src/db/meso';
import { mesoSessions } from '../../../../../src/db/schema';

const SESSION_COLORS = [
  '#007AFF', '#34C759', '#FF3B30', '#FF9500',
  '#AF52DE', '#5AC8FA', '#FF2D55', '#FFCC00',
];

type Weekday =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday'
  | 'Friday' | 'Saturday' | 'Sunday';

const DAYS: Array<{ key: Weekday; label: string }> = [
  { key: 'Monday', label: 'Lun' },
  { key: 'Tuesday', label: 'Mar' },
  { key: 'Wednesday', label: 'Mer' },
  { key: 'Thursday', label: 'Jeu' },
  { key: 'Friday', label: 'Ven' },
  { key: 'Saturday', label: 'Sam' },
  { key: 'Sunday', label: 'Dim' },
];

export default function ModifierMesoSessionScreen() {
  const { id, mesoSessionId } = useLocalSearchParams<{ id: string; mesoSessionId: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [color, setColor] = useState(SESSION_COLORS[0]);
  const [day, setDay] = useState<Weekday | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mesoSessionId) return;
    db.select().from(mesoSessions).where(eq(mesoSessions.id, mesoSessionId)).then(([s]) => {
      if (s) {
        setTitle(s.title ?? '');
        setNote(s.note ?? '');
        setColor(s.color ?? SESSION_COLORS[0]);
        setDay((s.day as Weekday | null) ?? null);
      }
      setLoaded(true);
    });
  }, [mesoSessionId]);

  const handleSave = async () => {
    if (!mesoSessionId) return;
    await db
      .update(mesoSessions)
      .set({
        title: title.trim() || null,
        note: note.trim() || null,
        color,
        day: day ?? null,
      })
      .where(eq(mesoSessions.id, mesoSessionId));
    if (id) await syncMesoCalendarEvents(id);
    router.back();
  };

  if (!loaded) {
    return <View style={styles.center}><Text>Chargement…</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex : Push A"
            returnKeyType="next"
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Note</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Note de séance…"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Couleur</Text>
          <View style={styles.colorRow}>
            {SESSION_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Jour de la semaine</Text>
          <View style={styles.dayRow}>
            <Pressable
              style={[styles.dayChip, day === null && styles.dayChipActive]}
              onPress={() => setDay(null)}
            >
              <Text style={[styles.dayChipText, day === null && styles.dayChipTextActive]}>Aucun</Text>
            </Pressable>
            {DAYS.map((d) => (
              <Pressable
                key={d.key}
                style={[styles.dayChip, day === d.key && styles.dayChipActive]}
                onPress={() => setDay(d.key)}
              >
                <Text style={[styles.dayChipText, day === d.key && styles.dayChipTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Enregistrer</Text>
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
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  label: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', marginBottom: 8,
  },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 56 },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 34, height: 34, borderRadius: 17 },
  colorDotActive: { borderWidth: 3, borderColor: '#111' },

  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  dayChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  dayChipText: { fontSize: 14, color: '#444' },
  dayChipTextActive: { color: '#fff' },

  button: {
    backgroundColor: '#007AFF', margin: 12, marginTop: 18,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
