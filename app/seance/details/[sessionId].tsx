import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../../src/db';
import { calendarEvents } from '../../../src/db/schema';
import {
  getSessionLive,
  getUserWeightUnit,
  type SessionLiveData,
} from '../../../src/db/session';
import { STATUS_COLORS, STATUS_LABELS } from '../../../src/utils/eventStatus';
import { formatSetLine } from '../../../src/utils/formatSetLine';

type CalendarEvent = typeof calendarEvents.$inferSelect;

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const s = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function SessionDetailsScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const navigation = useNavigation();

  const [data, setData] = useState<SessionLiveData | null>(null);
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');

  const load = useCallback(async () => {
    if (!sessionId) return;
    const d = await getSessionLive(sessionId);
    setData(d);
    if (d?.session.calendarEventId) {
      const [ev] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, d.session.calendarEventId));
      setEvent(ev ?? null);
    } else {
      setEvent(null);
    }
    setWeightUnit(await getUserWeightUnit());
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push(`/seance/details/${sessionId}/modifier` as any)}>
          <Text style={styles.headerBtn}>Modifier</Text>
        </Pressable>
      ),
    });
  }, [sessionId]);

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Chargement…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headRow}>
        <Text style={styles.dateHeader}>{formatDate(data.session.date)}</Text>
        {event && (
          <View style={[styles.badge, { backgroundColor: STATUS_COLORS[event.status] + '22' }]}>
            <Text style={[styles.badgeText, { color: STATUS_COLORS[event.status] }]}>
              {STATUS_LABELS[event.status]}
            </Text>
          </View>
        )}
      </View>

      {data.session.finishedAt == null && (
        <Pressable
          style={styles.resumeBtn}
          onPress={() => router.push(`/seance/${sessionId}` as any)}
        >
          <Text style={styles.resumeBtnText}>Reprendre la séance</Text>
        </Pressable>
      )}

      {data.exerciseLogs.map((enriched) => {
        const unit = (enriched.exercise.weightUnit as 'kg' | 'lb' | null) ?? weightUnit;
        return (
          <View key={enriched.log.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{enriched.exercise.name}</Text>
            {enriched.setLogs.length === 0 ? (
              <Text style={styles.emptyText}>Aucune série enregistrée</Text>
            ) : (
              enriched.setLogs.map((sl, i) => {
                if (sl.side === 'R') return null;
                const partner = enriched.setLogs.find(
                  (x) => x.setNumber === sl.setNumber && x.side === 'R'
                );
                const setNum = sl.setNumber ?? i + 1;
                return (
                  <View key={sl.id} style={styles.setRow}>
                    <Text style={styles.setNum}>#{setNum}</Text>
                    <View style={styles.setDetails}>
                      <Text style={styles.setLine}>
                        {sl.side ? 'G : ' : ''}{formatSetLine(sl, unit)}
                      </Text>
                      {partner && (
                        <Text style={[styles.setLine, styles.setLineSub]}>
                          D : {formatSetLine(partner, unit)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7' },
  loading: { color: '#8E8E93' },
  headerBtn: { color: '#007AFF', fontSize: 16, marginRight: 4 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dateHeader: { fontSize: 20, fontWeight: '700', color: '#111', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '600' },

  resumeBtn: {
    backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  resumeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic' },

  setRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93', minWidth: 28 },
  setDetails: { flex: 1, gap: 2 },
  setLine: { fontSize: 15, color: '#1C1C1E' },
  setLineSub: { fontSize: 13, color: '#8E8E93' },
});
