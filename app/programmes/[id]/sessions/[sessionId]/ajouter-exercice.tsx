import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import ExercisePicker from '../../../../../src/components/ExercisePicker';
import { consumePendingNewExercise } from '../../../../../src/utils/newExerciseStore';

export default function AjouterExerciceScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    const newId = consumePendingNewExercise();
    if (newId) router.push(`/programmes/${id}/sessions/${sessionId}/ajouter-exercice/${newId}`);
  }, [id, sessionId]));

  return (
    <ExercisePicker
      cardIndicator="chevron"
      onSelect={(ex) => router.push(`/programmes/${id}/sessions/${sessionId}/ajouter-exercice/${ex.id}`)}
      onCreateNew={() => router.push(`/exercices/nouveau?fromPicker=1`)}
    />
  );
}
