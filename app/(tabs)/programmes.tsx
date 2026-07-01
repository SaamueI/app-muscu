import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { programs } from '../../src/db/schema';
import { pickAndImportProgram } from '../../src/export/actions';

type Program = typeof programs.$inferSelect;

export default function ProgrammesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    db.select().from(programs).then(setAllPrograms);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onImport = async () => {
    const newId = await pickAndImportProgram();
    if (newId) router.push(`/programmes/${newId}`);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable onPress={onImport} style={styles.headerLeft}>
          <Text style={styles.headerBtn}>Importer</Text>
        </Pressable>
      ),
    });
  }, []);

  const filtered = search.trim()
    ? allPrograms.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : allPrograms;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un programme…"
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.addButton} onPress={() => router.push('/programmes/nouveau')}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {search ? 'Aucun résultat.' : 'Aucun programme — appuie sur + pour commencer.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/programmes/${item.id}`)}>
            <View style={styles.cardContent}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={1}>{item.description}</Text>
              ) : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  headerLeft: { marginLeft: 12 },
  headerBtn: { color: '#007AFF', fontSize: 16 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 22, lineHeight: 26 },

  list: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 40 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardDesc: { fontSize: 13, color: '#888', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc', marginLeft: 8 },

  empty: { textAlign: 'center', color: '#aaa', marginTop: 40, fontSize: 14 },
});
