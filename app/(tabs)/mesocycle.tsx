import { desc, eq } from 'drizzle-orm';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { db } from '../../src/db';
import { mesocycles, programs } from '../../src/db/schema';

type Row = { m: typeof mesocycles.$inferSelect; programName: string | null };

export default function MesocycleScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [rows, setRows] = useState<Row[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await db
      .select({ m: mesocycles, programName: programs.name })
      .from(mesocycles)
      .leftJoin(programs, eq(mesocycles.programId, programs.id))
      .orderBy(desc(mesocycles.createdAt));
    setRows(data);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable onPress={() => setEditMode((e) => !e)}>
            <Text style={styles.headerBtn}>{editMode ? 'OK' : 'Modifier'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/mesocycles/nouveau')}>
            <Text style={styles.headerPlus}>+</Text>
          </Pressable>
        </View>
      ),
    });
  }, [editMode]);

  const remove = (id: string, name: string) => {
    Alert.alert('Supprimer', `Supprimer le mésocycle « ${name} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await db.delete(mesocycles).where(eq(mesocycles.id, id));
          setOpenMenu(null);
          load();
        },
      },
    ]);
  };

  const subtitle = (r: Row) => {
    const weeks = `${r.m.numWeeks} semaine${r.m.numWeeks > 1 ? 's' : ''}`;
    return r.programName ? `${weeks} · ${r.programName}` : weeks;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Aucun mésocycle — appuie sur + pour en créer un.</Text>
        }
        renderItem={({ item }) => (
          <View>
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/mesocycles/${item.m.id}`)}
              onLongPress={() => !editMode && setOpenMenu(openMenu === item.m.id ? null : item.m.id)}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardName}>{item.m.name}</Text>
                <Text style={styles.cardSub}>{subtitle(item)}</Text>
              </View>
              {editMode ? (
                <View style={styles.editActions}>
                  <Pressable
                    hitSlop={8}
                    onPress={() => router.push(`/mesocycles/${item.m.id}/modifier`)}
                  >
                    <Text style={styles.editAction}>Modifier</Text>
                  </Pressable>
                  <Pressable hitSlop={8} onPress={() => remove(item.m.id, item.m.name)}>
                    <Text style={[styles.editAction, styles.editActionRed]}>Supprimer</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>

            {openMenu === item.m.id && !editMode && (
              <View style={styles.actionMenu}>
                <Pressable
                  style={styles.actionItem}
                  onPress={() => {
                    setOpenMenu(null);
                    router.push(`/mesocycles/${item.m.id}/modifier`);
                  }}
                >
                  <Text style={styles.actionText}>Modifier</Text>
                </Pressable>
                <View style={styles.actionDivider} />
                <Pressable style={styles.actionItem} onPress={() => remove(item.m.id, item.m.name)}>
                  <Text style={[styles.actionText, styles.actionTextRed]}>Supprimer</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  headerRight: { flexDirection: 'row', gap: 16, marginRight: 4, alignItems: 'center' },
  headerBtn: { color: '#007AFF', fontSize: 16 },
  headerPlus: { color: '#007AFF', fontSize: 26, lineHeight: 28 },

  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40 },
  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },

  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardSub: { fontSize: 13, color: '#888', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc', marginLeft: 8 },

  editActions: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  editAction: { fontSize: 14, color: '#007AFF' },
  editActionRed: { color: '#FF3B30' },

  actionMenu: {
    backgroundColor: '#fff', borderRadius: 10, marginBottom: 8, marginTop: -2,
    borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden',
  },
  actionItem: { paddingVertical: 12, paddingHorizontal: 16 },
  actionText: { fontSize: 15, color: '#111' },
  actionTextRed: { color: '#FF3B30' },
  actionDivider: { height: 1, backgroundColor: '#f0f0f0' },
});
