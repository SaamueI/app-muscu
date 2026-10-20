import { eq } from 'drizzle-orm';
import { useCallback, useState } from 'react';

import { db } from '../db';
import { exerciseLogs, exercises } from '../db/schema';
import {
  getAlternativeExercises,
  getPreviousPerfs,
  getRestPresets,
  getSessionLive,
  getUserWeightUnit,
  type ExerciseLogEnriched,
  type PerfGroup,
} from '../db/session';
import { getFirstSide } from '../db/settings';
import { getChainInfoFor, type ChainInfo } from './exerciseSwap';

export type RestPreset = { id: string; seconds: number; sortOrder: number };

export type ExerciseLiveData = {
  enriched: ExerciseLogEnriched | null;
  alternatives: (typeof exercises.$inferSelect)[];
  history: PerfGroup[];
  presets: RestPreset[];
  weightUnit: 'kg' | 'lb';
  chain: ChainInfo<ExerciseLogEnriched>;
  // Côté de départ des séries unilatérales (réglage Paramètres)
  defaultFirstSide: 'L' | 'R';
};

const EMPTY: ExerciseLiveData = {
  enriched: null,
  alternatives: [],
  history: [],
  presets: [],
  weightUnit: 'kg',
  chain: { startSetNumber: 1, previousSets: [], previousLogs: [] },
  defaultFirstSide: 'L',
};

// Charge tout ce qu'il faut pour suivre UN exercice en séance live (série par série) :
// log enrichi, alternatives, historique, raccourcis de repos, unité, chaîne de remplacements.
// Utilisé par l'écran exercice (1 instance) et l'écran superset (2 instances).
//
// Tout est posé d'un seul `setData` : l'appelant ne voit jamais un état à moitié chargé
// (par exemple le log neuf avec l'ancien historique).
export function useExerciseLiveData(logId: string | undefined) {
  const [data, setData] = useState<ExerciseLiveData>(EMPTY);

  // Renvoie les données chargées (null si le log n'existe pas) pour que l'appelant puisse
  // enchaîner un traitement sans attendre le prochain rendu.
  const reload = useCallback(async (): Promise<ExerciseLiveData | null> => {
    if (!logId) return null;
    const [logRow] = await db
      .select({ log: exerciseLogs, exercise: exercises })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.id, logId));
    if (!logRow) return null;

    const liveData = await getSessionLive(logRow.log.workoutSessionId);
    const found = liveData?.exerciseLogs.find((el) => el.log.id === logId) ?? null;

    const altIds =
      (found?.mesoExercise?.alternativeExerciseIds as string[] | null) ??
      (found?.programExercise?.alternativeExerciseIds as string[] | null) ??
      null;

    const userUnit = await getUserWeightUnit();
    const exUnit = logRow.exercise.weightUnit as 'kg' | 'lb' | null;

    const next: ExerciseLiveData = {
      enriched: found,
      alternatives: await getAlternativeExercises(altIds),
      history: await getPreviousPerfs(logRow.log.exerciseId, 5, logRow.log.workoutSessionId),
      presets: await getRestPresets(),
      weightUnit: exUnit ?? userUnit,
      chain: getChainInfoFor(logId, liveData?.exerciseLogs ?? []),
      defaultFirstSide: await getFirstSide(),
    };
    setData(next);
    return next;
  }, [logId]);

  return { ...data, reload };
}
