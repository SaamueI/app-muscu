import { asc, eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { programExercises, programs, programSessions } from '../../src/db/schema';
import { exportProgram } from '../../src/export/actions';
import { generateId } from '../../src/utils/generateId';

type Program = typeof programs.$inferSelect;
type Session = typeof programSessions.$inferSelect;

export default function ProgrammeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [program, setProgram] = useState<Program | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!id || exporting) return;
    setExporting(true);
    await exportProgram(id);
    setExporting(false);
  };

  const load = useCallback(async () => {
    if (!id) return;
    const [prog] = await db.select().from(programs).where(eq(programs.id, id));
    setProgram(prog ?? null);

    const sess = await db
      .select()
      .from(programSessions)
      .where(eq(programSessions.programId, id))
      .orderBy(asc(programSessions.order));
    setSessions(sess);

    const counts: Record<string, number> = {};
    await Promise.all(
      sess.map(async (s) => {
        const rows = await db
          .select()
          .from(programExercises)
          .where(eq(programExercises.programSessionId, s.id));
        counts[s.id] = rows.length;
      })
    );
    setExerciseCounts(counts);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push(`/programmes/${id}/modifier`)}>
          <Text style={styles.headerBtn}>Modifier</Text>
        </Pressable>
      ),
    });
  }, [id]);

  const addSession = async () => {
    const newId = generateId();
    await db.insert(programSessions).values({
      id: newId,
      programId: id!,
      name: 'Nouvelle séance',
      order: sessions.length,
      color: '#007AFF',
    });
    router.push(`/programmes/${id}/sessions/${newId}/modifier?from=new`);
  };

  if (!program) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const DAY_LABELS: Record<string, string> = {
    Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer', Thursday: 'Jeu',
    Friday: 'Ven', Saturday: 'Sam', Sunday: 'Dim',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.title}>{program.name}</Text>
        {program.description ? (
          <Text style={styles.desc}>{program.description}</Text>
        ) : null}
      </View>

      {/* Séances */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Séances</Text>

        {sessions.length === 0 ? (
          <Text style={styles.empty}>Aucune séance — appuie sur + pour en ajouter.</Text>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(s) => s.id}
            scrollEnabled={false}
            renderItem={({ item: s }) => (
              <Pressable
                style={styles.sessionCard}
                onPress={() => router.push(`/programmes/${id}/sessions/${s.id}`)}
              >
                <View style={[styles.colorDot, { backgroundColor: s.color }]} />
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName}>{s.name}</Text>
                  <Text style={styles.sessionMeta}>
                    {s.day ? DAY_LABELS[s.day] + ' · ' : ''}
                    {exerciseCounts[s.id] ?? 0} exercice{(exerciseCounts[s.id] ?? 0) !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Pressable style={styles.launchBtn} disabled>
                  <Text style={styles.launchBtnText}>▶</Text>
                </Pressable>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            )}
          />
        )}

        <Pressable style={styles.addSessionBtn} onPress={addSession}>
          <Text style={styles.addSessionBtnText}>+ Ajouter une séance</Text>
        </Pressable>
      </View>

      <Pressable style={styles.exportBtn} onPress={onExport} disabled={exporting}>
        <Text style={styles.exportBtnText}>
          {exporting ? 'Export…' : 'Exporter (Excel)'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { color: '#007AFF', fontSize: 16, marginRight: 4 },

  header: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  desc: { fontSize: 14, color: '#666', marginTop: 6, lineHeight: 20 },

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
  empty: { color: '#aaa', fontSize: 14, textAlign: 'center', paddingVertical: 12 },

  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  colorDot: { width: 12, height: 12, borderRadius: 6 },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  sessionMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  launchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.4,
  },
  launchBtnText: { fontSize: 13, color: '#555' },
  chevron: { fontSize: 20, color: '#ccc' },

  addSessionBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f0f7ff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e0ff',
    borderStyle: 'dashed',
  },
  addSessionBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },

  exportBtn: {
    marginHorizontal: 12, marginTop: 20, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: '#007AFF',
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
