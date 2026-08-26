// Pont DB ⇄ format pivot pour les mésocycles (côté device : utilise expo-sqlite).
//   loadMesocycleForExport(id) → MesocycleExport   (DB → pivot)
//   importMesocycle(data)      → nouvel id          (pivot → DB)
// La sérialisation XLSX elle-même vit dans ../core/mesoXlsx (testable sous Node).

import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/index';
import {
  exercises,
  mesocycles,
  mesoExercises,
  mesoSessions,
  mesoSets,
} from '../../db/schema';
import { generateId } from '../../utils/generateId';
import {
  MESO_FORMAT_VERSION,
  type MesoExerciseExport,
  type MesocycleExport,
  type MesoSessionExport,
} from '../core/mesoTypes';
import type { CreatedExercise, ImportResult } from '../core/importResult';
import {
  buildNameIndex,
  groupIdsToLabels,
  labelsToGroupIds,
  normalizeName,
} from '../core/transform';

type MesoDay = (typeof mesoSessions.$inferInsert)['day'];

// ─── Export : DB → pivot ──────────────────────────────────────────────────────

export async function loadMesocycleForExport(
  mesocycleId: string
): Promise<MesocycleExport> {
  const [meso] = await db
    .select()
    .from(mesocycles)
    .where(eq(mesocycles.id, mesocycleId));
  if (!meso) throw new Error('Mésocycle introuvable.');

  const allEx = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises);
  const idToName = new Map(allEx.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => idToName.get(id) ?? id;

  const sessions = await db
    .select()
    .from(mesoSessions)
    .where(eq(mesoSessions.mesocycleId, mesocycleId))
    .orderBy(asc(mesoSessions.weekIndex), asc(mesoSessions.order));

  const out: MesoSessionExport[] = [];
  for (const s of sessions) {
    const exos = await db
      .select()
      .from(mesoExercises)
      .where(eq(mesoExercises.mesoSessionId, s.id))
      .orderBy(asc(mesoExercises.order));
    const labels = groupIdsToLabels(exos.map((e) => e.supersetGroupId));

    const exExport: MesoExerciseExport[] = [];
    for (let i = 0; i < exos.length; i++) {
      const ex = exos[i];
      const sets = await db
        .select()
        .from(mesoSets)
        .where(eq(mesoSets.mesoExerciseId, ex.id))
        .orderBy(asc(mesoSets.setNumber));
      exExport.push({
        exerciseName: nameOf(ex.exerciseId),
        selectedVariation: ex.selectedVariation,
        supersetLabel: labels[i],
        alternatives: ((ex.alternativeExerciseIds as string[] | null) ?? []).map(nameOf),
        note: ex.note,
        sets: sets.map((st) => ({
          setNumber: st.setNumber,
          repsMin: st.targetRepsMin,
          repsMax: st.targetRepsMax,
          weightMin: st.targetWeightMin,
          weightMax: st.targetWeightMax,
          rirMin: st.targetRirMin,
          rirMax: st.targetRirMax,
          restSeconds: st.targetRestSeconds,
          durationSeconds: st.targetDurationSeconds,
          tempo: st.tempo,
        })),
      });
    }

    out.push({
      weekIndex: s.weekIndex,
      order: s.order,
      title: s.title,
      day: s.day,
      color: s.color,
      note: s.note,
      exercises: exExport,
    });
  }

  return {
    formatVersion: MESO_FORMAT_VERSION,
    name: meso.name,
    numWeeks: meso.numWeeks,
    startDate: meso.startDate,
    notes: meso.notes,
    sessions: out,
  };
}

// ─── Import : pivot → DB ──────────────────────────────────────────────────────
// Régénère tous les IDs, apparie les exercices par nom (création custom si
// absent), et reconstruit les supersetGroupId depuis les étiquettes A/B.
// Retourne l'id du mésocycle créé + la liste des exercices personnalisés créés
// (pour la réconciliation post-import — phase 12, solution 2).

export async function importMesocycle(data: MesocycleExport): Promise<ImportResult> {
  const existing = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises);
  const nameIdx = buildNameIndex(existing);
  const createdExercises: CreatedExercise[] = [];

  async function resolveExercise(name: string): Promise<string> {
    const key = normalizeName(name);
    const found = nameIdx.get(key);
    if (found) return found;
    const id = generateId();
    const cleanName = name.trim();
    await db.insert(exercises).values({
      id,
      name: cleanName,
      primaryMuscles: [],
      isCustom: true,
    });
    nameIdx.set(key, id);
    createdExercises.push({ id, name: cleanName });
    return id;
  }

  const mesoId = generateId();
  await db.insert(mesocycles).values({
    id: mesoId,
    programId: null,
    name: data.name,
    numWeeks: data.numWeeks,
    startDate: data.startDate,
    notes: data.notes,
    createdAt: new Date().toISOString(),
  });

  for (const s of data.sessions) {
    const sessionId = generateId();
    await db.insert(mesoSessions).values({
      id: sessionId,
      mesocycleId: mesoId,
      programSessionId: null,
      weekIndex: s.weekIndex,
      order: s.order,
      title: s.title,
      note: s.note,
      day: s.day as MesoDay,
      color: s.color,
    });

    const groupIds = labelsToGroupIds(
      s.exercises.map((e) => e.supersetLabel),
      generateId
    );

    for (let i = 0; i < s.exercises.length; i++) {
      const ex = s.exercises[i];
      const exerciseId = await resolveExercise(ex.exerciseName);
      const altIds: string[] = [];
      for (const altName of ex.alternatives) {
        altIds.push(await resolveExercise(altName));
      }

      const meId = generateId();
      await db.insert(mesoExercises).values({
        id: meId,
        mesoSessionId: sessionId,
        exerciseId,
        alternativeExerciseIds: altIds.length ? altIds : null,
        order: i,
        selectedVariation: ex.selectedVariation,
        supersetGroupId: groupIds[i],
        note: ex.note,
      });

      for (const st of ex.sets) {
        await db.insert(mesoSets).values({
          id: generateId(),
          mesoExerciseId: meId,
          setNumber: st.setNumber,
          targetRepsMin: st.repsMin,
          targetRepsMax: st.repsMax,
          targetWeightMin: st.weightMin,
          targetWeightMax: st.weightMax,
          targetRirMin: st.rirMin,
          targetRirMax: st.rirMax,
          targetRestSeconds: st.restSeconds,
          targetDurationSeconds: st.durationSeconds,
          tempo: st.tempo,
        });
      }
    }
  }

  return { id: mesoId, createdExercises };
}
