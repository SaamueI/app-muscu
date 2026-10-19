import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { mesoSets, programExercises } from '../../db/schema';
import { formatTargets } from '../../utils/formatTargets';
import type { SetState } from '../../utils/exerciseProgress';
import type { PreviousSet } from '../../utils/exerciseSwap';

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
  // Séries déjà faites par un exercice remplacé (amélioration 14) : lignes vertes
  // (objectifs + nom de l'exercice fait) placées avant `sets`.
  previousSets?: PreviousSet[];
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
  previousSets = [],
}: Props) {
  if (plannedSetCount === 0) {
    return programExercise ? (
      <Text style={styles.text}>{formatTargets(programExercise, { weightUnit })}</Text>
    ) : (
      <Text style={styles.empty}>Aucun objectif</Text>
    );
  }

  // Texte des objectifs d'une série (plan méso, ou programme à N fixe)
  const targetText = (setNumber: number): string => {
    const planned = setNumber <= plannedSetCount;
    const ms = mesoSets.find((m) => m.setNumber === setNumber) ?? mesoSets[setNumber - 1];
    return !planned
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
  };

  return (
    <View style={styles.list}>
      {previousSets.map((p) => (
        <PreviousRow key={`prev-${p.setNumber}`} setNumber={p.setNumber} text={targetText(p.setNumber)} exerciseName={p.exerciseName} />
      ))}
      {sets.map((s) => {
        const text = targetText(s.setNumber);

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

// Série faite avec l'exercice remplacé : objectifs de la série + nom de l'exercice fait.
// Une ligne par défaut (tronquée) ; un tap déplie le reste.
function PreviousRow({ setNumber, text, exerciseName }: { setNumber: number; text: string; exerciseName: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = expanded ? undefined : 1;
  return (
    <Pressable style={[styles.row, styles.rowDone]} onPress={() => setExpanded((v) => !v)}>
      <Text style={styles.setNum}>Série {setNumber}</Text>
      <View style={styles.prevBody}>
        <Text style={styles.text} numberOfLines={lines}>{text}</Text>
        <Text style={styles.prevName} numberOfLines={lines}>{exerciseName}</Text>
      </View>
      <Text style={styles.check}>✓</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  prevBody: { flex: 1 },
  prevName: { fontSize: 12, color: '#8E8E93', fontStyle: 'italic' },
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
