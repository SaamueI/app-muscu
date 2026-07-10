import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../../../src/db';
import { calendarEvents, exercises, mesoExercises, mesoSessions, mesoSets, workoutSessions } from '../../../../src/db/schema';
import { finishSession, startWorkoutSession } from '../../../../src/db/session';
import { generateId } from '../../../../src/utils/generateId';
import { startPlannedSession } from '../../../../src/utils/startSessionFlow';

type MesoSession = typeof mesoSessions.$inferSelect;
type Exercise = typeof exercises.$inferSelect;
type MesoExercise = typeof mesoExercises.$inferSelect;
type CalendarEvent = typeof calendarEvents.$inferSelect;

type Row = { me: MesoExercise; exercise: Exercise; setCount: number };

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
  Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche',
};

export default function MesoSessionDetailScreen() {
  const { id, mesoSessionId } = useLocalSearchParams<{ id: string; mesoSessionId: string }>();
  const router = useRouter();

  const [session, setSession] = useState<MesoSession | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [inProgressSessionId, setInProgressSessionId] = useState<string | null>(null);

  const toggleSelect = (meId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(meId)) next.delete(meId); else next.add(meId);
      return next;
    });
  };

  const handleSuperset = async () => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const allSameGroup = rows
      .filter((r) => ids.includes(r.me.id))
      .every((r) => r.me.supersetGroupId && r.me.supersetGroupId === rows.find((x) => x.me.id === ids[0])?.me.supersetGroupId);
    const groupId = allSameGroup ? null : generateId();
    for (const meId of ids) {
      await db.update(mesoExercises).set({ supersetGroupId: groupId }).where(eq(mesoExercises.id, meId));
    }
    setSelectedIds(new Set());
    load();
  };

  const load = useCallback(async () => {
    if (!mesoSessionId) return;
    const [s] = await db.select().from(mesoSessions).where(eq(mesoSessions.id, mesoSessionId));
    setSession(s ?? null);

    const exos = await db
      .select({ me: mesoExercises, exercise: exercises })
      .from(mesoExercises)
      .innerJoin(exercises, eq(mesoExercises.exerciseId, exercises.id))
      .where(eq(mesoExercises.mesoSessionId, mesoSessionId))
      .orderBy(asc(mesoExercises.order));

    const ids = exos.map((e) => e.me.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const sets = await db.select().from(mesoSets).where(inArray(mesoSets.mesoExerciseId, ids));
      for (const st of sets) counts[st.mesoExerciseId] = (counts[st.mesoExerciseId] ?? 0) + 1;
    }
    setRows(exos.map((e) => ({ ...e, setCount: counts[e.me.id] ?? 0 })));

    const [ev] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.refType, 'meso_session'), eq(calendarEvents.refId, mesoSessionId)));
    setEvent(ev ?? null);

    if (ev) {
      const [ws] = await db
        .select()
        .from(workoutSessions)
        .where(and(eq(workoutSessions.calendarEventId, ev.id), isNull(workoutSessions.finishedAt)));
      setInProgressSessionId(ws?.id ?? null);
    } else {
      setInProgressSessionId(null);
    }
  }, [mesoSessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const a = rows[index].me;
    const b = rows[target].me;
    await db.update(mesoExercises).set({ order: b.order }).where(eq(mesoExercises.id, a.id));
    await db.update(mesoExercises).set({ order: a.order }).where(eq(mesoExercises.id, b.id));
    load();
  };

  const removeExo = async (meId: string) => {
    await db.delete(mesoExercises).where(eq(mesoExercises.id, meId));
    load();
  };

  const handleStart = async () => {
    if (event) {
      startPlannedSession(event, (sessionId) => router.push(`/seance/${sessionId}` as any));
      return;
    }
    const sid = await startWorkoutSession({ mesoSessionId: mesoSessionId! });
    router.push(`/seance/${sid}` as any);
  };

  const handleResume = () => {
    if (!inProgressSessionId) return;
    router.push(`/seance/${inProgressSessionId}` as any);
  };

  const handleFinish = () => {
    if (!inProgressSessionId) return;
    Alert.alert('Terminer la séance', 'Confirmer la fin de la séance ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Terminer',
        style: 'destructive',
        onPress: async () => {
          await finishSession(inProgressSessionId);
          load();
        },
      },
    ]);
  };

  if (!session) {
    return <View style={styles.center}><Text>Chargement…</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {inProgressSessionId ? (
        <View style={styles.startBtnRow}>
          <Pressable style={[styles.startBtn, styles.resumeBtn]} onPress={handleResume}>
            <Text style={styles.startBtnText}>▶ Poursuivre cette séance</Text>
          </Pressable>
          <Pressable style={[styles.startBtn, styles.finishBtn]} onPress={handleFinish}>
            <Text style={styles.startBtnText}>Terminer cette séance</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.startBtn} onPress={handleStart}>
          <Text style={styles.startBtnText}>▶ Commencer cette séance</Text>
        </Pressable>
      )}

      <View style={styles.header}>
        <Pressable
          style={styles.editIcon}
          hitSlop={10}
          onPress={() => router.push(`/mesocycles/${id}/sessions/${mesoSessionId}/modifier`)}
        >
          <Text style={styles.editIconText}>✎</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <View style={[styles.colorBadge, { backgroundColor: session.color }]} />
          <Text style={styles.title}>{session.title || 'Séance'}</Text>
        </View>
        {session.day ? <Text style={styles.dayLabel}>{DAY_LABELS[session.day]}</Text> : null}
        {session.note ? <Text style={styles.note}>{session.note}</Text> : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Exercices</Text>
          <Pressable onPress={() => setEditMode((e) => !e)}>
            <Text style={styles.sectionEdit}>{editMode ? 'OK' : 'Éditer'}</Text>
          </Pressable>
        </View>

        {!editMode && selectedIds.size > 0 && (
          <View style={styles.supersetBar}>
            <Text style={styles.supersetBarText}>{selectedIds.size} sélectionné(s)</Text>
            <Pressable style={styles.supersetBarBtn} onPress={handleSuperset}>
              <Text style={styles.supersetBarBtnText}>
                {rows.filter((r) => selectedIds.has(r.me.id)).every((r) => r.me.supersetGroupId)
                  ? 'Dissoudre'
                  : 'Superset'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setSelectedIds(new Set())}>
              <Text style={styles.supersetBarCancel}>Annuler</Text>
            </Pressable>
          </View>
        )}

        {rows.length === 0 ? (
          <Text style={styles.empty}>Aucun exercice.</Text>
        ) : (
          rows.map((r, i) => {
            const isSelected = selectedIds.has(r.me.id);
            const inSuperset = !!r.me.supersetGroupId;
            return (
              <View key={r.me.id} style={[styles.exoRow, isSelected && styles.exoRowSelected]}>
                {editMode && (
                  <View style={styles.moveCol}>
                    <Pressable hitSlop={6} onPress={() => move(i, -1)} disabled={i === 0}>
                      <Text style={[styles.moveBtn, i === 0 && styles.moveDisabled]}>▲</Text>
                    </Pressable>
                    <Pressable hitSlop={6} onPress={() => move(i, 1)} disabled={i === rows.length - 1}>
                      <Text style={[styles.moveBtn, i === rows.length - 1 && styles.moveDisabled]}>▼</Text>
                    </Pressable>
                  </View>
                )}
                <Pressable
                  style={styles.exoTap}
                  onPress={() =>
                    !editMode && selectedIds.size > 0
                      ? toggleSelect(r.me.id)
                      : router.push(`/mesocycles/${id}/sessions/${mesoSessionId}/exercises/${r.me.id}${editMode ? '?edit=1' : ''}`)
                  }
                  onLongPress={() => !editMode && toggleSelect(r.me.id)}
                >
                  <View style={styles.exoInfo}>
                    <Text style={styles.exoName}>{r.exercise.name}</Text>
                    {r.me.selectedVariation ? (
                      <Text style={styles.exoVariant}>{r.me.selectedVariation}</Text>
                    ) : null}
                    {inSuperset && <Text style={styles.supersetTag}>SUPERSET</Text>}
                    <Text style={styles.exoSets}>
                      {r.setCount > 0 ? `${r.setCount} série${r.setCount > 1 ? 's' : ''}` : 'Aucun objectif'}
                    </Text>
                  </View>
                  {!editMode && <Text style={styles.chevron}>{isSelected ? '✓' : '›'}</Text>}
                </Pressable>
                {editMode && (
                  <Pressable hitSlop={8} onPress={() => removeExo(r.me.id)}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        {editMode && (
          <Pressable
            style={styles.addBtn}
            onPress={() => router.push(`/mesocycles/${id}/sessions/${mesoSessionId}/ajouter-exercice`)}
          >
            <Text style={styles.addBtnText}>+ Ajouter un exercice</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { color: '#007AFF', fontSize: 16, marginRight: 4 },

  header: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14, position: 'relative',
  },
  editIcon: { position: 'absolute', top: 10, right: 12, padding: 4, zIndex: 1 },
  editIconText: { fontSize: 20, color: '#007AFF' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 28 },
  colorBadge: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  dayLabel: { fontSize: 13, color: '#888', marginTop: 4, marginLeft: 24 },
  note: { fontSize: 14, color: '#444', marginTop: 8, lineHeight: 20 },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionEdit: { fontSize: 14, color: '#007AFF' },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic', paddingVertical: 6 },

  exoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  moveCol: { alignItems: 'center', justifyContent: 'center', paddingRight: 2 },
  moveBtn: { fontSize: 13, color: '#007AFF', paddingVertical: 1 },
  moveDisabled: { color: '#ccc' },
  exoTap: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  exoInfo: { flex: 1 },
  exoName: { fontSize: 15, fontWeight: '600', color: '#111' },
  exoVariant: { fontSize: 12, color: '#AF52DE', marginTop: 1 },
  exoSets: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc' },
  removeBtn: { fontSize: 16, color: '#FF3B30', paddingHorizontal: 6, fontWeight: '600' },

  addBtn: {
    marginTop: 12, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#c8e0ff', borderStyle: 'dashed',
  },
  addBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },

  startBtn: {
    backgroundColor: '#34C759',
    marginHorizontal: 12,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  startBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 16,
  },
  resumeBtn: { flex: 1, marginHorizontal: 0, marginTop: 0, backgroundColor: '#FF9500' },
  finishBtn: { flex: 1, marginHorizontal: 0, marginTop: 0, backgroundColor: '#FF3B30' },

  exoRowSelected: { backgroundColor: '#EBF3FF' },
  supersetTag: { fontSize: 10, fontWeight: '700', color: '#FF9500', letterSpacing: 0.5 },
  supersetBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EBF3FF', borderRadius: 10, padding: 10, marginBottom: 8,
  },
  supersetBarText: { flex: 1, fontSize: 14, color: '#007AFF' },
  supersetBarBtn: { backgroundColor: '#007AFF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  supersetBarBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  supersetBarCancel: { fontSize: 14, color: '#8E8E93' },
});
