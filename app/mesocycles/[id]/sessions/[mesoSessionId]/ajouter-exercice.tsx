import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import ExercisePicker from '../../../../../src/components/ExercisePicker';
import { db } from '../../../../../src/db';
import { addMesoExerciseFromPicker } from '../../../../../src/db/meso';
import { mesoExercises } from '../../../../../src/db/schema';
import { consumePendingNewExercise } from '../../../../../src/utils/newExerciseStore';

export default function AjouterExerciceMesoScreen() {
  const { mesoSessionId } = useLocalSearchParams<{ id: string; mesoSessionId: string }>();
  const router = useRouter();

  const addAndBack = useCallback(async (exerciseId: string) => {
    const existing = await db
      .select()
      .from(mesoExercises)
      .where(eq(mesoExercises.mesoSessionId, mesoSessionId!));
    await addMesoExerciseFromPicker(mesoSessionId!, exerciseId, existing.length);
    router.back();
  }, [mesoSessionId]);

  useFocusEffect(useCallback(() => {
    const newId = consumePendingNewExercise();
    if (newId) addAndBack(newId);
  }, [addAndBack]));

  return (
    <ExercisePicker
      cardIndicator="plus"
      onSelect={(ex) => addAndBack(ex.id)}
      onCreateNew={() => router.push('/exercices/nouveau?fromPicker=1')}
    />
  );
}
