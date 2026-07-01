import { eq, like } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { calendarEvents } from '../../src/db/schema';
import { getExistingSession, startWorkoutSession } from '../../src/db/session';

type CalendarEvent = typeof calendarEvents.$inferSelect;

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifié',
  completed: 'Terminé',
  skipped: 'Annulé',
};
const STATUS_COLORS: Record<string, string> = {
  planned: '#007AFF',
  completed: '#34C759',
  skipped: '#8E8E93',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export default function JourDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.date, date));
    setEvents(rows);
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleStart = async (ev: CalendarEvent) => {
    setOpenMenu(null);
    const existing = await getExistingSession(ev.id);
    const sessionId = existing ?? await startWorkoutSession({ calendarEventId: ev.id });
    router.push(`/seance/${sessionId}` as any);
  };

  const deleteEvent = (ev: CalendarEvent) => {
    Alert.alert('Supprimer', `Supprimer "${ev.title || 'cet événement'}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await db.delete(calendarEvents).where(eq(calendarEvents.id, ev.id));
          setOpenMenu(null);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.dateHeader}>{capitalize(formatDate(date ?? ''))}</Text>

        {events.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Aucun événement ce jour.</Text>
          </View>
        ) : (
          <View style={styles.section}>
            {events.map((ev) => (
              <View key={ev.id}>
                <Pressable
                  style={styles.eventRow}
                  onPress={() => setOpenMenu(openMenu === ev.id ? null : ev.id)}
                >
                  <View style={[styles.dot, { backgroundColor: STATUS_COLORS[ev.status] }]} />
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{ev.title || '(sans titre)'}</Text>
                    {ev.description ? (
                      <Text style={styles.eventDesc} numberOfLines={1}>{ev.description}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[ev.status] + '22' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLORS[ev.status] }]}>
                      {STATUS_LABELS[ev.status]}
                    </Text>
                  </View>
                  <Text style={styles.menuDots}>⋮</Text>
                </Pressable>
                {openMenu === ev.id && (
                  <View style={styles.actionMenu}>
                    {ev.type === 'workout_session' && ev.status !== 'completed' && (
                      <>
                        <Pressable style={styles.actionItem} onPress={() => handleStart(ev)}>
                          <Text style={[styles.actionText, styles.actionTextBlue]}>
                            {ev.status === 'planned' ? 'Commencer la séance' : 'Reprendre la séance'}
                          </Text>
                        </Pressable>
                        <View style={styles.actionDivider} />
                      </>
                    )}
                    <Pressable
                      style={styles.actionItem}
                      onPress={() => { setOpenMenu(null); router.push(`/calendrier/event/${ev.id}/modifier`); }}
                    >
                      <Text style={styles.actionText}>Modifier</Text>
                    </Pressable>
                    <View style={styles.actionDivider} />
                    <Pressable style={styles.actionItem} onPress={() => deleteEvent(ev)}>
                      <Text style={[styles.actionText, styles.actionTextRed]}>Supprimer</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push(`/calendrier/event/nouveau?date=${date}`)}
        >
          <Text style={styles.addBtnText}>Ajouter un événement</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { flex: 1 },
  content: { paddingBottom: 16 },

  dateHeader: {
    fontSize: 20, fontWeight: '700', color: '#111',
    margin: 16, marginBottom: 12,
  },

  emptyBox: {
    backgroundColor: '#fff', marginHorizontal: 12,
    borderRadius: 12, padding: 20, alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12,
    borderRadius: 12, overflow: 'hidden',
  },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
  eventDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  menuDots: { fontSize: 18, color: '#aaa', paddingHorizontal: 4 },

  actionMenu: {
    backgroundColor: '#fff', borderRadius: 10,
    marginHorizontal: 14, marginBottom: 4,
    borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden',
  },
  actionItem: { paddingVertical: 12, paddingHorizontal: 16 },
  actionText: { fontSize: 15, color: '#111' },
  actionTextRed: { color: '#FF3B30' },
  actionTextBlue: { color: '#007AFF', fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: '#f0f0f0' },

  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0',
    padding: 16, paddingBottom: 32,
  },
  addBtn: {
    backgroundColor: '#007AFF', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
