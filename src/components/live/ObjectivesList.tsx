import { StyleSheet, Text, View } from 'react-native';

import type { mesoSets, programExercises } from '../../db/schema';
import { formatTargets } from '../../utils/formatTargets';
import type { SetState } from '../../utils/exerciseProgress';

type MesoSet = typeof mesoSets.$inferSelect;
type ProgramExercise = typeof programExercises.$inferSelect;

type Props = {
  mesoSets: MesoSet[];
  programExercise: ProgramExercise | null;
  weightUnit: 'kg' | 'lb';
  // Avancement calculé par computeProgress (exerciseProgress.ts)
  sets: SetState[];
  // Séries prévues : mesoSets.length, ou N d'un programme à N fixe, sinon 0 (objectif agrégé)
  plannedSetCount: number;
};

// Liste « Objectifs » avec l'avancement de la séance (réutilisée par le superset) :
// vert = fait, bleu = prochaine série. Les exercices de programme à nombre de séries
// variable (« 3–4 ») gardent la ligne agrégée, sans couleur.
export default function ObjectivesList({
  mesoSets,
  programExercise,
  weightUnit,
  sets,
  plannedSetCount,
}: Props) {
  if (plannedSetCount === 0) {
    return programExercise ? (
      <Text style={styles.text}>{formatTargets(programExercise, { weightUnit })}</Text>
    ) : (
      <Text style={styles.empty}>Aucun objectif</Text>
    );
  }

  return (
    <View style={styles.list}>
      {sets.map((s) => {
        const planned = s.setNumber <= plannedSetCount;
        const ms = mesoSets.find((m) => m.setNumber === s.setNumber) ?? mesoSets[s.setNumber - 1];
        const text = !planned
          ? 'hors plan'
          : ms
          ? formatTargets(
              {
                targetRepsMin: ms.targetRepsMin,
                targetRepsMax: ms.targetRepsMax,
                targetWeightMin: ms.targetWeightMin,
                targetWeightMax: ms.targetWeightMax,
                targetRirMin: ms.targetRirMin,
                targetRirMax: ms.targetRirMax,
                targetRestSeconds: ms.targetRestSeconds,
                targetDurationSeconds: ms.targetDurationSeconds,
              },
              { weightUnit }
            )
          : programExercise
          ? // Programme à N fixe : mêmes objectifs sur chaque ligne, sans répéter « N séries »
            formatTargets(
              { ...programExercise, targetSetsMin: null, targetSetsMax: null },
              { weightUnit }
            )
          : '';

        // Unilatéral à moitié fait : « G ✓ » ou « D ✓ »
        const halfDone =
          s.status === 'current' && s.sidesDone.length === 1
            ? `${s.sidesDone[0] === 'L' ? 'G' : 'D'} ✓`
            : null;

        return (
          <View
            key={s.setNumber}
            style={[
              styles.row,
              s.status === 'done' && styles.rowDone,
              s.status === 'current' && styles.rowCurrent,
            ]}
          >
            <Text style={styles.setNum}>Série {s.setNumber}</Text>
            <Text style={styles.text}>{text}</Text>
            {s.status === 'done' && <Text style={styles.check}>✓</Text>}
            {halfDone && <Text style={styles.halfDone}>{halfDone}</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  rowDone: { backgroundColor: '#E8F8EE' },
  rowCurrent: { backgroundColor: '#E8F0FE', borderLeftColor: '#007AFF' },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  text: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  empty: { fontSize: 15, color: '#8E8E93' },
  check: { fontSize: 15, fontWeight: '700', color: '#34C759' },
  halfDone: { fontSize: 13, fontWeight: '700', color: '#007AFF' },
});
