import { asc, eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { db } from '../../../src/db';
import { programExercises, programs, programSessions } from '../../../src/db/schema';
import { generateId } from '../../../src/utils/generateId';

type Session = typeof programSessions.$inferSelect;

export default function ModifierProgrammeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [newSessionName, setNewSessionName] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [prog] = await db.select().from(programs).where(eq(programs.id, id));
    if (prog) {
      setName(prog.name);
      setDescription(prog.description ?? '');
    }
    const sess = await db
      .select()
      .from(programSessions)
      .where(eq(programSessions.programId, id))
      .orderBy(asc(programSessions.order));
    setSessions(sess);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSave = async () => {
    if (!name.trim()) return;
    await db.update(programs).set({ name: name.trim(), description: description.trim() || null }).where(eq(programs.id, id!));
    router.back();
  };

  const deleteSession = (s: Session) => {
    Alert.alert('Supprimer', `Supprimer la séance "${s.name}" et tous ses exercices ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await db.delete(programExercises).where(eq(programExercises.programSessionId, s.id));
          await db.delete(programSessions).where(eq(programSessions.id, s.id));
          load();
        },
      },
    ]);
  };

  const addSession = async () => {
    const sessionName = newSessionName.trim();
    if (!sessionName) return;
    const newId = generateId();
    await db.insert(programSessions).values({
      id: newId,
      programId: id!,
      name: sessionName,
      order: sessions.length,
      color: '#007AFF',
    });
    setNewSessionName('');
    setShowAddInput(false);
    router.push(`/programmes/${id}/sessions/${newId}/modifier?from=new`);
  };

  const deleteProgram = () => {
    Alert.alert('Supprimer le programme', 'Cette action est irréversible. Toutes les séances seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await db.delete(programs).where(eq(programs.id, id!));
          router.replace('/(tabs)/programmes');
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>

        {/* Nom + description */}
        <View style={styles.section}>
          <Text style={styles.label}>Nom</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nom du programme"
            returnKeyType="next"
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Objectifs, fréquence, notes…"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Séances */}
        <View style={styles.section}>
          <Text style={styles.label}>Séances</Text>

          {sessions.map((s) => (
            <View key={s.id} style={styles.sessionRow}>
              <View style={[styles.colorDot, { backgroundColor: s.color }]} />
              <Text style={styles.sessionName} numberOfLines={1}>{s.name}</Text>
              <Pressable
                onPress={() => router.push(`/programmes/${id}/sessions/${s.id}/modifier`)}
                style={styles.editIcon}
              >
                <Text style={styles.editIconText}>✏️</Text>
              </Pressable>
              <Pressable onPress={() => deleteSession(s)} style={styles.deleteIcon}>
                <Text style={styles.deleteIconText}>🗑</Text>
              </Pressable>
            </View>
          ))}

          {showAddInput ? (
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newSessionName}
                onChangeText={setNewSessionName}
                placeholder="Nom de la séance"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addSession}
              />
              <Pressable
                style={[styles.confirmBtn, !newSessionName.trim() && styles.confirmBtnDisabled]}
                onPress={addSession}
                disabled={!newSessionName.trim()}
              >
                <Text style={styles.confirmBtnText}>OK</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.addSessionBtn} onPress={() => setShowAddInput(true)}>
              <Text style={styles.addSessionBtnText}>+ Ajouter une séance</Text>
            </Pressable>
          )}
        </View>

        {/* Enregistrer */}
        <Pressable
          style={[styles.saveBtn, !name.trim() && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!name.trim()}
        >
          <Text style={styles.saveBtnText}>Enregistrer</Text>
        </Pressable>

        {/* Supprimer */}
        <Pressable style={styles.deleteBtn} onPress={deleteProgram}>
          <Text style={styles.deleteBtnText}>Supprimer le programme</Text>
        </Pressable>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },

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
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 70 },

  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  sessionName: { flex: 1, fontSize: 15, color: '#111' },
  editIcon: { padding: 4 },
  editIconText: { fontSize: 16 },
  deleteIcon: { padding: 4 },
  deleteIconText: { fontSize: 16 },

  addRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  confirmBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  addSessionBtn: {
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#f0f7ff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e0ff',
    borderStyle: 'dashed',
  },
  addSessionBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },

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

  deleteBtn: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff2f2',
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  deleteBtnText: { color: '#c62828', fontWeight: '600', fontSize: 15 },
});
