// Pont DB ⇄ format pivot pour les programmes (côté device : expo-sqlite).
//   loadProgramForExport(id) → ProgramExport
//   importProgram(data)      → nouvel id

import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/index';
import {
  exercises,
  programExercises,
  programs,
  programSessions,
} from '../../db/schema';
import { generateId } from '../../utils/generateId';
import {
  PROGRAM_FORMAT_VERSION,
  type ProgramExerciseExport,
  type ProgramExport,
  type ProgramSessionExport,
} from '../core/programTypes';
import {
  buildNameIndex,
  groupIdsToLabels,
  labelsToGroupIds,
  normalizeName,
} from '../core/transform';

type ProgramDay = (typeof programSessions.$inferInsert)['day'];

// ─── Export : DB → pivot ──────────────────────────────────────────────────────

export async function loadProgramForExport(programId: string): Promise<ProgramExport> {
  const [program] = await db.select().from(programs).where(eq(programs.id, programId));
  if (!program) throw new Error('Programme introuvable.');

  const allEx = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises);
  const idToName = new Map(allEx.map((e) => [e.id, e.name]));
  const nameOf = (id: string) => idToName.get(id) ?? id;

  const sessions = await db
    .select()
    .from(programSessions)
    .where(eq(programSessions.programId, programId))
    .orderBy(asc(programSessions.order));

  const out: ProgramSessionExport[] = [];
  for (const s of sessions) {
    const exos = await db
      .select()
      .from(programExercises)
      .where(eq(programExercises.programSessionId, s.id))
      .orderBy(asc(programExercises.order));
    const labels = groupIdsToLabels(exos.map((e) => e.supersetGroupId));

    const exExport: ProgramExerciseExport[] = exos.map((ex, i) => ({
      exerciseName: nameOf(ex.exerciseId),
      selectedVariation: ex.selectedVariation,
      supersetLabel: labels[i],
      alternatives: ((ex.alternativeExerciseIds as string[] | null) ?? []).map(nameOf),
      targets: {
        setsMin: ex.targetSetsMin,
        setsMax: ex.targetSetsMax,
        repsMin: ex.targetRepsMin,
        repsMax: ex.targetRepsMax,
        weightMin: ex.targetWeightMin,
        weightMax: ex.targetWeightMax,
        rirMin: ex.targetRirMin,
        rirMax: ex.targetRirMax,
        restSeconds: ex.targetRestSeconds,
        durationSeconds: ex.targetDurationSeconds,
        tempo: ex.tempo,
      },
    }));

    out.push({
      order: s.order,
      name: s.name,
      day: s.day,
      color: s.color,
      exercises: exExport,
    });
  }

  return {
    formatVersion: PROGRAM_FORMAT_VERSION,
    name: program.name,
    description: program.description,
    sessions: out,
  };
}

// ─── Import : pivot → DB ──────────────────────────────────────────────────────

export async function importProgram(data: ProgramExport): Promise<string> {
  const existing = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises);
  const nameIdx = buildNameIndex(existing);

  async function resolveExercise(name: string): Promise<string> {
    const key = normalizeName(name);
    const found = nameIdx.get(key);
    if (found) return found;
    const id = generateId();
    await db.insert(exercises).values({
      id,
      name: name.trim(),
      primaryMuscles: [],
      isCustom: true,
    });
    nameIdx.set(key, id);
    return id;
  }

  const programId = generateId();
  await db.insert(programs).values({
    id: programId,
    name: data.name,
    description: data.description,
  });

  for (const s of data.sessions) {
    const sessionId = generateId();
    await db.insert(programSessions).values({
      id: sessionId,
      programId,
      name: s.name,
      order: s.order,
      color: s.color,
      day: s.day as ProgramDay,
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
      const t = ex.targets;
      await db.insert(programExercises).values({
        id: generateId(),
        programSessionId: sessionId,
        exerciseId,
        alternativeExerciseIds: altIds.length ? altIds : null,
        order: i,
        selectedVariation: ex.selectedVariation,
        supersetGroupId: groupIds[i],
        targetSetsMin: t.setsMin,
        targetSetsMax: t.setsMax,
        targetRepsMin: t.repsMin,
        targetRepsMax: t.repsMax,
        targetWeightMin: t.weightMin,
        targetWeightMax: t.weightMax,
        targetRirMin: t.rirMin,
        targetRirMax: t.rirMax,
        targetRestSeconds: t.restSeconds,
        targetDurationSeconds: t.durationSeconds,
        tempo: t.tempo,
      });
    }
  }

  return programId;
}
