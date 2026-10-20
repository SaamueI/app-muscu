import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ExerciseLogEnriched } from '../../db/session';
import { ExerciseImageCarousel } from '../ExerciseImageCarousel';

type Props = {
  enriched: ExerciseLogEnriched;
  // Libellé du volet replié (« Infos exercice », ou « Infos Développé couché » en superset)
  label?: string;
};

// Bloc « Infos exercice », replié par défaut, en lecture seule : photos, tags, instructions,
// note de la séance planifiée, note du catalogue. Replié pour que le chrono et les boutons
// Commencer / Terminer restent atteignables sans scroller (amélioration 06).
export default function ExerciseInfoPanel({ enriched, label = 'Infos exercice' }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Pressable style={styles.toggle} onPress={() => setExpanded((v) => !v)}>
        <Text style={styles.toggleText}>
          {label} {expanded ? '▾' : '▸'}
        </Text>
      </Pressable>
      {expanded && (
        <View style={styles.section}>
          <ExerciseImageCarousel
            exerciseId={enriched.exercise.id}
            customImageUris={enriched.exercise.customImageUris as string[] | null}
          />
          <View style={styles.tagsRow}>
            {enriched.exercise.level && <Text style={styles.tag}>{enriched.exercise.level}</Text>}
            {enriched.exercise.category && <Text style={styles.tag}>{enriched.exercise.category}</Text>}
            {enriched.exercise.equipment && <Text style={styles.tag}>{enriched.exercise.equipment}</Text>}
          </View>

          {enriched.exercise.description ? (
            <>
              <Text style={[styles.sectionTitle, styles.subTitle]}>Instructions</Text>
              {enriched.exercise.description.split('\n\n').map((step, i) => (
                <View key={i} style={styles.step}>
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          ) : null}

          {enriched.mesoExercise?.note ? (
            <>
              <Text style={[styles.sectionTitle, styles.subTitle]}>Note de la séance planifiée</Text>
              <Text style={styles.text}>{enriched.mesoExercise.note}</Text>
            </>
          ) : null}

          {enriched.exercise.notes ? (
            <>
              <Text style={[styles.sectionTitle, styles.subTitle]}>Note de l'exercice</Text>
              <Text style={[styles.text, styles.catalogNote]}>{enriched.exercise.notes}</Text>
            </>
          ) : null}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 4, paddingVertical: 2 },
  toggleText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subTitle: { marginTop: 12 },
  text: { fontSize: 15, color: '#1C1C1E' },
  catalogNote: { color: '#8E8E93' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: '#555', backgroundColor: '#e8e8e8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  step: { flexDirection: 'row', marginTop: 8, gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#007AFF',
    color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '700',
    lineHeight: 22, overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
});
