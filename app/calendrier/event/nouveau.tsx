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
import { calendarEvents, programSessions, programs } from '../../../src/db/schema';
import { WhenPickerField } from '../../../src/components/WhenPickerField';
import { generateId } from '../../../src/utils/generateId';
import { dateToIsoWeek, parseDateParam, toDateStr } from '../../../src/utils/dateUtils';

type Program = typeof programs.$inferSelect;
type ProgramSession = typeof programSessions.$inferSelect;
type EventMode = 'dated' | 'undated';

const EVENT_TYPES = [
  { key: 'workout_session', label: 'Séance' },
  { key: 'rest', label: 'Repos' },
  { key: 'competition', label: 'Compétition' },
  { key: 'other', label: 'Autre' },
];

export default function NouvelEvenementScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('workout_session');

  // 'dated' = événement à une date précise, 'undated' = planifié à la semaine
  // Si le param date existe on force 'dated', sinon l'utilisateur choisit
  const [eventMode, setEventMode] = useState<EventMode>(date ? 'dated' : 'undated');

  // Date sélectionnée
  const [selectedDate, setSelectedDate] = useState<Date | null>(parseDateParam(date));

  // Séance selection
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [sessionsByProgram, setSessionsByProgram] = useState<Record<string, ProgramSession[]>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ProgramSession | null>(null);

  // Semaine (mode undated)
  const [selectedWeek, setSelectedWeek] = useState(() => dateToIsoWeek(new Date()));

  useEffect(() => {
    db.select().from(programs).orderBy(asc(programs.name)).then(setAllPrograms);
  }, []);

  const loadSessions = async (programId: string) => {
    if (sessionsByProgram[programId]) return;
    const rows = await db
      .select()
      .from(programSessions)
      .where(eq(programSessions.programId, programId))
      .orderBy(asc(programSessions.order));
    setSessionsByProgram(prev => ({ ...prev, [programId]: rows }));
  };

  const handleToggleProgram = async (prog: Program) => {
    if (expandedProgramId === prog.id) {
      setExpandedProgramId(null);
    } else {
      setExpandedProgramId(prog.id);
      await loadSessions(prog.id);
    }
  };

  const handleSelectSession = (session: ProgramSession) => {
    setSelectedSessionId(session.id);
    setSelectedSession(session);
    setExpandedProgramId(null);
    if (!title) setTitle(session.name);
  };

  const isDateValid = () => selectedDate !== null;

  const canCreate = title.trim().length > 0 && (eventMode === 'undated' || isDateValid());

  const handleCreate = async () => {
    if (!canCreate) return;

    const eventDate = eventMode === 'dated' && selectedDate
      ? toDateStr(selectedDate)
      : null;
    const eventWeek = eventMode === 'undated' ? selectedWeek : null;

    await db.insert(calendarEvents).values({
      id: generateId(),
      type,
      status: 'planned',
      date: eventDate,
      week: eventWeek,
      refId: type === 'workout_session' ? (selectedSessionId ?? null) : null,
      refType: type === 'workout_session' && selectedSessionId ? 'program_session' : null,
      title: title.trim(),
      description: description.trim() || null,
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Titre + Description */}
        <View style={styles.section}>
          <Text style={styles.label}>Titre</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Nom de l'événement"
            returnKeyType="next"
          />
          <Text style={[styles.label, { marginTop: 14 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Notes, détails…"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Type */}
        <View style={styles.section}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {EVENT_TYPES.map((t) => (
              <Pressable
                key={t.key}
                style={[styles.typeChip, type === t.key && styles.typeChipActive]}
                onPress={() => { setType(t.key); setSelectedSessionId(null); setSelectedSession(null); }}
              >
                <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Séance : sélection programme → session */}
        {type === 'workout_session' && (
          <View style={styles.section}>
            <Text style={styles.label}>Séance</Text>
            {selectedSession && (
              <View style={styles.selectedSession}>
                <View style={[styles.sessionDot, { backgroundColor: selectedSession.color }]} />
                <Text style={styles.selectedSessionText}>{selectedSession.name}</Text>
                <Pressable onPress={() => { setSelectedSessionId(null); setSelectedSession(null); }}>
                  <Text style={styles.clearSession}>×</Text>
                </Pressable>
              </View>
            )}
            {allPrograms.length === 0 ? (
              <Text style={styles.emptyText}>Aucun programme créé.</Text>
            ) : (
              allPrograms.map((prog) => (
                <View key={prog.id}>
                  <Pressable style={styles.programRow} onPress={() => handleToggleProgram(prog)}>
                    <Text style={styles.programName}>{prog.name}</Text>
                    <Text style={styles.programChevron}>{expandedProgramId === prog.id ? '▾' : '▸'}</Text>
                  </Pressable>
                  {expandedProgramId === prog.id && (
                    <View style={styles.sessionList}>
                      {(sessionsByProgram[prog.id] ?? []).map((s) => (
                        <Pressable
                          key={s.id}
                          style={[styles.sessionRow, selectedSessionId === s.id && styles.sessionRowSelected]}
                          onPress={() => handleSelectSession(s)}
                        >
                          <View style={[styles.sessionDot, { backgroundColor: s.color }]} />
                          <Text style={styles.sessionName}>{s.name}</Text>
                          {selectedSessionId === s.id && <Text style={styles.checkmark}>✓</Text>}
                        </Pressable>
                      ))}
                      {(sessionsByProgram[prog.id] ?? []).length === 0 && (
                        <Text style={styles.emptyText}>Aucune séance dans ce programme.</Text>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Quand : date précise ou sans date fixe (à la semaine) */}
        <View style={styles.section}>
          <Text style={styles.label}>Quand</Text>
          <WhenPickerField
            mode={eventMode}
            onModeChange={setEventMode}
            date={selectedDate}
            onDateChange={setSelectedDate}
            week={selectedWeek}
            onWeekChange={setSelectedWeek}
          />
        </View>

        <Pressable
          style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!canCreate}
        >
          <Text style={styles.createBtnText}>Créer l'événement</Text>
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
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8,
    padding: 10, fontSize: 15, backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 70 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  typeChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  typeChipText: { fontSize: 14, color: '#444' },
  typeChipTextActive: { color: '#fff' },

  selectedSession: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#e8f0fe', borderRadius: 10, padding: 10, marginBottom: 10,
  },
  selectedSessionText: { flex: 1, fontSize: 14, color: '#007AFF', fontWeight: '500' },
  clearSession: { fontSize: 18, color: '#007AFF', fontWeight: '700', paddingHorizontal: 4 },

  programRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  programName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  programChevron: { fontSize: 14, color: '#888' },
  sessionList: { paddingLeft: 12, paddingBottom: 4 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  sessionRowSelected: { backgroundColor: '#f0f7ff' },
  sessionDot: { width: 10, height: 10, borderRadius: 5 },
  sessionName: { flex: 1, fontSize: 14, color: '#333' },
  checkmark: { fontSize: 14, color: '#007AFF', fontWeight: '700' },
  emptyText: { fontSize: 14, color: '#aaa', fontStyle: 'italic', paddingVertical: 8 },

  createBtn: {
    backgroundColor: '#007AFF', marginHorizontal: 12, marginTop: 16,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
