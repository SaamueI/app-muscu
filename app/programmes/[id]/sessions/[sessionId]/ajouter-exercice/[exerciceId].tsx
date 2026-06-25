import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { db } from '../../../../../../src/db';
import exerciseImages from '../../../../../../src/db/exerciseImages';
import { exercises, programExercises } from '../../../../../../src/db/schema';
import { generateId } from '../../../../../../src/utils/generateId';

type Exercise = typeof exercises.$inferSelect;

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AjouterExerciceDetailScreen() {
  const { id, sessionId, exerciceId } = useLocalSearchParams<{
    id: string;
    sessionId: string;
    exerciceId: string;
  }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!exerciceId) return;
    db.select()
      .from(exercises)
      .where(eq(exercises.id, exerciceId))
      .then(([row]) => setExercise(row ?? null));
  }, [exerciceId]);

  const handleAdd = async () => {
    const rows = await db
      .select()
      .from(programExercises)
      .where(eq(programExercises.programSessionId, sessionId!));
    const newPeId = generateId();
    await db.insert(programExercises).values({
      id: newPeId,
      programSessionId: sessionId!,
      exerciseId: exerciceId!,
      order: rows.length,
    });
    router.replace(`/programmes/${id}/sessions/${sessionId}/exercises/${newPeId}`);
  };

  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const staticImages: Array<{ type: 'static'; source: number }> =
    (exerciseImages[exercise.id] ?? []).map((source) => ({ type: 'static', source }));
  const customImages: Array<{ type: 'uri'; source: string }> =
    ((exercise.customImageUris as string[] | null) ?? []).map((uri) => ({ type: 'uri', source: uri }));
  const allImages = [...staticImages, ...customImages];

  const description = exercise.description?.split('\n\n') ?? [];

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

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

        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.tagsRow}>
          {exercise.level && <Text style={styles.tag}>{exercise.level}</Text>}
          {exercise.category && <Text style={styles.tag}>{exercise.category}</Text>}
          {exercise.equipment && <Text style={styles.tag}>{exercise.equipment}</Text>}
          {exercise.mechanic && <Text style={styles.tag}>{exercise.mechanic}</Text>}
        </View>

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

        {exercise.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.sectionText}>{exercise.notes}</Text>
          </View>
        ) : null}

        {((exercise.variations as string[] | null)?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Variations</Text>
            {(exercise.variations as string[]).map((v, i) => (
              <Text key={i} style={styles.variationItem}>· {v}</Text>
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={handleAdd}>
          <Text style={styles.addButtonText}>Ajouter l'exercice</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f2f2f7' },
  container: { flex: 1 },
  content: { paddingBottom: 12 },
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

  variationItem: { fontSize: 15, color: '#333', lineHeight: 24 },
  bottomPad: { height: 8 },

  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    padding: 16,
    paddingBottom: 32,
  },
  addButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
