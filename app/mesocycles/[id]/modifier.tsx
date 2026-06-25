import { asc, eq } from 'drizzle-orm';
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

import { db } from '../../../src/db';
import { mesocycles, programs } from '../../../src/db/schema';

type Program = typeof programs.$inferSelect;

export default function ModifierMesocycleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [programId, setProgramId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [m] = await db.select().from(mesocycles).where(eq(mesocycles.id, id));
      if (m) {
        setName(m.name);
        setNotes(m.notes ?? '');
        setProgramId(m.programId ?? null);
      }
      const progs = await db.select().from(programs).orderBy(asc(programs.name));
      setAllPrograms(progs);
      setLoaded(true);
    })();
  }, [id]);

  const handleSave = async () => {
    if (!name.trim() || !id) return;
    await db
      .update(mesocycles)
      .set({
        name: name.trim(),
        notes: notes.trim() || null,
        programId: programId ?? null,
      })
      .where(eq(mesocycles.id, id));
    router.back();
  };

  if (!loaded) {
    return <View style={styles.center}><Text>Chargement…</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom du mésocycle"
            returnKeyType="next"
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Objectif du bloc, contexte…"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Programme</Text>
          <Text style={styles.hint}>
            Changer de programme ne modifie pas les séances déjà créées ; seules les
            prochaines semaines ajoutées utiliseront le nouveau programme.
          </Text>
          {allPrograms.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.progRow, programId === p.id && styles.progRowActive]}
              onPress={() => setProgramId(programId === p.id ? null : p.id)}
            >
              <Text style={styles.progName}>{p.name}</Text>
              {programId === p.id && <Text style={styles.checkmark}>✓</Text>}
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.manageBtn} onPress={() => router.push(`/mesocycles/${id}/sessions`)}>
          <Text style={styles.manageBtnText}>Éditer les séances</Text>
        </Pressable>

        <Pressable
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!name.trim()}
        >
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
  hint: { fontSize: 12, color: '#aaa', marginBottom: 10, marginTop: -4, lineHeight: 16 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 70 },

  progRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  progRowActive: { backgroundColor: '#f0f7ff' },
  progName: { fontSize: 15, color: '#111' },
  checkmark: { fontSize: 15, color: '#007AFF', fontWeight: '700' },

  manageBtn: {
    backgroundColor: '#eef4ff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    borderWidth: 1, borderColor: '#cfe0ff',
  },
  manageBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 15 },

  button: {
    backgroundColor: '#007AFF', margin: 12, marginTop: 16,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
