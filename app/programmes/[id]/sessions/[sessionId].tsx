import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../../../src/db';
import { exercises, programExercises, programSessions } from '../../../../src/db/schema';
import { formatTargets } from '../../../../src/utils/formatTargets';
import { startWorkoutSession } from '../../../../src/db/session';
import { generateId } from '../../../../src/utils/generateId';

type Session = typeof programSessions.$inferSelect;
type ProgramExercise = typeof programExercises.$inferSelect;
type Exercise = typeof exercises.$inferSelect;

type PEWithExercise = { pe: ProgramExercise; exercise: Exercise };

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
  Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche',
};

export default function SeanceDetailScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<PEWithExercise[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (peId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(peId)) next.delete(peId); else next.add(peId);
      return next;
    });
  };

  const handleSuperset = async () => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    const allSameGroup = items
      .filter((i) => ids.includes(i.pe.id))
      .every((i) => i.pe.supersetGroupId && i.pe.supersetGroupId === items.find((x) => x.pe.id === ids[0])?.pe.supersetGroupId);
    const groupId = allSameGroup ? null : generateId();
    for (const peId of ids) {
      await db.update(programExercises).set({ supersetGroupId: groupId }).where(eq(programExercises.id, peId));
    }
    setSelectedIds(new Set());
    load();
  };

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [s] = await db.select().from(programSessions).where(eq(programSessions.id, sessionId));
    setSession(s ?? null);

    const rows = await db
      .select({ pe: programExercises, exercise: exercises })
      .from(programExercises)
      .innerJoin(exercises, eq(programExercises.exerciseId, exercises.id))
      .where(eq(programExercises.programSessionId, sessionId))
      .orderBy(programExercises.order);
    setItems(rows);
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 12, marginRight: 4 }}>
          <Pressable onPress={() => router.push(`/programmes/${id}/sessions/${sessionId}/ajouter-exercice`)}>
            <Text style={styles.headerBtn}>+</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/programmes/${id}/sessions/${sessionId}/modifier`)}>
            <Text style={styles.headerBtn}>Modifier</Text>
          </Pressable>
        </View>
      ),
    });
  }, [id, sessionId]);

  if (!session) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const targetSummary = (pe: ProgramExercise) => formatTargets(pe);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Bouton commencer */}
      <Pressable
        style={styles.startBtn}
        onPress={async () => {
          const sid = await startWorkoutSession({ programSessionId: sessionId! });
          router.push(`/seance/${sid}` as any);
        }}
      >
        <Text style={styles.startBtnText}>▶ Commencer cette séance</Text>
      </Pressable>

      {/* En-tête séance */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={[styles.colorBadge, { backgroundColor: session.color }]} />
          <Text style={styles.title}>{session.name}</Text>
        </View>
        {session.day ? (
          <Text style={styles.dayLabel}>{DAY_LABELS[session.day]}</Text>
        ) : null}
      </View>

      {/* Liste exercices */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Exercices</Text>

        {selectedIds.size > 0 && (
          <View style={styles.supersetBar}>
            <Text style={styles.supersetBarText}>{selectedIds.size} sélectionné(s)</Text>
            <Pressable style={styles.supersetBarBtn} onPress={handleSuperset}>
              <Text style={styles.supersetBarBtnText}>
                {items.filter((i) => selectedIds.has(i.pe.id)).every((i) => i.pe.supersetGroupId)
                  ? 'Dissoudre le superset'
                  : 'Créer un superset'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setSelectedIds(new Set())}>
              <Text style={styles.supersetBarCancel}>Annuler</Text>
            </Pressable>
          </View>
        )}

        {items.length === 0 ? (
          <Text style={styles.empty}>Aucun exercice — appuie sur + pour en ajouter.</Text>
        ) : (
          items.map((item, index) => {
            const summary = targetSummary(item.pe);
            const isSelected = selectedIds.has(item.pe.id);
            const inSuperset = !!item.pe.supersetGroupId;
            return (
              <Pressable
                key={item.pe.id}
                style={[styles.exoCard, isSelected && styles.exoCardSelected]}
                onPress={() =>
                  selectedIds.size > 0
                    ? toggleSelect(item.pe.id)
                    : router.push(`/programmes/${id}/sessions/${sessionId}/exercises/${item.pe.id}`)
                }
                onLongPress={() => toggleSelect(item.pe.id)}
              >
                <View style={[styles.exoNumber, inSuperset && styles.exoNumberSuperset]}>
                  <Text style={styles.exoNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.exoInfo}>
                  <Text style={styles.exoName}>{item.exercise.name}</Text>
                  {item.pe.selectedVariation ? (
                    <Text style={styles.exoVariant}>{item.pe.selectedVariation}</Text>
                  ) : null}
                  {inSuperset && <Text style={styles.supersetTag}>SUPERSET</Text>}
                  {summary ? <Text style={styles.exoTargets}>{summary}</Text> : null}
                </View>
                <Text style={styles.chevron}>{isSelected ? '✓' : '›'}</Text>
              </Pressable>
            );
          })
        )}

        <Pressable
          style={styles.addBtn}
          onPress={() => router.push(`/programmes/${id}/sessions/${sessionId}/ajouter-exercice`)}
        >
          <Text style={styles.addBtnText}>+ Ajouter un exercice</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBtn: { color: '#007AFF', fontSize: 16 },

  header: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorBadge: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  dayLabel: { fontSize: 13, color: '#888', marginTop: 4, marginLeft: 24 },

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

  exoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  exoNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exoNumberText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  exoInfo: { flex: 1 },
  exoName: { fontSize: 15, fontWeight: '600', color: '#111' },
  exoVariant: { fontSize: 12, color: '#AF52DE', marginTop: 1 },
  exoTargets: { fontSize: 12, color: '#888', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc' },

  addBtn: {
    marginTop: 12,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#f0f7ff',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#c8e0ff',
    borderStyle: 'dashed',
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

  exoCardSelected: { backgroundColor: '#EBF3FF', borderColor: '#007AFF', borderWidth: 1 },
  exoNumberSuperset: { backgroundColor: '#FF9500' },
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
