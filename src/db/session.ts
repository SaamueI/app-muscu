import { asc, desc, eq } from 'drizzle-orm';

import { db } from './index';
import {
  calendarEvents,
  exerciseLogs,
  exercises,
  mesoExercises,
  mesoSessions,
  mesoSets,
  programExercises,
  programSessions,
  restPresets,
  setLogs,
  userSettings,
  workoutSessions,
} from './schema';
import { generateId } from '../utils/generateId';

// ─── Types exportés ───────────────────────────────────────────────────────────

export type SetLogData = {
  weight: number | null;
  reps: number | null;
  rir: number | null;
  partialReps: number | null;
  pdc: boolean;
  durationSeconds: number | null;
  restSeconds: number | null;
  executionSeconds: number | null;
};

export type PerfGroup = {
  sessionDate: string;
  sessionId: string;
  sets: (typeof setLogs.$inferSelect)[];
};

export type ExerciseLogEnriched = {
  log: typeof exerciseLogs.$inferSelect;
  exercise: typeof exercises.$inferSelect;
  setLogs: (typeof setLogs.$inferSelect)[];
  mesoSets: (typeof mesoSets.$inferSelect)[];
  programExercise: typeof programExercises.$inferSelect | null;
};

export type SessionLiveData = {
  session: typeof workoutSessions.$inferSelect;
  exerciseLogs: ExerciseLogEnriched[];
};

// ─── Paramètres utilisateur ───────────────────────────────────────────────────

export async function getUserWeightUnit(): Promise<'kg' | 'lb'> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.id, 'singleton'));
  return (row?.weightUnit as 'kg' | 'lb') ?? 'kg';
}

export async function setUserWeightUnit(unit: 'kg' | 'lb'): Promise<void> {
  await db
    .insert(userSettings)
    .values({ id: 'singleton', weightUnit: unit })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: { weightUnit: unit },
    });
}

export async function getRestPresets() {
  return db.select().from(restPresets).orderBy(asc(restPresets.sortOrder));
}

export async function addRestPreset(seconds: number): Promise<void> {
  const existing = await db.select().from(restPresets).orderBy(desc(restPresets.sortOrder));
  const maxOrder = existing[0]?.sortOrder ?? -1;
  await db.insert(restPresets).values({ id: generateId(), seconds, sortOrder: maxOrder + 1 });
}

export async function deleteRestPreset(id: string): Promise<void> {
  await db.delete(restPresets).where(eq(restPresets.id, id));
}

// ─── Démarrer une séance ──────────────────────────────────────────────────────

type StartParams = {
  programSessionId?: string;
  mesoSessionId?: string;
  calendarEventId?: string;
};

export async function startWorkoutSession(params: StartParams): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  let calEventId = params.calendarEventId;
  let resolvedProgramSessionId = params.programSessionId;
  let resolvedMesoSessionId = params.mesoSessionId;

  if (!calEventId) {
    // Déterminer le titre et le refId depuis le template
    let title = 'Séance';
    let refId: string | null = null;
    let refType: 'meso_session' | 'program_session' | null = null;

    if (params.mesoSessionId) {
      const [ms] = await db
        .select()
        .from(mesoSessions)
        .where(eq(mesoSessions.id, params.mesoSessionId));
      title = ms?.title ?? 'Séance';
      refId = params.mesoSessionId;
      refType = 'meso_session';
      if (ms?.programSessionId) resolvedProgramSessionId = ms.programSessionId;
    } else if (params.programSessionId) {
      const [ps] = await db
        .select()
        .from(programSessions)
        .where(eq(programSessions.id, params.programSessionId));
      title = ps?.name ?? 'Séance';
      refId = params.programSessionId;
      refType = 'program_session';
    }

    calEventId = generateId();
    await db.insert(calendarEvents).values({
      id: calEventId,
      type: 'workout_session',
      status: 'planned',
      date: today,
      title,
      refId,
      refType,
    });
  } else {
    // Résoudre programSessionId / mesoSessionId depuis l'event si pas fourni,
    // en distinguant grâce à ref_type. FIX : avant, refId était toujours
    // assigné à resolvedProgramSessionId même s'il pointait vers une
    // meso_session, empêchant le pré-remplissage exercise_logs.
    if (!resolvedProgramSessionId && !resolvedMesoSessionId) {
      const [ev] = await db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, calEventId));
      if (ev?.refId) {
        if (ev.refType === 'meso_session') {
          resolvedMesoSessionId = ev.refId;
          const [ms] = await db
            .select()
            .from(mesoSessions)
            .where(eq(mesoSessions.id, ev.refId));
          if (ms?.programSessionId) resolvedProgramSessionId = ms.programSessionId;
        } else {
          // 'program_session', ou refType NULL (event pré-migration non
          // backfillé) : comportement par défaut inchangé.
          resolvedProgramSessionId = ev.refId;
        }
      }
    }
  }

  const sessionId = generateId();
  await db.insert(workoutSessions).values({
    id: sessionId,
    calendarEventId: calEventId,
    programSessionId: resolvedProgramSessionId ?? null,
    mesoSessionId: resolvedMesoSessionId ?? null,
    date: today,
    startedAt: now,
  });

  // Initialiser les exercise_logs depuis le template
  if (resolvedMesoSessionId) {
    const exos = await db
      .select()
      .from(mesoExercises)
      .where(eq(mesoExercises.mesoSessionId, resolvedMesoSessionId))
      .orderBy(asc(mesoExercises.order));

    for (const ex of exos) {
      await db.insert(exerciseLogs).values({
        id: generateId(),
        workoutSessionId: sessionId,
        exerciseId: ex.exerciseId,
        mesoExerciseId: ex.id,
        supersetGroupId: ex.supersetGroupId ?? null,
        order: ex.order,
        time: now,
      });
    }
  } else if (resolvedProgramSessionId) {
    const exos = await db
      .select()
      .from(programExercises)
      .where(eq(programExercises.programSessionId, resolvedProgramSessionId))
      .orderBy(asc(programExercises.order));

    for (const ex of exos) {
      await db.insert(exerciseLogs).values({
        id: generateId(),
        workoutSessionId: sessionId,
        exerciseId: ex.exerciseId,
        programExerciseId: ex.id,
        supersetGroupId: ex.supersetGroupId ?? null,
        order: ex.order,
        time: now,
      });
    }
  }

  return sessionId;
}

// ─── Exercice libre ───────────────────────────────────────────────────────────

export async function addFreeExerciseLog(
  sessionId: string,
  exerciseId: string,
  order: number
): Promise<string> {
  const logId = generateId();
  await db.insert(exerciseLogs).values({
    id: logId,
    workoutSessionId: sessionId,
    exerciseId,
    order,
    time: new Date().toISOString(),
  });
  return logId;
}

// ─── Enregistrer une série ────────────────────────────────────────────────────

export async function saveSetLog(
  exerciseLogId: string,
  data: SetLogData,
  setNumber: number,
  side?: 'L' | 'R'
): Promise<string> {
  const id = generateId();
  await db.insert(setLogs).values({
    id,
    exerciseLogId,
    weight: data.weight,
    reps: data.reps,
    rir: data.rir,
    partialReps: data.partialReps,
    pdc: data.pdc,
    durationSeconds: data.durationSeconds,
    restSeconds: data.restSeconds,
    executionSeconds: data.executionSeconds,
    setNumber,
    side: side ?? null,
  });
  return id;
}

// ─── Édition / suppression d'une série ───────────────────────────────────────

export async function updateSetLog(id: string, data: SetLogData): Promise<void> {
  await db.update(setLogs).set({
    weight: data.weight,
    reps: data.reps,
    rir: data.rir,
    partialReps: data.partialReps,
    pdc: data.pdc,
    durationSeconds: data.durationSeconds,
    restSeconds: data.restSeconds,
    executionSeconds: data.executionSeconds,
  }).where(eq(setLogs.id, id));
}

export async function deleteSetLog(id: string): Promise<void> {
  await db.delete(setLogs).where(eq(setLogs.id, id));
}

// ─── Marquer exercice fait / pas fait ────────────────────────────────────────

export async function markExerciseDone(logId: string, isDone: boolean): Promise<void> {
  await db.update(exerciseLogs).set({ isDone }).where(eq(exerciseLogs.id, logId));
}

// ─── Terminer la séance ───────────────────────────────────────────────────────

export async function finishSession(sessionId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.update(workoutSessions).set({ finishedAt: now }).where(eq(workoutSessions.id, sessionId));

  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (session?.calendarEventId) {
    await db
      .update(calendarEvents)
      .set({ status: 'completed' })
      .where(eq(calendarEvents.id, session.calendarEventId));
  }
}

// ─── Données live de la séance ────────────────────────────────────────────────

export async function getSessionLive(sessionId: string): Promise<SessionLiveData | null> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!session) return null;

  const logRows = await db
    .select({ log: exerciseLogs, exercise: exercises })
    .from(exerciseLogs)
    .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
    .where(eq(exerciseLogs.workoutSessionId, sessionId))
    .orderBy(asc(exerciseLogs.order));

  const enriched: ExerciseLogEnriched[] = [];
  for (const { log, exercise } of logRows) {
    const sets = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.exerciseLogId, log.id))
      .orderBy(asc(setLogs.setNumber));

    let msets: (typeof mesoSets.$inferSelect)[] = [];
    let pe: typeof programExercises.$inferSelect | null = null;

    if (log.mesoExerciseId) {
      msets = await db
        .select()
        .from(mesoSets)
        .where(eq(mesoSets.mesoExerciseId, log.mesoExerciseId))
        .orderBy(asc(mesoSets.setNumber));
    } else if (log.programExerciseId) {
      const [row] = await db
        .select()
        .from(programExercises)
        .where(eq(programExercises.id, log.programExerciseId));
      pe = row ?? null;
    }

    enriched.push({ log, exercise, setLogs: sets, mesoSets: msets, programExercise: pe });
  }

  return { session, exerciseLogs: enriched };
}

// ─── Historique des performances d'un exercice ───────────────────────────────

export async function getPreviousPerfs(
  exerciseId: string,
  limit = 5
): Promise<PerfGroup[]> {
  // Récupère les IDs des N dernières séances terminées contenant cet exercice
  const recentLogs = await db
    .select({ sessionId: workoutSessions.id, sessionDate: workoutSessions.date })
    .from(exerciseLogs)
    .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
    .where(eq(exerciseLogs.exerciseId, exerciseId))
    .orderBy(desc(workoutSessions.date));

  // Déduplication en JS : garder les N premières dates distinctes
  const seen = new Set<string>();
  const recentSessionIds: string[] = [];
  const dateBySessionId: Record<string, string> = {};
  for (const row of recentLogs) {
    if (!seen.has(row.sessionId)) {
      if (seen.size >= limit) break;
      seen.add(row.sessionId);
      recentSessionIds.push(row.sessionId);
      dateBySessionId[row.sessionId] = row.sessionDate;
    }
  }

  if (recentSessionIds.length === 0) return [];

  // Récupère tous les set_logs pour ces séances et cet exercice
  const allLogs = await db
    .select({ sl: setLogs, el: exerciseLogs })
    .from(setLogs)
    .innerJoin(exerciseLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
    .where(eq(exerciseLogs.exerciseId, exerciseId))
    .orderBy(asc(setLogs.setNumber));

  const filteredLogs = allLogs.filter((r) =>
    recentSessionIds.includes(r.el.workoutSessionId)
  );

  // Groupement par session
  const groups: Record<string, (typeof setLogs.$inferSelect)[]> = {};
  for (const { sl, el } of filteredLogs) {
    if (!groups[el.workoutSessionId]) groups[el.workoutSessionId] = [];
    groups[el.workoutSessionId].push(sl);
  }

  return recentSessionIds.map((sid) => ({
    sessionId: sid,
    sessionDate: dateBySessionId[sid],
    sets: groups[sid] ?? [],
  }));
}

// ─── Vérifier si une séance est déjà en cours pour un événement ──────────────

export async function getExistingSession(calendarEventId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.calendarEventId, calendarEventId));
  return row?.id ?? null;
}

// ─── Suppression d'un événement calendrier ────────────────────────────────────
// workoutSessions.calendarEventId est NOT NULL sans onDelete → supprimer un
// calendar_event référencé par un workout_session lève une erreur FK. On
// supprime donc d'abord la/les workout_session(s) liée(s) (leur suppression
// cascade automatiquement vers exercise_logs puis set_logs, via les
// ON DELETE CASCADE du schéma), avant de supprimer le calendar_event lui-même.
export async function deleteCalendarEventCascade(calendarEventId: string): Promise<void> {
  const linkedSessions = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.calendarEventId, calendarEventId));

  for (const ws of linkedSessions) {
    await db.delete(workoutSessions).where(eq(workoutSessions.id, ws.id));
  }

  await db.delete(calendarEvents).where(eq(calendarEvents.id, calendarEventId));
}
