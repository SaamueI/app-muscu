import { asc, eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../../src/db';
import { addWeek, deleteMesoSessionCascade, deleteWeek, duplicateWeek } from '../../../src/db/meso';
import { mesocycles, mesoSessions } from '../../../src/db/schema';
import { getSkipSessionConfirm, setSkipSessionConfirm } from '../../../src/utils/mesoDeletePref';

type MesoSession = typeof mesoSessions.$inferSelect;

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer', Thursday: 'Jeu',
  Friday: 'Ven', Saturday: 'Sam', Sunday: 'Dim',
};

export default function SessionsEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [numWeeks, setNumWeeks] = useState(0);
  const [sessions, setSessions] = useState<MesoSession[]>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<MesoSession | null>(null);
  const [dontAskNext, setDontAskNext] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [m] = await db.select().from(mesocycles).where(eq(mesocycles.id, id));
    setNumWeeks(m?.numWeeks ?? 0);
    const rows = await db
      .select()
      .from(mesoSessions)
      .where(eq(mesoSessions.mesocycleId, id))
      .orderBy(asc(mesoSessions.order));
    setSessions(rows);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = (w: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(w) ? next.delete(w) : next.add(w);
      return next;
    });
  };

  const runBusy = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await load(); } finally { setBusy(false); }
  };

  const handleAddWeek = () => runBusy(() => addWeek(id!));
  const handleDuplicate = (w: number) => runBusy(() => duplicateWeek(id!, w));

  const handleDeleteWeek = (w: number) => {
    Alert.alert('Supprimer la semaine', `Supprimer la semaine ${w} et ses séances ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => runBusy(() => deleteWeek(id!, w)) },
    ]);
  };

  const deleteSession = (s: MesoSession) =>
    runBusy(() => deleteMesoSessionCascade(s.id));

  const askDeleteSession = (s: MesoSession) => {
    if (getSkipSessionConfirm()) {
      deleteSession(s);
    } else {
      setDontAskNext(false);
      setPendingDelete(s);
    }
  };

  const confirmDelete = () => {
    if (dontAskNext) setSkipSessionConfirm(true);
    const s = pendingDelete;
    setPendingDelete(null);
    if (s) deleteSession(s);
  };

  const weeks = Array.from({ length: numWeeks }, (_, i) => i + 1);

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {weeks.length === 0 ? (
          <Text style={styles.emptyTop}>Aucune semaine — ajoute-en une ci-dessous.</Text>
        ) : (
          weeks.map((w) => {
            const weekSessions = sessions.filter((s) => s.weekIndex === w);
            const isCollapsed = collapsed.has(w);
            return (
              <View key={w} style={styles.weekCard}>
                <Pressable style={styles.weekHeader} onPress={() => toggle(w)}>
                  <Text style={styles.weekChevron}>{isCollapsed ? '▸' : '▾'}</Text>
                  <Text style={styles.weekTitle}>Semaine {w}</Text>
                  <Text style={styles.weekCount}>{weekSessions.length}</Text>
                  <Pressable hitSlop={8} onPress={() => handleDuplicate(w)}>
                    <Text style={styles.weekAction}>Dupliquer</Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => handleDeleteWeek(w)}>
                    <Text style={[styles.weekAction, styles.weekActionRed]}>Suppr.</Text>
                  </Pressable>
                </Pressable>

                {!isCollapsed && (
                  <View style={styles.weekBody}>
                    {weekSessions.map((s) => (
                      <View key={s.id} style={styles.sessionRow}>
                        <Pressable
                          style={styles.sessionTap}
                          onPress={() => router.push(`/mesocycles/${id}/sessions/${s.id}`)}
                        >
                          <View style={[styles.dot, { backgroundColor: s.color }]} />
                          <Text style={styles.sessionName}>{s.title || 'Séance'}</Text>
                          {s.day ? <Text style={styles.sessionDay}>{DAY_LABELS[s.day]}</Text> : null}
                        </Pressable>
                        <Pressable hitSlop={8} onPress={() => askDeleteSession(s)}>
                          <Text style={styles.trash}>🗑</Text>
                        </Pressable>
                      </View>
                    ))}
                    <Pressable
                      style={styles.addSessionBtn}
                      onPress={() => router.push(`/mesocycles/${id}/sessions/ajouter?week=${w}`)}
                    >
                      <Text style={styles.addSessionText}>+ Ajouter une séance</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}

        <Pressable style={styles.addWeekBtn} onPress={handleAddWeek} disabled={busy}>
          <Text style={styles.addWeekText}>+ Ajouter une semaine</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPendingDelete(null)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <Text style={styles.dialogTitle}>Supprimer la séance</Text>
            <Text style={styles.dialogMsg}>
              Supprimer « {pendingDelete?.title || 'Séance'} » ?
            </Text>
            <Pressable style={styles.checkRow} onPress={() => setDontAskNext((v) => !v)}>
              <View style={[styles.checkbox, dontAskNext && styles.checkboxOn]}>
                {dontAskNext && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.checkLabel}>Ne plus me demander</Text>
            </Pressable>
            <View style={styles.dialogBtns}>
              <Pressable style={styles.dialogBtn} onPress={() => setPendingDelete(null)}>
                <Text style={styles.dialogBtnText}>Annuler</Text>
              </Pressable>
              <Pressable style={styles.dialogBtn} onPress={confirmDelete}>
                <Text style={[styles.dialogBtnText, styles.dialogBtnDanger]}>Supprimer</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { flex: 1 },
  content: { padding: 12, paddingBottom: 40 },
  emptyTop: { textAlign: 'center', color: '#aaa', marginVertical: 24, fontSize: 14 },

  weekCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  weekHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  weekChevron: { fontSize: 13, color: '#888', width: 14 },
  weekTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
  weekCount: {
    flex: 1, fontSize: 12, color: '#aaa', marginLeft: 2,
  },
  weekAction: { fontSize: 13, color: '#007AFF' },
  weekActionRed: { color: '#FF3B30' },

  weekBody: { paddingHorizontal: 14, paddingBottom: 8 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  sessionTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  sessionName: { flex: 1, fontSize: 15, color: '#111' },
  sessionDay: { fontSize: 12, color: '#888' },
  trash: { fontSize: 16, paddingHorizontal: 6, paddingVertical: 8 },

  addSessionBtn: {
    marginTop: 10, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#c8e0ff', borderStyle: 'dashed',
  },
  addSessionText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },

  addWeekBtn: {
    marginTop: 4, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#007AFF',
  },
  addWeekText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  dialog: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 6 },
  dialogMsg: { fontSize: 14, color: '#444', marginBottom: 14 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: '#bbb',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkLabel: { fontSize: 14, color: '#333' },
  dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  dialogBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  dialogBtnText: { fontSize: 16, color: '#007AFF' },
  dialogBtnDanger: { color: '#FF3B30', fontWeight: '600' },
});
