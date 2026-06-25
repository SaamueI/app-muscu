import { asc, eq } from 'drizzle-orm';

import { db } from './index';
import {
  mesocycles,
  mesoExercises,
  mesoSessions,
  mesoSets,
  programExercises,
  programSessions,
  targetMemory,
  type MemorizedSet,
} from './schema';
import { generateId } from '../utils/generateId';

type ProgramExercise = typeof programExercises.$inferSelect;

// Champs d'objectif d'une série, sans les clés de liaison.
type SetTargets = Omit<typeof mesoSets.$inferInsert, 'id' | 'mesoExerciseId'>;

// ─── Pré-remplissage des objectifs d'un exercice ──────────────────────────────
// Priorité : (1) mémoire des derniers objectifs pour cette program_session,
// (2) objectifs agrégés du template étalés en N séries, (3) aucune série.

function setsFromMemory(mem: MemorizedSet[]): SetTargets[] {
  return mem.map((s) => ({
    setNumber: s.setNumber,
    targetRepsMin: s.targetRepsMin,
    targetRepsMax: s.targetRepsMax,
    targetWeightMin: s.targetWeightMin,
    targetWeightMax: s.targetWeightMax,
    targetRirMin: s.targetRirMin,
    targetRirMax: s.targetRirMax,
    targetRestSeconds: s.targetRestSeconds,
    targetDurationSeconds: s.targetDurationSeconds,
    tempo: s.tempo,
  }));
}

function setsFromTemplate(pe: ProgramExercise): SetTargets[] {
  const hasAnyTarget =
    pe.targetSetsMin != null || pe.targetSetsMax != null ||
    pe.targetRepsMin != null || pe.targetRepsMax != null ||
    pe.targetWeightMin != null || pe.targetWeightMax != null ||
    pe.targetRirMin != null || pe.targetRirMax != null ||
    pe.targetRestSeconds != null || pe.targetDurationSeconds != null ||
    pe.tempo != null;
  if (!hasAnyTarget) return [];

  const n = pe.targetSetsMin ?? pe.targetSetsMax ?? 1;
  return Array.from({ length: Math.max(1, n) }, (_, i) => ({
    setNumber: i + 1,
    targetRepsMin: pe.targetRepsMin,
    targetRepsMax: pe.targetRepsMax,
    targetWeightMin: pe.targetWeightMin,
    targetWeightMax: pe.targetWeightMax,
    targetRirMin: pe.targetRirMin,
    targetRirMax: pe.targetRirMax,
    targetRestSeconds: pe.targetRestSeconds,
    targetDurationSeconds: pe.targetDurationSeconds,
    tempo: pe.tempo,
  }));
}

function buildSetsFor(
  memData: Record<string, MemorizedSet[]> | null,
  exerciseId: string,
  pe: ProgramExercise
): SetTargets[] {
  const mem = memData?.[exerciseId];
  if (mem && mem.length > 0) return setsFromMemory(mem);
  return setsFromTemplate(pe);
}

async function insertMesoExercise(
  mesoSessionId: string,
  exerciseId: string,
  alternativeExerciseIds: string[] | null,
  order: number,
  selectedVariation: string | null,
  sets: SetTargets[]
) {
  const meId = generateId();
  await db.insert(mesoExercises).values({
    id: meId,
    mesoSessionId,
    exerciseId,
    alternativeExerciseIds: alternativeExerciseIds ?? undefined,
    order,
    selectedVariation,
  });
  for (const s of sets) {
    await db.insert(mesoSets).values({ id: generateId(), mesoExerciseId: meId, ...s });
  }
  return meId;
}

// ─── Copie d'une program_session dans un mésocycle ────────────────────────────

export async function copyProgramSessionToMeso(
  programSessionId: string,
  mesocycleId: string,
  weekIndex: number,
  order: number
): Promise<string> {
  const [ps] = await db
    .select()
    .from(programSessions)
    .where(eq(programSessions.id, programSessionId));
  if (!ps) throw new Error(`program_session introuvable : ${programSessionId}`);

  const [mem] = await db
    .select()
    .from(targetMemory)
    .where(eq(targetMemory.programSessionId, programSessionId));
  const memData = (mem?.data as Record<string, MemorizedSet[]> | undefined) ?? null;

  const sessionId = generateId();
  await db.insert(mesoSessions).values({
    id: sessionId,
    mesocycleId,
    programSessionId,
    weekIndex,
    order,
    title: ps.name,
    day: ps.day,
    color: ps.color,
  });

  const pes = await db
    .select()
    .from(programExercises)
    .where(eq(programExercises.programSessionId, programSessionId))
    .orderBy(asc(programExercises.order));

  for (const pe of pes) {
    const sets = buildSetsFor(memData, pe.exerciseId, pe);
    await insertMesoExercise(
      sessionId,
      pe.exerciseId,
      (pe.alternativeExerciseIds as string[] | null) ?? null,
      pe.order,
      pe.selectedVariation,
      sets
    );
  }

  return sessionId;
}

// ─── Ajout d'une mesoSession vierge issue d'un exercice ajouté manuellement ───

export async function addMesoExerciseFromPicker(
  mesoSessionId: string,
  exerciseId: string,
  order: number
): Promise<string> {
  return insertMesoExercise(mesoSessionId, exerciseId, null, order, null, []);
}

// Crée une séance vierge (sans programme d'origine, sans exercice).
export async function addBlankMesoSession(
  mesocycleId: string,
  weekIndex: number,
  order: number
): Promise<string> {
  const sessionId = generateId();
  await db.insert(mesoSessions).values({
    id: sessionId,
    mesocycleId,
    weekIndex,
    order,
    title: 'Nouvelle séance',
    color: '#007AFF',
  });
  return sessionId;
}

// ─── Semaines ─────────────────────────────────────────────────────────────────

// Ajoute une semaine en fin de liste. Si un programme est affecté, peuple la
// nouvelle semaine avec ses séances. Retourne le numéro de la semaine créée.
export async function addWeek(mesocycleId: string): Promise<number> {
  const [meso] = await db.select().from(mesocycles).where(eq(mesocycles.id, mesocycleId));
  if (!meso) throw new Error(`mésocycle introuvable : ${mesocycleId}`);

  const newWeek = meso.numWeeks + 1;
  await db.update(mesocycles).set({ numWeeks: newWeek }).where(eq(mesocycles.id, mesocycleId));

  if (meso.programId) {
    const sessions = await db
      .select()
      .from(programSessions)
      .where(eq(programSessions.programId, meso.programId))
      .orderBy(asc(programSessions.order));
    let order = 0;
    for (const ps of sessions) {
      await copyProgramSessionToMeso(ps.id, mesocycleId, newWeek, order++);
    }
  }

  return newWeek;
}

// Copie profonde de toutes les séances d'une semaine vers une nouvelle semaine.
export async function duplicateWeek(mesocycleId: string, srcWeek: number): Promise<number> {
  const [meso] = await db.select().from(mesocycles).where(eq(mesocycles.id, mesocycleId));
  if (!meso) throw new Error(`mésocycle introuvable : ${mesocycleId}`);

  const newWeek = meso.numWeeks + 1;
  await db.update(mesocycles).set({ numWeeks: newWeek }).where(eq(mesocycles.id, mesocycleId));

  const sessions = await db
    .select()
    .from(mesoSessions)
    .where(eq(mesoSessions.mesocycleId, mesocycleId))
    .orderBy(asc(mesoSessions.order));
  const weekSessions = sessions.filter((s) => s.weekIndex === srcWeek);

  for (const s of weekSessions) {
    const newSessionId = generateId();
    await db.insert(mesoSessions).values({
      id: newSessionId,
      mesocycleId,
      programSessionId: s.programSessionId,
      weekIndex: newWeek,
      order: s.order,
      title: s.title,
      note: s.note,
      day: s.day,
      color: s.color,
    });

    const exos = await db
      .select()
      .from(mesoExercises)
      .where(eq(mesoExercises.mesoSessionId, s.id))
      .orderBy(asc(mesoExercises.order));

    for (const ex of exos) {
      const sets = await db
        .select()
        .from(mesoSets)
        .where(eq(mesoSets.mesoExerciseId, ex.id))
        .orderBy(asc(mesoSets.setNumber));
      await insertMesoExercise(
        newSessionId,
        ex.exerciseId,
        (ex.alternativeExerciseIds as string[] | null) ?? null,
        ex.order,
        ex.selectedVariation,
        sets.map(({ id, mesoExerciseId, ...rest }) => rest)
      );
    }
  }

  return newWeek;
}

// Supprime une semaine (cascade sur exos/sets) et renumérote les suivantes.
export async function deleteWeek(mesocycleId: string, week: number): Promise<void> {
  const sessions = await db
    .select()
    .from(mesoSessions)
    .where(eq(mesoSessions.mesocycleId, mesocycleId));

  for (const s of sessions) {
    if (s.weekIndex === week) {
      await db.delete(mesoSessions).where(eq(mesoSessions.id, s.id));
    } else if (s.weekIndex > week) {
      await db
        .update(mesoSessions)
        .set({ weekIndex: s.weekIndex - 1 })
        .where(eq(mesoSessions.id, s.id));
    }
  }

  const [meso] = await db.select().from(mesocycles).where(eq(mesocycles.id, mesocycleId));
  if (meso && meso.numWeeks > 0) {
    await db
      .update(mesocycles)
      .set({ numWeeks: meso.numWeeks - 1 })
      .where(eq(mesocycles.id, mesocycleId));
  }
}

// ─── Mémoire des objectifs ────────────────────────────────────────────────────

// Mémorise les objectifs actuels d'une mesoSession pour sa program_session
// d'origine, afin de pré-remplir les prochaines copies. No-op si pas d'origine.
export async function saveTargetMemory(mesoSessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(mesoSessions)
    .where(eq(mesoSessions.id, mesoSessionId));
  if (!session || !session.programSessionId) return;

  const exos = await db
    .select()
    .from(mesoExercises)
    .where(eq(mesoExercises.mesoSessionId, mesoSessionId));

  const data: Record<string, MemorizedSet[]> = {};
  for (const ex of exos) {
    const sets = await db
      .select()
      .from(mesoSets)
      .where(eq(mesoSets.mesoExerciseId, ex.id))
      .orderBy(asc(mesoSets.setNumber));
    if (sets.length === 0) continue;
    data[ex.exerciseId] = sets.map((s) => ({
      setNumber: s.setNumber,
      targetRepsMin: s.targetRepsMin,
      targetRepsMax: s.targetRepsMax,
      targetWeightMin: s.targetWeightMin,
      targetWeightMax: s.targetWeightMax,
      targetRirMin: s.targetRirMin,
      targetRirMax: s.targetRirMax,
      targetRestSeconds: s.targetRestSeconds,
      targetDurationSeconds: s.targetDurationSeconds,
      tempo: s.tempo,
    }));
  }

  await db
    .insert(targetMemory)
    .values({
      programSessionId: session.programSessionId,
      data,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: targetMemory.programSessionId,
      set: { data, updatedAt: new Date().toISOString() },
    });
}
