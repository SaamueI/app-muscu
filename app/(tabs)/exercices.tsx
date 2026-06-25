import { eq, like, or, sql } from 'drizzle-orm';
import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { exercises } from '../../src/db/schema';

type Exercise = typeof exercises.$inferSelect;

const MUSCLE_GROUPS = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves',
  'chest', 'forearms', 'glutes', 'hamstrings', 'lats',
  'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders',
  'traps', 'triceps',
];

const EQUIPMENT_LIST = [
  'barbell', 'dumbbell', 'cable', 'machine', 'kettlebells',
  'bands', 'body only', 'e-z curl bar', 'medicine ball', 'exercise ball',
];

export default function ExercicesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [results, setResults] = useState<Exercise[]>([]);
  const [showMuscleFilter, setShowMuscleFilter] = useState(false);
  const [showEquipmentFilter, setShowEquipmentFilter] = useState(false);

  useEffect(() => {
    const load = async () => {
      let query = db.select().from(exercises);
      const conditions = [];

      if (search.trim()) {
        conditions.push(like(exercises.name, `%${search.trim()}%`));
      }
      if (selectedMuscle) {
        conditions.push(
          or(
            like(exercises.primaryMuscles, `%${selectedMuscle}%`),
            like(exercises.secondaryMuscles, `%${selectedMuscle}%`)
          )!
        );
      }
      if (selectedEquipment) {
        conditions.push(eq(exercises.equipment, selectedEquipment));
      }

      const data = conditions.length
        ? await query.where(sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}`)
        : await query;

      setResults(data);
    };
    load();
  }, [search, selectedMuscle, selectedEquipment]);

  const activeFilters = [selectedMuscle, selectedEquipment].filter(Boolean).length;

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un exercice…"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        <Link href="/exercices/nouveau" asChild>
          <Pressable style={styles.addButton}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        </Link>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, selectedMuscle && styles.filterChipActive]}
          onPress={() => { setShowMuscleFilter(!showMuscleFilter); setShowEquipmentFilter(false); }}
        >
          <Text style={[styles.filterChipText, selectedMuscle && styles.filterChipTextActive]}>
            {selectedMuscle ?? 'Muscle'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, selectedEquipment && styles.filterChipActive]}
          onPress={() => { setShowEquipmentFilter(!showEquipmentFilter); setShowMuscleFilter(false); }}
        >
          <Text style={[styles.filterChipText, selectedEquipment && styles.filterChipTextActive]}>
            {selectedEquipment ?? 'Équipement'}
          </Text>
        </Pressable>
        {activeFilters > 0 && (
          <Pressable
            style={styles.clearChip}
            onPress={() => { setSelectedMuscle(null); setSelectedEquipment(null); }}
          >
            <Text style={styles.clearChipText}>Effacer ({activeFilters})</Text>
          </Pressable>
        )}
      </View>

      {/* Muscle dropdown */}
      {showMuscleFilter && (
        <View style={styles.dropdown}>
          <FlatList
            data={MUSCLE_GROUPS}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.dropdownItem, selectedMuscle === item && styles.dropdownItemActive]}
                onPress={() => { setSelectedMuscle(selectedMuscle === item ? null : item); setShowMuscleFilter(false); }}
              >
                <Text style={styles.dropdownItemText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Equipment dropdown */}
      {showEquipmentFilter && (
        <View style={styles.dropdown}>
          <FlatList
            data={EQUIPMENT_LIST}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.dropdownItem, selectedEquipment === item && styles.dropdownItemActive]}
                onPress={() => { setSelectedEquipment(selectedEquipment === item ? null : item); setShowEquipmentFilter(false); }}
              >
                <Text style={styles.dropdownItemText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Results count */}
      <Text style={styles.count}>{results.length} exercice{results.length !== 1 ? 's' : ''}</Text>

      {/* Exercise list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/exercices/${item.id}`)}
          >
            <View style={styles.cardContent}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardMuscles}>
                {(item.primaryMuscles as string[]).join(', ')}
              </Text>
              <View style={styles.cardTags}>
                {item.equipment && (
                  <Text style={styles.tag}>{item.equipment}</Text>
                )}
                {item.level && (
                  <Text style={styles.tag}>{item.level}</Text>
                )}
                {item.isCustom && (
                  <Text style={[styles.tag, styles.tagCustom]}>Perso</Text>
                )}
              </View>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },

  searchRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 15,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  addButton: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: '#007AFF',
    alignItems: 'center', justifyContent: 'center',
  },
  addButtonText: { color: '#fff', fontSize: 24, lineHeight: 28 },

  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0',
  },
  filterChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  filterChipText: { fontSize: 13, color: '#333' },
  filterChipTextActive: { color: '#fff' },
  clearChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fee' },
  clearChipText: { fontSize: 13, color: '#c00' },

  dropdown: {
    maxHeight: 200, marginHorizontal: 12, backgroundColor: '#fff',
    borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 4, overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 10 },
  dropdownItemActive: { backgroundColor: '#e8f0fe' },
  dropdownItemText: { fontSize: 14 },

  count: { fontSize: 12, color: '#888', paddingHorizontal: 16, paddingVertical: 4 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 8,
    borderRadius: 12, padding: 14, shadowColor: '#000',
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  cardMuscles: { fontSize: 13, color: '#555', marginBottom: 6 },
  cardTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    fontSize: 11, color: '#555', backgroundColor: '#f0f0f0',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  tagCustom: { backgroundColor: '#e8f0fe', color: '#007AFF' },
  chevron: { fontSize: 22, color: '#c0c0c0', marginLeft: 8 },
});
