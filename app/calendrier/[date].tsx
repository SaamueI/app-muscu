import { eq, inArray, like } from 'drizzle-orm';
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
import { calendarEvents, workoutSessions } from '../../src/db/schema';
import { deleteCalendarEventCascade, finishSession, getExistingSession } from '../../src/db/session';
import { getEffectiveStatus, STATUS_COLORS, STATUS_LABELS } from '../../src/utils/eventStatus';
import { getPlannedSessionRoute } from '../../src/utils/plannedSessionRoute';
import { startPlannedSession } from '../../src/utils/startSessionFlow';

type CalendarEvent = typeof calendarEvents.$inferSelect;

const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

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
  const [sessionIdByEvent, setSessionIdByEvent] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!date) return;
    const rows = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.date, date));
    setEvents(rows);

    const sessionEventIds = rows.filter((r) => r.type === 'workout_session').map((r) => r.id);
    if (sessionEventIds.length > 0) {
      const sessions = await db
        .select()
        .from(workoutSessions)
        .where(inArray(workoutSessions.calendarEventId, sessionEventIds));
      const map: Record<string, string> = {};
      for (const s of sessions) map[s.calendarEventId] = s.id;
      setSessionIdByEvent(map);
    } else {
      setSessionIdByEvent({});
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleStart = async (ev: CalendarEvent) => {
    setOpenMenu(null);
    const existing = await getExistingSession(ev.id);
    if (existing) {
      router.push(`/seance/${existing}` as any);
      return;
    }
    startPlannedSession(ev, (sessionId) => router.push(`/seance/${sessionId}` as any));
  };

  const handleFinishEvent = (ev: CalendarEvent) => {
    const sessionId = sessionIdByEvent[ev.id];
    if (!sessionId) return;
    Alert.alert('Terminer la séance', 'Confirmer la fin de la séance ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer', style: 'destructive',
        onPress: async () => {
          await finishSession(sessionId);
          setOpenMenu(null);
          load();
        },
      },
    ]);
  };

  const handleViewPlannedSession = async (ev: CalendarEvent) => {
    setOpenMenu(null);
    const route = await getPlannedSessionRoute(ev);
    if (!route) {
      Alert.alert('Séance introuvable', "La séance planifiée liée à cet événement n'existe plus.");
      return;
    }
    router.push(route as any);
  };

  const deleteEvent = (ev: CalendarEvent) => {
    Alert.alert('Supprimer', `Supprimer "${ev.title || 'cet événement'}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive',
        onPress: async () => {
          await deleteCalendarEventCascade(ev.id);
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
            {events.map((ev) => {
              const hasSession = !!sessionIdByEvent[ev.id];
              const effectiveStatus = getEffectiveStatus(ev.status, hasSession);
              return (
              <View key={ev.id}>
                <Pressable
                  style={styles.eventRow}
                  onPress={() => setOpenMenu(openMenu === ev.id ? null : ev.id)}
                >
                  <View style={[styles.dot, { backgroundColor: STATUS_COLORS[effectiveStatus] }]} />
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{ev.title || '(sans titre)'}</Text>
                    {ev.description ? (
                      <Text style={styles.eventDesc} numberOfLines={1}>{ev.description}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[effectiveStatus] + '22' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLORS[effectiveStatus] }]}>
                      {STATUS_LABELS[effectiveStatus]}
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
                            {hasSession ? 'Poursuivre la séance' : 'Commencer la séance'}
                          </Text>
                        </Pressable>
                        <View style={styles.actionDivider} />
                      </>
                    )}
                    {ev.type === 'workout_session' && ev.status !== 'completed' && hasSession && (
                      <>
                        <Pressable style={styles.actionItem} onPress={() => handleFinishEvent(ev)}>
                          <Text style={[styles.actionText, styles.actionTextRed]}>Terminer la séance</Text>
                        </Pressable>
                        <View style={styles.actionDivider} />
                      </>
                    )}
                    {ev.type === 'workout_session' && sessionIdByEvent[ev.id] && (
                      <>
                        <Pressable
                          style={styles.actionItem}
                          onPress={() => { setOpenMenu(null); router.push(`/seance/details/${sessionIdByEvent[ev.id]}` as any); }}
                        >
                          <Text style={styles.actionText}>Voir les détails</Text>
                        </Pressable>
                        <View style={styles.actionDivider} />
                      </>
                    )}
                    {ev.type === 'workout_session' && ev.refId && (
                      <>
                        <Pressable style={styles.actionItem} onPress={() => handleViewPlannedSession(ev)}>
                          <Text style={styles.actionText}>Voir la séance planifiée</Text>
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
              );
            })}
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
