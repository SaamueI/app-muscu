import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../src/db';
import exerciseImages from '../../src/db/exerciseImages';
import { exercises } from '../../src/db/schema';

type Exercise = typeof exercises.$inferSelect;

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function ExerciceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!id) return;
    db.select()
      .from(exercises)
      .where(eq(exercises.id, id))
      .then(([row]) => setExercise(row ?? null));
  }, [id]);

  const handleDelete = () => {
    Alert.alert('Supprimer', `Supprimer "${exercise?.name}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await db.delete(exercises).where(eq(exercises.id, id!));
          router.back();
        },
      },
    ]);
  };

  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  // Merge static images (predefined exercises) and custom URIs
  const staticImages: Array<{ type: 'static'; source: number }> =
    (exerciseImages[exercise.id] ?? []).map((source) => ({ type: 'static', source }));
  const customImages: Array<{ type: 'uri'; source: string }> =
    ((exercise.customImageUris as string[] | null) ?? []).map((uri) => ({ type: 'uri', source: uri }));
  const allImages = [...staticImages, ...customImages];

  const description = exercise.description?.split('\n\n') ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Carousel swipeable ── */}
      {allImages.length > 0 ? (
        <View style={styles.carouselContainer}>
          <FlatList
            ref={flatListRef}
            data={allImages}
            keyExtractor={(_, i) => String(i)}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setImageIndex(index);
            }}
            renderItem={({ item }) => (
              <Image
                source={item.type === 'static' ? item.source : { uri: item.source }}
                style={styles.carouselImage}
                resizeMode="contain"
              />
            )}
          />
          {allImages.length > 1 && (
            <View style={styles.dots}>
              {allImages.map((_, i) => (
                <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {/* ── Nom + tags ── */}
      <Text style={styles.name}>{exercise.name}</Text>
      <View style={styles.tagsRow}>
        {exercise.level && <Text style={styles.tag}>{exercise.level}</Text>}
        {exercise.category && <Text style={styles.tag}>{exercise.category}</Text>}
        {exercise.equipment && <Text style={styles.tag}>{exercise.equipment}</Text>}
        {exercise.mechanic && <Text style={styles.tag}>{exercise.mechanic}</Text>}
        {exercise.isCustom && <Text style={[styles.tag, styles.tagCustom]}>Perso</Text>}
      </View>

      {/* ── Muscles ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Muscles ciblés</Text>
        <Text style={styles.sectionText}>
          {(exercise.primaryMuscles as string[]).join(', ')}
        </Text>
        {((exercise.secondaryMuscles as string[] | null)?.length ?? 0) > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Muscles secondaires</Text>
            <Text style={styles.sectionText}>
              {(exercise.secondaryMuscles as string[]).join(', ')}
            </Text>
          </>
        )}
      </View>

      {/* ── Instructions ── */}
      {description.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {description.map((step, i) => (
            <View key={i} style={styles.step}>
              <Text style={styles.stepNumber}>{i + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Notes ── */}
      {exercise.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.sectionText}>{exercise.notes}</Text>
        </View>
      ) : null}

      {/* ── Variations ── */}
      {((exercise.variations as string[] | null)?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Variations</Text>
          {(exercise.variations as string[]).map((v, i) => (
            <Text key={i} style={styles.variationItem}>· {v}</Text>
          ))}
        </View>
      )}

      {/* ── Performances (placeholder) ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performances</Text>
        <Text style={styles.placeholder}>
          Tes performances s'afficheront ici après ta première séance avec cet exercice.
        </Text>
      </View>

      {/* ── Actions ── */}
      <View style={styles.actions}>
        <Pressable
          style={styles.editButton}
          onPress={() => router.push(`/exercices/${id}/modifier`)}
        >
          <Text style={styles.editButtonText}>Modifier</Text>
        </Pressable>
        {exercise.isCustom && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Supprimer</Text>
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

  carouselContainer: { backgroundColor: '#fff' },
  carouselImage: { width: SCREEN_WIDTH, height: 240 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#007AFF', width: 18 },

  name: { fontSize: 22, fontWeight: '700', margin: 16, marginBottom: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  tag: {
    fontSize: 12, color: '#555', backgroundColor: '#e8e8e8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  tagCustom: { backgroundColor: '#e8f0fe', color: '#007AFF' },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 12,
    borderRadius: 12, padding: 14,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  sectionText: { fontSize: 15, color: '#222', lineHeight: 22 },

  step: { flexDirection: 'row', marginBottom: 10, gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#007AFF',
    color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '700',
    lineHeight: 22, overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },

  placeholder: { fontSize: 14, color: '#aaa', fontStyle: 'italic', lineHeight: 20 },
  variationItem: { fontSize: 15, color: '#333', lineHeight: 24 },

  actions: { flexDirection: 'row', gap: 12, marginHorizontal: 12, marginTop: 4 },
  editButton: {
    flex: 1, backgroundColor: '#007AFF', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  editButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  deleteButton: {
    flex: 1, backgroundColor: '#fff2f2', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ffcdd2',
  },
  deleteButtonText: { color: '#c62828', fontWeight: '600', fontSize: 15 },
});
