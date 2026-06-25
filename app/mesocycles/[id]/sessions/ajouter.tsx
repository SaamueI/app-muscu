import { asc, eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../../../src/db';
import { addBlankMesoSession, copyProgramSessionToMeso } from '../../../../src/db/meso';
import { mesocycles, mesoSessions, programs, programSessions } from '../../../../src/db/schema';

type Program = typeof programs.$inferSelect;
type ProgramSession = typeof programSessions.$inferSelect;

const DAY_LABELS: Record<string, string> = {
  Monday: 'Lun', Tuesday: 'Mar', Wednesday: 'Mer', Thursday: 'Jeu',
  Friday: 'Ven', Saturday: 'Sam', Sunday: 'Dim',
};

export default function AjouterSessionScreen() {
  const { id, week } = useLocalSearchParams<{ id: string; week: string }>();
  const router = useRouter();
  const weekIndex = parseInt(week ?? '1', 10);

  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [sessionsByProgram, setSessionsByProgram] = useState<Record<string, ProgramSession[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [meso] = await db.select().from(mesocycles).where(eq(mesocycles.id, id));
      const progs = await db.select().from(programs).orderBy(asc(programs.name));
      setAllPrograms(progs);

      const sessions = await db.select().from(programSessions).orderBy(asc(programSessions.order));
      const grouped: Record<string, ProgramSession[]> = {};
      for (const s of sessions) {
        (grouped[s.programId] ??= []).push(s);
      }
      setSessionsByProgram(grouped);

      // Déplie le programme affecté au mésocycle par défaut
      if (meso?.programId) setExpanded(meso.programId);
    })();
  }, [id]);

  const nextOrder = async (): Promise<number> => {
    const existing = await db
      .select()
      .from(mesoSessions)
      .where(eq(mesoSessions.mesocycleId, id!));
    return existing.filter((s) => s.weekIndex === weekIndex).length;
  };

  const handlePick = async (ps: ProgramSession) => {
    if (busy || !id) return;
    setBusy(true);
    await copyProgramSessionToMeso(ps.id, id, weekIndex, await nextOrder());
    router.back();
  };

  const handleBlank = async () => {
    if (busy || !id) return;
    setBusy(true);
    await addBlankMesoSession(id, weekIndex, await nextOrder());
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Ajouter une séance en semaine {weekIndex}</Text>

      <Pressable style={styles.blankBtn} onPress={handleBlank} disabled={busy}>
        <Text style={styles.blankBtnText}>+ Séance vierge</Text>
      </Pressable>

      {allPrograms.length === 0 ? (
        <Text style={styles.empty}>Aucun programme. Crée d'abord un programme avec des séances.</Text>
      ) : (
        allPrograms.map((prog) => {
          const list = sessionsByProgram[prog.id] ?? [];
          const isOpen = expanded === prog.id;
          return (
            <View key={prog.id} style={styles.progCard}>
              <Pressable
                style={styles.progHeader}
                onPress={() => setExpanded(isOpen ? null : prog.id)}
              >
                <Text style={styles.progChevron}>{isOpen ? '▾' : '▸'}</Text>
                <Text style={styles.progName}>{prog.name}</Text>
                <Text style={styles.progCount}>{list.length}</Text>
              </Pressable>
              {isOpen && (
                <View style={styles.progBody}>
                  {list.length === 0 ? (
                    <Text style={styles.empty}>Aucune séance dans ce programme.</Text>
                  ) : (
                    list.map((s) => (
                      <Pressable key={s.id} style={styles.sessionRow} onPress={() => handlePick(s)}>
                        <View style={[styles.dot, { backgroundColor: s.color }]} />
                        <Text style={styles.sessionName}>{s.name}</Text>
                        {s.day ? <Text style={styles.sessionDay}>{DAY_LABELS[s.day]}</Text> : null}
                        <Text style={styles.plus}>+</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 12, paddingBottom: 40 },
  heading: { fontSize: 15, fontWeight: '600', color: '#555', marginBottom: 12, marginHorizontal: 2 },
  blankBtn: {
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 13, alignItems: 'center',
    marginBottom: 12, borderWidth: 1, borderColor: '#c8e0ff', borderStyle: 'dashed',
  },
  blankBtnText: { color: '#007AFF', fontWeight: '700', fontSize: 15 },
  empty: { fontSize: 14, color: '#aaa', fontStyle: 'italic', paddingVertical: 8 },

  progCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  progHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  progChevron: { fontSize: 13, color: '#888', width: 14 },
  progName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111' },
  progCount: { fontSize: 12, color: '#aaa' },

  progBody: { paddingHorizontal: 14, paddingBottom: 8 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  dot: { width: 11, height: 11, borderRadius: 6 },
  sessionName: { flex: 1, fontSize: 15, color: '#111' },
  sessionDay: { fontSize: 12, color: '#888' },
  plus: { fontSize: 20, color: '#007AFF', fontWeight: '600', paddingHorizontal: 4 },
});
