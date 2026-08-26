import { eq } from 'drizzle-orm';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import ExercisePicker from '../../src/components/ExercisePicker';
import { ExerciseImageCarousel } from '../../src/components/ExerciseImageCarousel';
import { db } from '../../src/db';
import {
  deleteExerciseCascade,
  getExerciseUsage,
  remapExercise,
  type ExerciseUsage,
} from '../../src/db/exerciseMerge';
import { exercises, setLogs } from '../../src/db/schema';
import { getPreviousPerfs, getUserWeightUnit, type PerfGroup } from '../../src/db/session';
import { formatWeight } from '../../src/utils/weightUtils';

type Exercise = typeof exercises.$inferSelect;
type SetLogRow = typeof setLogs.$inferSelect;

export default function ExerciceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<PerfGroup[]>([]);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [showReplacePicker, setShowReplacePicker] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      db.select()
        .from(exercises)
        .where(eq(exercises.id, id))
        .then(([row]) => setExercise(row ?? null));
      getPreviousPerfs(id, 5).then(setHistory);
      getUserWeightUnit().then(setWeightUnit);
    }, [id])
  );

  const handleDelete = async () => {
    if (!id || !exercise) return;
    const usage = await getExerciseUsage(id);
    const hasFkUsage =
      usage.programExerciseCount + usage.mesoExerciseCount + usage.logCount > 0;

    if (!hasFkUsage) {
      // Pas de FK bloquante, mais des mentions "alternative" (sans FK) peuvent
      // exister → on passe quand même par le cascade pour les nettoyer.
      Alert.alert('Supprimer', `Supprimer "${exercise.name}" ?`, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExerciseCascade(id);
              router.back();
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]);
      return;
    }

    Alert.alert('Exercice utilisé', buildUsageRecap(usage), [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Remplacer par…', onPress: () => setShowReplacePicker(true) },
      {
        text: 'Tout supprimer…',
        style: 'destructive',
        onPress: () => confirmDeleteCascade(usage),
      },
    ]);
  };

  const confirmDeleteCascade = (usage: ExerciseUsage) => {
    Alert.alert(
      'Suppression définitive',
      `${usage.logCount} séance(s) enregistrée(s) perdront cet exercice et ses séries. Cette action est irréversible.`,
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExerciseCascade(id!);
              router.back();
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]
    );
  };

  const handleReplaceSelect = (target: Exercise) => {
    if (target.id === id) return; // exclusion manuelle : ExercisePicker n'a pas de prop d'exclusion
    setShowReplacePicker(false);
    Alert.alert(
      'Remplacer',
      `Remplacer "${exercise?.name}" par "${target.name}" partout ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Remplacer',
          onPress: async () => {
            try {
              await remapExercise(id!, target.id);
              router.back();
            } catch (e) {
              Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ]
    );
  };

  if (!exercise) {
    return (
      <View style={styles.center}>
        <Text>Chargement…</Text>
      </View>
    );
  }

  const description = exercise.description?.split('\n\n') ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Carousel swipeable ── */}
      <ExerciseImageCarousel
        exerciseId={exercise.id}
        customImageUris={exercise.customImageUris as string[] | null}
        height={240}
      />

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

      {/* ── Performances ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performances</Text>
        {history.length === 0 ? (
          <Text style={styles.placeholder}>
            Tes performances s'afficheront ici après ta première séance avec cet exercice.
          </Text>
        ) : (
          history.map((group) => (
            <View key={group.sessionId} style={styles.histGroup}>
              <Text style={styles.histDate}>{formatDate(group.sessionDate)}</Text>
              {group.sets.map((sl, i) => (
                <Text key={sl.id} style={styles.historySet}>
                  Série {sl.setNumber ?? i + 1}
                  {sideLabel(sl.side)} · {formatSetLine(sl, weightUnit)}
                </Text>
              ))}
            </View>
          ))
        )}
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

      {/* ── Remplacer par… ── */}
      <Modal
        visible={showReplacePicker}
        animationType="slide"
        onRequestClose={() => setShowReplacePicker(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Remplacer par…</Text>
            <Pressable onPress={() => setShowReplacePicker(false)}>
              <Text style={styles.pickerClose}>Annuler</Text>
            </Pressable>
          </View>
          <ExercisePicker
            cardIndicator="chevron"
            onSelect={handleReplaceSelect}
            onCreateNew={() => {
              setShowReplacePicker(false);
              router.push('/exercices/nouveau' as any);
            }}
          />
        </SafeAreaView>
      </Modal>
    </ScrollView>
  );
}

// ─── Helpers affichage ────────────────────────────────────────────────────────

function buildUsageRecap(usage: ExerciseUsage): string {
  let msg =
    `Utilisé dans ${usage.programExerciseCount} programme(s), ` +
    `${usage.mesoExerciseCount} mésocycle(s) et ${usage.logCount} séance(s) enregistrée(s).`;
  if (usage.altCount > 0) {
    msg += ` (+ ${usage.altCount} mention(s) comme alternative.)`;
  }
  return msg;
}

function sideLabel(side: string | null): string {
  return side === 'L' ? ' (G)' : side === 'R' ? ' (D)' : '';
}

function formatSetLine(sl: SetLogRow, unit: 'kg' | 'lb'): string {
  const parts: string[] = [];
  if (sl.weight != null) parts.push(formatWeight(sl.weight, unit));
  if (sl.reps != null) parts.push(`× ${sl.reps}`);
  if (sl.rir != null) parts.push(`RIR ${sl.rir}`);
  if (sl.pdc) parts.push('PDC');
  if (sl.durationSeconds != null) parts.push(`${sl.durationSeconds}s`);
  return parts.join(' · ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  histGroup: { marginBottom: 12 },
  histDate: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  historySet: { fontSize: 14, color: '#333', lineHeight: 20, paddingLeft: 8 },

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

  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ddd',
  },
  pickerTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  pickerClose: { fontSize: 16, color: '#007AFF' },
});
