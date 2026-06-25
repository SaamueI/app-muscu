import { useLocalSearchParams, useRouter } from 'expo-router';

import ExerciceForm, { ExerciceFormValues } from '../../src/components/ExerciceForm';
import { db } from '../../src/db';
import { exercises } from '../../src/db/schema';
import { setPendingNewExercise } from '../../src/utils/newExerciseStore';

function generateId() {
  return 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function NouvelExerciceScreen() {
  const router = useRouter();
  const { fromPicker } = useLocalSearchParams<{ fromPicker?: string }>();

  const handleSubmit = async (values: ExerciceFormValues) => {
    const newId = generateId();
    await db.insert(exercises).values({
      id: newId,
      name: values.name,
      primaryMuscles: values.primaryMuscles,
      secondaryMuscles: values.secondaryMuscles.length > 0 ? values.secondaryMuscles : null,
      description: values.description || null,
      measurementType: values.measurementType,
      equipment: values.equipment || null,
      category: values.category || null,
      notes: values.notes || null,
      variations: values.variations.length > 0 ? values.variations : null,
      customImageUris: values.customImageUris.length > 0 ? values.customImageUris : null,
      isCustom: true,
    });
    if (fromPicker) setPendingNewExercise(newId);
    router.back();
  };

  return <ExerciceForm onSubmit={handleSubmit} submitLabel="Créer l'exercice" />;
}
