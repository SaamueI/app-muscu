import { asc, eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../src/db';
import { mesocycles, mesoSessions, programs } from '../../src/db/schema';
import { exportMesocycle } from '../../src/export/actions';

type Mesocycle = typeof mesocycles.$inferSelect;
type MesoSession = typeof mesoSessions.$inferSelect;

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
  Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche',
};

export default function MesocycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meso, setMeso] = useState<Mesocycle | null>(null);
  const [programName, setProgramName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<MesoSession[]>([]);
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!id || exporting) return;
    setExporting(true);
    await exportMesocycle(id);
    setExporting(false);
  };

  const load = useCallback(async () => {
    if (!id) return;
    const [m] = await db.select().from(mesocycles).where(eq(mesocycles.id, id));
    setMeso(m ?? null);
    if (m?.programId) {
      const [p] = await db.select().from(programs).where(eq(programs.id, m.programId));
      setProgramName(p?.name ?? null);
    } else {
      setProgramName(null);
    }
    const rows = await db
      .select()
      .from(mesoSessions)
      .where(eq(mesoSessions.mesocycleId, id))
      .orderBy(asc(mesoSessions.order));
    setSessions(rows);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!meso) {
    return <View style={styles.center}><Text>Chargement…</Text></View>;
  }

  const weeks = Array.from({ length: meso.numWeeks }, (_, i) => i + 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Pressable
          style={styles.editIcon}
          hitSlop={10}
          onPress={() => router.push(`/mesocycles/${id}/modifier`)}
        >
          <Text style={styles.editIconText}>✎</Text>
        </Pressable>
        <Text style={styles.title}>{meso.name}</Text>
        {programName ? <Text style={styles.metaProg}>Programme : {programName}</Text> : null}
        {meso.notes ? <Text style={styles.notes}>{meso.notes}</Text> : null}
      </View>

      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionHeading}>Séances programmées</Text>
        <Pressable hitSlop={10} onPress={() => router.push(`/mesocycles/${id}/sessions`)}>
          <Text style={styles.editIconText}>✎</Text>
        </Pressable>
      </View>

      {weeks.length === 0 ? (
        <View style={styles.section}>
          <Text style={styles.empty}>Aucune semaine. Ouvre « Gérer les séances » pour commencer.</Text>
        </View>
      ) : (
        weeks.map((w) => {
          const weekSessions = sessions.filter((s) => s.weekIndex === w);
          return (
            <View key={w} style={styles.section}>
              <Text style={styles.weekTitle}>Semaine {w}</Text>
              {weekSessions.length === 0 ? (
                <Text style={styles.empty}>Aucune séance.</Text>
              ) : (
                weekSessions.map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.sessionRow}
                    onPress={() => router.push(`/mesocycles/${id}/sessions/${s.id}`)}
                  >
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <Text style={styles.sessionName}>{s.title || 'Séance'}</Text>
                    {s.day ? <Text style={styles.sessionDay}>{DAY_LABELS[s.day]}</Text> : null}
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))
              )}
            </View>
          );
        })
      )}

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

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14, position: 'relative',
  },
  editIcon: { position: 'absolute', top: 10, right: 12, padding: 4, zIndex: 1 },
  editIconText: { fontSize: 20, color: '#007AFF' },
  sectionHeadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 18, marginBottom: -4,
  },
  sectionHeading: {
    fontSize: 13, fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111', paddingRight: 28 },
  metaProg: { fontSize: 14, color: '#007AFF', marginTop: 6 },
  notes: { fontSize: 14, color: '#444', marginTop: 8, lineHeight: 20 },

  manageBtn: {
    backgroundColor: '#007AFF', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  manageBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  weekTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
  sessionName: { flex: 1, fontSize: 15, color: '#111' },
  sessionDay: { fontSize: 12, color: '#888' },
  chevron: { fontSize: 18, color: '#ccc' },

  exportBtn: {
    marginHorizontal: 12, marginTop: 20, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: '#007AFF',
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
