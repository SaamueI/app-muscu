import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, ne } from 'drizzle-orm';

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
import { getActiveSession, leaveSuperset, notifySessionEnded, resetActiveSession, setActiveSession } from '../utils/activeSessionStore';

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
  note: string | null;
};

export type PerfGroup = {
  sessionDate: string;
  sessionId: string;
  sets: (typeof setLogs.$inferSelect)[];
  // Variante faite lors de cette séance (exercise_logs.selected_variation), si renseignée
  variation: string | null;
};

export type ExerciseLogEnriched = {
  log: typeof exerciseLogs.$inferSelect;
  exercise: typeof exercises.$inferSelect;
  setLogs: (typeof setLogs.$inferSelect)[];
  mesoSets: (typeof mesoSets.$inferSelect)[];
  programExercise: typeof programExercises.$inferSelect | null;
  mesoExercise: typeof mesoExercises.$inferSelect | null;
  // Exercice prévu au plan quand l'exercice fait est différent (remplacement, amélioration 14)
  plannedExercise: typeof exercises.$inferSelect | null;
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
  date?: string;
  movedEventFromDate?: string;
};

export async function startWorkoutSession(params: StartParams): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const createdEvent = !params.calendarEventId;
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
    date: params.date ?? today,
    startedAt: now,
    createdEvent,
    movedEventFromDate: params.movedEventFromDate ?? null,
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
        // Le log porte la variante réellement faite : un changement ultérieur du plan
        // ne réécrit pas l'historique.
        selectedVariation: ex.selectedVariation ?? null,
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
        selectedVariation: ex.selectedVariation ?? null,
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

// ─── Remplacer l'exercice en cours (amélioration 14) ──────────────────────────
// Renvoie l'id du log à afficher.
// - 0 série enregistrée : on change simplement l'exercice du log (le plan reste lié).
// - ≥ 1 série : le log d'origine garde ses séries et passe « fait » ; un nouveau log est
//   créé juste après lui (même ligne de plan, même superset). Ses séries reprendront
//   à la suite des séries déjà faites (voir getChainInfo, src/utils/exerciseSwap.ts).
// La variante repart à « Aucune » ('') : celle du plan concerne l'exercice d'origine.
// Le plan (méso/programme) n'est jamais modifié.

export async function swapExerciseLog(logId: string, newExerciseId: string): Promise<string> {
  const [log] = await db.select().from(exerciseLogs).where(eq(exerciseLogs.id, logId));
  if (!log || log.exerciseId === newExerciseId) return logId;

  const logged = await db.select({ id: setLogs.id }).from(setLogs).where(eq(setLogs.exerciseLogId, logId));
  if (logged.length === 0) {
    await db
      .update(exerciseLogs)
      .set({ exerciseId: newExerciseId, selectedVariation: '' })
      .where(eq(exerciseLogs.id, logId));
    return logId;
  }

  // Faire de la place juste après le log d'origine
  const later = await db
    .select()
    .from(exerciseLogs)
    .where(and(eq(exerciseLogs.workoutSessionId, log.workoutSessionId), gt(exerciseLogs.order, log.order)));
  for (const l of later) {
    await db.update(exerciseLogs).set({ order: l.order + 1 }).where(eq(exerciseLogs.id, l.id));
  }

  await db.update(exerciseLogs).set({ isDone: true }).where(eq(exerciseLogs.id, logId));

  const newId = generateId();
  await db.insert(exerciseLogs).values({
    id: newId,
    workoutSessionId: log.workoutSessionId,
    exerciseId: newExerciseId,
    programExerciseId: log.programExerciseId,
    mesoExerciseId: log.mesoExerciseId,
    supersetGroupId: log.supersetGroupId,
    order: log.order + 1,
    time: new Date().toISOString(),
    selectedVariation: '',
  });
  return newId;
}

// ─── Variante réellement faite (amélioration 14) ───────────────────────────────

// null = « Aucune » : stocké '' pour la distinguer d'une variante non renseignée (null).
export async function setExerciseLogVariation(logId: string, variation: string | null): Promise<void> {
  await db
    .update(exerciseLogs)
    .set({ selectedVariation: variation ?? '' })
    .where(eq(exerciseLogs.id, logId));
}

// Ajoute une variante au catalogue de l'exercice (comme le fait la fiche exercice), sans doublon.
export async function addVariationToExercise(exerciseId: string, value: string): Promise<void> {
  const v = value.trim();
  if (!v) return;
  const [row] = await db.select({ variations: exercises.variations }).from(exercises).where(eq(exercises.id, exerciseId));
  const current = (row?.variations as string[] | null) ?? [];
  if (current.includes(v)) return;
  await db.update(exercises).set({ variations: [...current, v] }).where(eq(exercises.id, exerciseId));
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
    note: data.note,
    setNumber,
    side: side ?? null,
  });
  return id;
}

// ─── Édition / suppression d'une série ───────────────────────────────────────

// Toute édition par le modal vaut encodage : une série « à encoder » cesse de l'être.
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
    note: data.note,
    isPending: false,
  }).where(eq(setLogs.id, id));
}

// ─── Encodage différé (superset, amélioration 01b) ───────────────────────────
// « Terminer série » crée tout de suite la ligne : le moteur de séquence (dérivé des
// set_logs) la compte comme faite, et rien n'est perdu si l'app est tuée. Les perfs
// sont complétées plus tard par completeSetLog.

export async function createPendingSetLog(
  exerciseLogId: string,
  setNumber: number,
  side: 'L' | 'R' | null,
  executionSeconds: number | null,
  restSeconds: number | null
): Promise<string> {
  const id = generateId();
  await db.insert(setLogs).values({
    id,
    exerciseLogId,
    executionSeconds,
    restSeconds,
    setNumber,
    side,
    isPending: true,
  });
  return id;
}

// Écrit les perfs saisies sans toucher aux temps mesurés (le modal ne les connaît pas).
export async function completeSetLog(id: string, data: SetLogData): Promise<void> {
  await db.update(setLogs).set({
    weight: data.weight,
    reps: data.reps,
    rir: data.rir,
    partialReps: data.partialReps,
    pdc: data.pdc,
    note: data.note,
    isPending: false,
  }).where(eq(setLogs.id, id));
}

export async function countPendingSetLogs(workoutSessionId: string): Promise<number> {
  const rows = await db
    .select({ id: setLogs.id })
    .from(setLogs)
    .innerJoin(exerciseLogs, eq(setLogs.exerciseLogId, exerciseLogs.id))
    .where(and(eq(exerciseLogs.workoutSessionId, workoutSessionId), eq(setLogs.isPending, true)));
  return rows.length;
}

export async function deleteSetLog(id: string): Promise<void> {
  await db.delete(setLogs).where(eq(setLogs.id, id));
}

// ─── Renumérotation après suppression ────────────────────────────────────────
// Après suppression de la série #N (et son partenaire L/R le cas échéant),
// décale les séries suivantes (#N+1, #N+2, …) d'un cran pour combler le trou.

export async function renumberSetsAfterDelete(
  exerciseLogId: string,
  deletedSetNumber: number
): Promise<void> {
  const rows = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.exerciseLogId, exerciseLogId));

  for (const row of rows) {
    if (row.setNumber != null && row.setNumber > deletedSetNumber) {
      await db.update(setLogs).set({ setNumber: row.setNumber - 1 }).where(eq(setLogs.id, row.id));
    }
  }
}

// ─── Réordonnancement manuel des séries ──────────────────────────────────────
// Échange les set_logs de deux numéros de série (G+D compris pour l'unilatéral).

export async function swapSetNumbers(
  exerciseLogId: string,
  setNumberA: number,
  setNumberB: number
): Promise<void> {
  const rows = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.exerciseLogId, exerciseLogId));

  const aIds = rows.filter((r) => r.setNumber === setNumberA).map((r) => r.id);
  const bIds = rows.filter((r) => r.setNumber === setNumberB).map((r) => r.id);

  for (const id of aIds) {
    await db.update(setLogs).set({ setNumber: setNumberB }).where(eq(setLogs.id, id));
  }
  for (const id of bIds) {
    await db.update(setLogs).set({ setNumber: setNumberA }).where(eq(setLogs.id, id));
  }
}

// ─── Marquer exercice fait / pas fait ────────────────────────────────────────

export async function markExerciseDone(logId: string, isDone: boolean): Promise<void> {
  await db.update(exerciseLogs).set({ isDone }).where(eq(exerciseLogs.id, logId));
  // Un exercice du superset en cours marqué fait (carte de l'écran séance, écran exercice…)
  // termine ce superset : plus de bandeau « en cours » ni de renvoi vers son écran.
  const sup = getActiveSession().activeSuperset;
  if (isDone && sup && (sup.a === logId || sup.b === logId)) leaveSuperset();
  // Exercice terminé pendant son repos : le minuteur global ne doit plus lancer sa série suivante
  if (isDone && getActiveSession().autoNext?.logId === logId) setActiveSession({ autoNext: null });
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

  if (getActiveSession().sessionId === sessionId) {
    resetActiveSession();
  }
  notifySessionEnded();
}

// ─── Ré-hydrater le store après un kill de l'app ─────────────────────────────
// Le store est en mémoire : si Android tue l'app, il est vide alors que la
// séance reste ouverte en DB (finished_at IS NULL). Au lancement, on retrouve
// la séance non terminée la plus récente, commencée il y a moins de 12 h
// (au-delà on suppose une séance oubliée, pas une séance en cours).

const OPEN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export async function restoreOpenSession(): Promise<void> {
  if (getActiveSession().sessionId) return;
  const since = new Date(Date.now() - OPEN_SESSION_MAX_AGE_MS).toISOString();
  const [open] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        isNull(workoutSessions.finishedAt),
        isNotNull(workoutSessions.startedAt),
        gte(workoutSessions.startedAt, since)
      )
    )
    .orderBy(desc(workoutSessions.startedAt))
    .limit(1);
  if (!open?.startedAt) return;
  setActiveSession({ sessionId: open.id, sessionStartedAt: Date.parse(open.startedAt) });
}

// ─── Annuler une séance commencée ─────────────────────────────────────────────
// Supprime le workout_session (cascade vers exercise_logs puis set_logs).
// L'event calendrier redevient "planned" s'il préexistait, ou est supprimé
// s'il avait été créé ad hoc au démarrage (session.createdEvent).

export async function cancelWorkoutSession(sessionId: string): Promise<void> {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId));
  if (!session) return;

  await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));

  if (session.createdEvent) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, session.calendarEventId));
  } else {
    await db
      .update(calendarEvents)
      .set({
        status: 'planned',
        ...(session.movedEventFromDate ? { date: session.movedEventFromDate } : {}),
      })
      .where(eq(calendarEvents.id, session.calendarEventId));
  }

  if (getActiveSession().sessionId === sessionId) {
    resetActiveSession();
  }
  notifySessionEnded();
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
  const plannedCache = new Map<string, typeof exercises.$inferSelect | null>();
  for (const { log, exercise } of logRows) {
    const sets = await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.exerciseLogId, log.id))
      .orderBy(asc(setLogs.setNumber));

    let msets: (typeof mesoSets.$inferSelect)[] = [];
    let pe: typeof programExercises.$inferSelect | null = null;
    let me: typeof mesoExercises.$inferSelect | null = null;

    if (log.mesoExerciseId) {
      msets = await db
        .select()
        .from(mesoSets)
        .where(eq(mesoSets.mesoExerciseId, log.mesoExerciseId))
        .orderBy(asc(mesoSets.setNumber));
      const [meRow] = await db
        .select()
        .from(mesoExercises)
        .where(eq(mesoExercises.id, log.mesoExerciseId));
      me = meRow ?? null;
    } else if (log.programExerciseId) {
      const [row] = await db
        .select()
        .from(programExercises)
        .where(eq(programExercises.id, log.programExerciseId));
      pe = row ?? null;
    }

    // Exercice prévu au plan, uniquement s'il diffère de celui qui est fait
    let planned: typeof exercises.$inferSelect | null = null;
    const plannedId = (me ?? pe)?.exerciseId;
    if (plannedId && plannedId !== log.exerciseId) {
      if (!plannedCache.has(plannedId)) {
        const [p] = await db.select().from(exercises).where(eq(exercises.id, plannedId));
        plannedCache.set(plannedId, p ?? null);
      }
      planned = plannedCache.get(plannedId) ?? null;
    }

    enriched.push({
      log,
      exercise,
      setLogs: sets,
      mesoSets: msets,
      programExercise: pe,
      mesoExercise: me,
      plannedExercise: planned,
    });
  }

  return { session, exerciseLogs: enriched };
}

export async function getAlternativeExercises(ids: string[] | null): Promise<(typeof exercises.$inferSelect)[]> {
  if (!ids || ids.length === 0) return [];
  return db.select().from(exercises).where(inArray(exercises.id, ids));
}

// ─── Historique des performances d'un exercice ───────────────────────────────

export async function getPreviousPerfs(
  exerciseId: string,
  limit = 5,
  excludeSessionId?: string
): Promise<PerfGroup[]> {
  // Récupère les IDs des N dernières séances terminées contenant cet exercice
  const conditions = [eq(exerciseLogs.exerciseId, exerciseId), isNotNull(workoutSessions.finishedAt)];
  if (excludeSessionId) conditions.push(ne(workoutSessions.id, excludeSessionId));

  const recentLogs = await db
    .select({ sessionId: workoutSessions.id, sessionDate: workoutSessions.date })
    .from(exerciseLogs)
    .innerJoin(workoutSessions, eq(exerciseLogs.workoutSessionId, workoutSessions.id))
    .where(and(...conditions))
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
  const variations: Record<string, string> = {};
  for (const { sl, el } of filteredLogs) {
    if (!groups[el.workoutSessionId]) groups[el.workoutSessionId] = [];
    groups[el.workoutSessionId].push(sl);
    if (el.selectedVariation && !variations[el.workoutSessionId]) {
      variations[el.workoutSessionId] = el.selectedVariation;
    }
  }

  return recentSessionIds.map((sid) => ({
    sessionId: sid,
    sessionDate: dateBySessionId[sid],
    sets: groups[sid] ?? [],
    variation: variations[sid] ?? null,
  }));
}

// Historique d'un superset : les dernières séances où A **ou** B a été fait, fusionnées par
// séance et triées par date décroissante (dans une même séance, A puis B).
export type SupersetPerfGroup = {
  sessionId: string;
  sessionDate: string;
  a: PerfGroup | null;
  b: PerfGroup | null;
};

export async function getSupersetHistory(
  exerciseIdA: string,
  exerciseIdB: string,
  limit = 5,
  excludeSessionId?: string
): Promise<SupersetPerfGroup[]> {
  const [histA, histB] = await Promise.all([
    getPreviousPerfs(exerciseIdA, limit, excludeSessionId),
    getPreviousPerfs(exerciseIdB, limit, excludeSessionId),
  ]);
  const bySession = new Map<string, SupersetPerfGroup>();
  for (const g of histA) {
    bySession.set(g.sessionId, { sessionId: g.sessionId, sessionDate: g.sessionDate, a: g, b: null });
  }
  for (const g of histB) {
    const existing = bySession.get(g.sessionId);
    if (existing) existing.b = g;
    else bySession.set(g.sessionId, { sessionId: g.sessionId, sessionDate: g.sessionDate, a: null, b: g });
  }
  return [...bySession.values()]
    .sort((x, y) => y.sessionDate.localeCompare(x.sessionDate))
    .slice(0, limit);
}

// ─── Superset improvisé ───────────────────────────────────────────────────────
// Associe deux exercices de la séance en cours : ils partagent un nouveau supersetGroupId
// et s'encadrent en orange comme un superset prévu. Le plan (méso/programme) n'est pas
// modifié : seul l'historique de cette séance garde la trace.

export async function pairExerciseLogs(logIdA: string, logIdB: string): Promise<void> {
  const groupId = generateId();
  await db
    .update(exerciseLogs)
    .set({ supersetGroupId: groupId })
    .where(inArray(exerciseLogs.id, [logIdA, logIdB]));
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
