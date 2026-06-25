import { and, eq, isNotNull, isNull, like } from 'drizzle-orm';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { calendarEvents } from '../../src/db/schema';

type CalendarEvent = typeof calendarEvents.$inferSelect;

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function isoWeekLabel(week: string): string {
  const [yearStr, wStr] = week.split('-W');
  const y = parseInt(yearStr, 10);
  const w = parseInt(wStr, 10);
  const jan4 = new Date(y, 0, 4);
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 4).toLowerCase()}`;
  return `Semaine ${w} · ${fmt(monday)} – ${fmt(sunday)}`;
}

function eventDotColor(ev: CalendarEvent): string {
  if (ev.status === 'completed') return '#34C759';
  if (ev.status === 'skipped') return '#8E8E93';
  return '#007AFF';
}

export default function CalendrierScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [eventsByDate, setEventsByDate] = useState<Record<string, CalendarEvent[]>>({});
  const [weekEvents, setWeekEvents] = useState<CalendarEvent[]>([]);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    const prefix = `${year}-${pad(month + 1)}`;
    const dated = await db
      .select()
      .from(calendarEvents)
      .where(and(isNotNull(calendarEvents.date), like(calendarEvents.date, `${prefix}%`)));

    const grouped: Record<string, CalendarEvent[]> = {};
    for (const ev of dated) {
      const key = ev.date!;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ev);
    }
    setEventsByDate(grouped);

    const undated = await db
      .select()
      .from(calendarEvents)
      .where(and(isNull(calendarEvents.date), isNotNull(calendarEvents.week)));
    setWeekEvents(undated);
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/calendrier/event/nouveau')} style={{ marginRight: 4 }}>
          <Text style={styles.headerBtn}>+</Text>
        </Pressable>
      ),
    });
  }, []);

  const prevMonth = () => {
    setOpenMenu(null);
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setOpenMenu(null);
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
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

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Mon = 0
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(year, month, 1 - startOffset + i);
    return {
      date: d,
      dateStr: toDateStr(d),
      dayNum: d.getDate(),
      isToday: toDateStr(d) === toDateStr(today),
      isOtherMonth: d.getMonth() !== month,
    };
  });

  // Group week events
  const weekGroups: Record<string, CalendarEvent[]> = {};
  for (const ev of weekEvents) {
    const k = ev.week!;
    if (!weekGroups[k]) weekGroups[k] = [];
    weekGroups[k].push(ev);
  }
  const sortedWeeks = Object.keys(weekGroups).sort();

  const CELL_W = Math.floor(SCREEN_WIDTH / 7);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Month navigation */}
      <View style={styles.monthNav}>
        <Pressable onPress={prevMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
        <Pressable onPress={nextMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>

      {/* Day headers */}
      <View style={styles.dayHeaders}>
        {DAY_NAMES.map((d) => (
          <Text key={d} style={[styles.dayHeader, { width: CELL_W }]}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          const dayEvs = eventsByDate[cell.dateStr] ?? [];
          return (
            <Pressable
              key={i}
              style={[styles.cell, { width: CELL_W }, cell.isToday && styles.cellToday]}
              onPress={() => !cell.isOtherMonth && router.push(`/calendrier/${cell.dateStr}`)}
            >
              <Text style={[
                styles.cellNum,
                cell.isOtherMonth && styles.cellNumOther,
                cell.isToday && styles.cellNumToday,
              ]}>
                {cell.dayNum}
              </Text>
              <View style={styles.dotRow}>
                {dayEvs.slice(0, 3).map((ev) => (
                  <View key={ev.id} style={[styles.dot, { backgroundColor: eventDotColor(ev) }]} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Sessions sans jour fixe */}
      {sortedWeeks.length > 0 && (
        <View style={styles.weekSection}>
          <Text style={styles.weekSectionTitle}>Sans jour fixe</Text>
          {sortedWeeks.map((week) => (
            <View key={week}>
              <Text style={styles.weekLabel}>{isoWeekLabel(week)}</Text>
              {weekGroups[week].map((ev) => (
                <View key={ev.id}>
                  <Pressable
                    style={styles.weekRow}
                    onPress={() => setOpenMenu(openMenu === ev.id ? null : ev.id)}
                  >
                    <View style={[styles.dot, { backgroundColor: eventDotColor(ev) }]} />
                    <Text style={styles.weekRowTitle} numberOfLines={1}>
                      {ev.title || '(sans titre)'}
                    </Text>
                    <Text style={styles.menuDots}>⋮</Text>
                  </Pressable>
                  {openMenu === ev.id && (
                    <View style={styles.actionMenu}>
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
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  headerBtn: { color: '#007AFF', fontSize: 26, marginRight: 4 },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 26, color: '#007AFF', lineHeight: 30 },
  monthLabel: { fontSize: 17, fontWeight: '600', color: '#111' },

  dayHeaders: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  dayHeader: { textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#888', paddingVertical: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', marginBottom: 1 },
  cell: {
    height: 52, alignItems: 'center', paddingTop: 6,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f0f0f0',
  },
  cellToday: { backgroundColor: '#EBF3FF' },
  cellNum: { fontSize: 14, color: '#222', marginBottom: 3 },
  cellNumOther: { color: '#d0d0d0' },
  cellNumToday: { color: '#007AFF', fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 3, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },

  weekSection: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  weekSectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  weekLabel: { fontSize: 12, color: '#888', fontWeight: '500', marginTop: 8, marginBottom: 4 },
  weekRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  weekRowTitle: { flex: 1, fontSize: 15, color: '#111' },
  menuDots: { fontSize: 18, color: '#aaa', paddingHorizontal: 4 },

  actionMenu: {
    backgroundColor: '#fff', borderRadius: 10, marginBottom: 4,
    borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden',
  },
  actionItem: { paddingVertical: 12, paddingHorizontal: 16 },
  actionText: { fontSize: 15, color: '#111' },
  actionTextRed: { color: '#FF3B30' },
  actionDivider: { height: 1, backgroundColor: '#f0f0f0' },
});
