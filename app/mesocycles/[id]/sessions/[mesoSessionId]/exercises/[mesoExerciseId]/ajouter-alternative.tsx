import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import ExercisePicker from '../../../../../../../src/components/ExercisePicker';
import { setPendingAlt } from '../../../../../../../src/utils/altPickerStore';
import { consumePendingNewExercise } from '../../../../../../../src/utils/newExerciseStore';

export default function AjouterAlternativeScreen() {
  const router = useRouter();

  useFocusEffect(useCallback(() => {
    const newId = consumePendingNewExercise();
    if (newId) { setPendingAlt(newId); router.back(); }
  }, []));

  return (
    <ExercisePicker
      cardIndicator="plus"
      onSelect={(ex) => { setPendingAlt(ex.id); router.back(); }}
      onCreateNew={() => router.push(`/exercices/nouveau?fromPicker=1`)}
    />
  );
}
