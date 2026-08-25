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

import { db } from '../../../../src/db';
import { calendarEvents, mesoSessions, programSessions, programs } from '../../../../src/db/schema';

type CalendarEvent = typeof calendarEvents.$inferSelect;
type Program = typeof programs.$inferSelect;
type ProgramSession = typeof programSessions.$inferSelect;

const TYPE_LABELS: Record<string, string> = {
  workout_session: 'Séance',
  rest: 'Repos',
  competition: 'Compétition',
  other: 'Autre',
};

type EventStatus = 'planned' | 'completed' | 'skipped';

const STATUS_OPTIONS: { key: EventStatus; label: string }[] = [
  { key: 'planned', label: 'Planifié' },
  { key: 'completed', label: 'Terminé' },
  { key: 'skipped', label: 'Annulé' },
];

export default function ModifierEvenementScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EventStatus>('planned');

  // Séance selection
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [sessionsByProgram, setSessionsByProgram] = useState<Record<string, ProgramSession[]>>({});
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<ProgramSession | null>(null);
  const [linkedMesoSessionTitle, setLinkedMesoSessionTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    db.select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, eventId))
      .then(async (rows) => {
        if (!rows[0]) return;
        const ev = rows[0];
        setEvent(ev);
        setTitle(ev.title ?? '');
        setDescription(ev.description ?? '');
        setStatus(ev.status ?? 'planned');

        if (ev.type === 'workout_session') {
          if (ev.refType === 'meso_session' && ev.refId) {
            const [ms] = await db.select().from(mesoSessions).where(eq(mesoSessions.id, ev.refId));
            setLinkedMesoSessionTitle(ms?.title ?? 'Séance de mésocycle');
          } else {
            const progs = await db.select().from(programs).orderBy(asc(programs.name));
            setAllPrograms(progs);

            if (ev.refId) {
              const sessionRows = await db
                .select()
                .from(programSessions)
                .where(eq(programSessions.id, ev.refId));
              if (sessionRows[0]) {
                setSelectedSessionId(sessionRows[0].id);
                setSelectedSession(sessionRows[0]);
              }
            }
          }
        }
      });
  }, [eventId]);

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
  };

  const handleSave = async () => {
    if (!title.trim() || !eventId) return;
    const isMesoLinked = event?.refType === 'meso_session';
    await db
      .update(calendarEvents)
      .set({
        title: title.trim(),
        description: description.trim() || null,
        status,
        ...(isMesoLinked
          ? {}
          : {
              refId: event?.type === 'workout_session' ? (selectedSessionId ?? null) : event?.refId ?? null,
              refType: event?.type === 'workout_session' && selectedSessionId ? ('program_session' as const) : event?.refType ?? null,
            }),
      })
      .where(eq(calendarEvents.id, eventId));
    router.back();
  };

  const canSave = title.trim().length > 0;

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

        {/* Statut */}
        <View style={styles.section}>
          <Text style={styles.label}>Statut</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[styles.chip, status === opt.key && styles.chipActive]}
                onPress={() => setStatus(opt.key)}
              >
                <Text style={[styles.chipText, status === opt.key && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Type (lecture seule) */}
        {event && (
          <View style={styles.section}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyText}>{TYPE_LABELS[event.type] ?? event.type}</Text>
            </View>
          </View>
        )}

        {/* Séance : sélection programme → session */}
        {event?.type === 'workout_session' && (
          <View style={styles.section}>
            <Text style={styles.label}>Séance</Text>

            {event.refType === 'meso_session' ? (
              <View style={styles.readOnlyRow}>
                <Text style={styles.readOnlyText}>
                  {linkedMesoSessionTitle ?? 'Séance de mésocycle'}
                </Text>
                <Text style={[styles.readOnlyText, { fontSize: 12, color: '#aaa', marginTop: 4 }]}>
                  Liée à un mésocycle ancré — modifiable depuis l'écran du mésocycle.
                </Text>
              </View>
            ) : (
              <>
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
              </>
            )}
          </View>
        )}

        {/* Enregistrer */}
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
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
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#444' },
  chipTextActive: { color: '#fff' },

  readOnlyRow: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10 },
  readOnlyText: { fontSize: 15, color: '#555' },

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

  saveBtn: {
    backgroundColor: '#007AFF', marginHorizontal: 12, marginTop: 16,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
