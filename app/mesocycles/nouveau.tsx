import { asc, eq } from 'drizzle-orm';
import { useRouter } from 'expo-router';
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

import { db } from '../../src/db';
import { copyProgramSessionToMeso } from '../../src/db/meso';
import { mesocycles, programs, programSessions } from '../../src/db/schema';
import { generateId } from '../../src/utils/generateId';

type Program = typeof programs.$inferSelect;
type ProgramSession = typeof programSessions.$inferSelect;

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer', Thursday: 'Jeu',
  Friday: 'Ven', Saturday: 'Sam', Sunday: 'Dim',
};

export default function NouveauMesocycleScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [sessionsByProgram, setSessionsByProgram] = useState<Record<string, ProgramSession[]>>({});
  const [programId, setProgramId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.select().from(programs).orderBy(asc(programs.name)).then(setAllPrograms);
    db.select().from(programSessions).orderBy(asc(programSessions.order)).then((rows) => {
      const g: Record<string, ProgramSession[]> = {};
      for (const s of rows) (g[s.programId] ??= []).push(s);
      setSessionsByProgram(g);
    });
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const id = generateId();
    const numWeeks = programId ? 1 : 0;
    await db.insert(mesocycles).values({
      id,
      name: name.trim(),
      notes: notes.trim() || null,
      programId: programId ?? null,
      numWeeks,
      createdAt: new Date().toISOString(),
    });

    if (programId) {
      const sessions = await db
        .select()
        .from(programSessions)
        .where(eq(programSessions.programId, programId))
        .orderBy(asc(programSessions.order));
      let order = 0;
      for (const ps of sessions) {
        await copyProgramSessionToMeso(ps.id, id, 1, order++);
      }
    }

    router.replace(`/mesocycles/${id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ex : Bloc hypertrophie"
            autoFocus
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
          <Text style={styles.label}>Programme (optionnel)</Text>
          <Text style={styles.hint}>
            Si choisi, la semaine 1 est pré-remplie avec les séances du programme.
          </Text>
          {allPrograms.length === 0 ? (
            <Text style={styles.empty}>Aucun programme créé.</Text>
          ) : (
            allPrograms.map((p) => (
              <View key={p.id}>
                <Pressable
                  style={[styles.progRow, programId === p.id && styles.progRowActive]}
                  onPress={() => setProgramId(programId === p.id ? null : p.id)}
                >
                  <Text style={styles.progName}>{p.name}</Text>
                  {programId === p.id && <Text style={styles.checkmark}>✓</Text>}
                </Pressable>
                {programId === p.id && (
                  <View style={styles.sessionsPreview}>
                    {(sessionsByProgram[p.id] ?? []).length === 0 ? (
                      <Text style={styles.empty}>Ce programme n'a aucune séance.</Text>
                    ) : (
                      (sessionsByProgram[p.id] ?? []).map((s) => (
                        <View key={s.id} style={styles.previewRow}>
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.previewName}>{s.name}</Text>
                          {s.day ? <Text style={styles.previewDay}>{DAY_LABELS[s.day]}</Text> : null}
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <Pressable
          style={[styles.button, (!name.trim() || saving) && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Création…' : 'Créer le mésocycle'}</Text>
        </Pressable>

        <Pressable style={styles.importButton} onPress={() => router.push('/mesocycles/import')}>
          <Text style={styles.importButtonText}>Importer depuis un fichier</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  label: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', marginBottom: 8,
  },
  hint: { fontSize: 12, color: '#aaa', marginBottom: 10, marginTop: -4 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 70 },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic', paddingVertical: 6 },

  progRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  progRowActive: { backgroundColor: '#f0f7ff' },
  progName: { fontSize: 15, color: '#111' },
  checkmark: { fontSize: 15, color: '#007AFF', fontWeight: '700' },

  sessionsPreview: { paddingLeft: 12, paddingVertical: 4, backgroundColor: '#f7faff' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  previewName: { flex: 1, fontSize: 14, color: '#333' },
  previewDay: { fontSize: 12, color: '#888' },

  button: {
    backgroundColor: '#007AFF', margin: 12, marginTop: 20,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  importButton: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});
