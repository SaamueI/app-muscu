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
  // Tap sur une série « à encoder » (orange) → ouvre sa saisie (amélioration 01b)
  onPressPending?: (setNumber: number) => void;
};

// Liste « Objectifs » avec l'avancement de la séance (réutilisée par le superset) :
// vert = fait, bleu = prochaine série. Les exercices de programme à nombre de séries
// variable (« 3–4 ») gardent la ligne agrégée, sans couleur.
// Texte des objectifs d'une série (plan méso, ou programme à N fixe). Vide si le plan n'en
// dit rien ; « hors plan » au-delà des séries prévues.
export function getSetTargetText({
  mesoSets,
  programExercise,
  weightUnit,
  plannedSetCount,
  setNumber,
}: {
  mesoSets: MesoSet[];
  programExercise: ProgramExercise | null;
  weightUnit: 'kg' | 'lb';
  plannedSetCount: number;
  setNumber: number;
}): string {
  // Programme à nombre de séries variable : une seule ligne agrégée
  if (plannedSetCount === 0) {
    return programExercise ? formatTargets(programExercise, { weightUnit }) : '';
  }
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
      formatTargets({ ...programExercise, targetSetsMin: null, targetSetsMax: null }, { weightUnit })
    : '';
}

// Une ligne d'objectifs : vert = fait, orange = fait mais à encoder, bleu = prochaine
// série, sinon neutre.
export function ObjectiveRow({
  label,
  text,
  status,
  halfDone,
  prefix,
  onPress,
}: {
  label: string;
  text: string;
  status: SetState['status'];
  // Unilatéral à moitié fait : « G ✓ » ou « D ✓ »
  halfDone?: string | null;
  // Nom court de l'exercice (superset)
  prefix?: string;
  // Seulement pour une ligne « à encoder »
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.setNum}>{label}</Text>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <Text style={styles.text}>{text}</Text>
      {status === 'done' && <Text style={styles.check}>✓</Text>}
      {status === 'pending' && <Text style={styles.pending}>à encoder</Text>}
      {halfDone ? <Text style={styles.halfDone}>{halfDone}</Text> : null}
    </>
  );
  const style = [
    styles.row,
    status === 'done' && styles.rowDone,
    status === 'pending' && styles.rowPending,
    status === 'current' && styles.rowCurrent,
  ];
  return status === 'pending' && onPress ? (
    <Pressable style={style} onPress={onPress}>{content}</Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

// Liste « Objectifs » avec l'avancement de la séance :
// vert = fait, orange = à encoder, bleu = prochaine série. Les exercices de programme à
// nombre de séries variable (« 3–4 ») gardent la ligne agrégée, sans couleur.
export default function ObjectivesList({
  mesoSets,
  programExercise,
  weightUnit,
  sets,
  plannedSetCount,
  previousSets = [],
  onPressPending,
}: Props) {
  if (plannedSetCount === 0) {
    return programExercise ? (
      <Text style={styles.text}>{formatTargets(programExercise, { weightUnit })}</Text>
    ) : (
      <Text style={styles.empty}>Aucun objectif</Text>
    );
  }

  const targetText = (setNumber: number) =>
    getSetTargetText({ mesoSets, programExercise, weightUnit, plannedSetCount, setNumber });

  return (
    <View style={styles.list}>
      {previousSets.map((p) => (
        <PreviousRow key={`prev-${p.setNumber}`} setNumber={p.setNumber} text={targetText(p.setNumber)} exerciseName={p.exerciseName} />
      ))}
      {sets.map((s) => (
        <ObjectiveRow
          key={s.setNumber}
          label={`Série ${s.setNumber}`}
          text={targetText(s.setNumber)}
          status={s.status}
          onPress={onPressPending ? () => onPressPending(s.setNumber) : undefined}
          halfDone={
            s.status === 'current' && s.sidesDone.length === 1
              ? `${s.sidesDone[0] === 'L' ? 'G' : 'D'} ✓`
              : null
          }
        />
      ))}
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
  rowPending: { backgroundColor: '#FFF4E5', borderLeftColor: '#FF9500' },
  rowCurrent: { backgroundColor: '#E8F0FE', borderLeftColor: '#007AFF' },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93' },
  prefix: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  text: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  empty: { fontSize: 15, color: '#8E8E93' },
  check: { fontSize: 15, fontWeight: '700', color: '#34C759' },
  pending: { fontSize: 13, fontWeight: '700', color: '#C77700' },
  halfDone: { fontSize: 13, fontWeight: '700', color: '#007AFF' },
});
