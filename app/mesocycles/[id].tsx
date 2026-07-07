import { and, asc, eq, inArray } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../src/db';
import { duplicateMesocycle } from '../../src/db/meso';
import { calendarEvents, mesocycles, mesoSessions, programs } from '../../src/db/schema';
import { getExistingSession } from '../../src/db/session';
import { exportMesocycle } from '../../src/export/actions';
import { STATUS_COLORS, STATUS_LABELS } from '../../src/utils/eventStatus';

type Mesocycle = typeof mesocycles.$inferSelect;
type MesoSession = typeof mesoSessions.$inferSelect;
type CalendarEvent = typeof calendarEvents.$inferSelect;

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
  const [duplicating, setDuplicating] = useState(false);
  const [eventsByMesoSession, setEventsByMesoSession] = useState<Record<string, CalendarEvent>>({});

  const onExport = async () => {
    if (!id || exporting) return;
    setExporting(true);
    await exportMesocycle(id);
    setExporting(false);
  };

  const onDuplicate = async () => {
    if (!id || duplicating) return;
    setDuplicating(true);
    const newId = await duplicateMesocycle(id);
    setDuplicating(false);
    router.push(`/mesocycles/${newId}`);
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

    if (m?.startDate && rows.length > 0) {
      const sessionIds = rows.map((s) => s.id);
      const events = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.refType, 'meso_session'), inArray(calendarEvents.refId, sessionIds)));
      const map: Record<string, CalendarEvent> = {};
      for (const ev of events) {
        if (ev.refId) map[ev.refId] = ev;
      }
      setEventsByMesoSession(map);
    } else {
      setEventsByMesoSession({});
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleSessionPress = async (s: MesoSession) => {
    const ev = eventsByMesoSession[s.id];
    if (meso?.startDate && ev?.status === 'completed') {
      const sessionId = await getExistingSession(ev.id);
      if (sessionId) {
        router.push(`/seance/details/${sessionId}` as any);
      } else {
        Alert.alert('Séance introuvable', "Impossible de retrouver la séance réalisée pour cet événement.");
      }
      return;
    }
    router.push(`/mesocycles/${id}/sessions/${s.id}`);
  };

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
        <Pressable style={styles.anchorRow} onPress={() => router.push(`/mesocycles/${id}/ancrer`)}>
          <Text style={styles.anchorRowText}>
            {meso.startDate ? `Ancré · départ ${meso.startDate}` : 'Non ancré au calendrier'}
          </Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
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
                weekSessions.map((s) => {
                  const ev = eventsByMesoSession[s.id];
                  return (
                    <Pressable
                      key={s.id}
                      style={styles.sessionRow}
                      onPress={() => handleSessionPress(s)}
                    >
                      <View style={[styles.dot, { backgroundColor: s.color }]} />
                      <Text style={styles.sessionName}>{s.title || 'Séance'}</Text>
                      {s.day ? <Text style={styles.sessionDay}>{DAY_LABELS[s.day]}</Text> : null}
                      {meso.startDate && ev && (
                        <View style={[styles.badge, { backgroundColor: STATUS_COLORS[ev.status] + '22' }]}>
                          <Text style={[styles.badgeText, { color: STATUS_COLORS[ev.status] }]}>
                            {STATUS_LABELS[ev.status]}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  );
                })
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

      <Pressable style={styles.duplicateBtn} onPress={onDuplicate} disabled={duplicating}>
        <Text style={styles.duplicateBtnText}>
          {duplicating ? 'Duplication…' : 'Dupliquer'}
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
  anchorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  anchorRowText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },

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
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  chevron: { fontSize: 18, color: '#ccc' },

  exportBtn: {
    marginHorizontal: 12, marginTop: 20, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: '#007AFF',
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  duplicateBtn: {
    marginHorizontal: 12, marginTop: 10, borderRadius: 12, paddingVertical: 13,
    alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#007AFF',
  },
  duplicateBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 15 },
});
