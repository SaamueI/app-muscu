import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ─── Exercise ────────────────────────────────────────────────────────────────

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  primaryMuscles: text('primary_muscles', { mode: 'json' })
    .notNull()
    .$type<string[]>(),
  secondaryMuscles: text('secondary_muscles', { mode: 'json' }).$type<
    string[]
  >(),
  description: text('description'),
  measurementType: text('measurement_type', { enum: ['reps', 'time'] })
    .notNull()
    .default('reps'),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  weightUnit: text('weight_unit'),
  // Fields from the exercise dataset
  equipment: text('equipment'),
  category: text('category'),
  level: text('level', { enum: ['beginner', 'intermediate', 'expert'] }),
  mechanic: text('mechanic', { enum: ['compound', 'isolation'] }),
  force: text('force', { enum: ['pull', 'push', 'static'] }),
  // URIs of photos added by the user (custom exercises or user-added photos)
  customImageUris: text('custom_image_uris', { mode: 'json' }).$type<string[]>(),
  variations: text('variations', { mode: 'json' }).$type<string[]>(),
});

// ─── Program ─────────────────────────────────────────────────────────────────

export const programs = sqliteTable('programs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
});

// ─── ProgramSession ───────────────────────────────────────────────────────────

export const programSessions = sqliteTable('program_sessions', {
  id: text('id').primaryKey(),
  programId: text('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  order: integer('order').notNull(),
  color: text('color').notNull(),
  day: text('day', {
    enum: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
  }),
});

// ─── ProgramExercise ─────────────────────────────────────────────────────────

export const programExercises = sqliteTable('program_exercises', {
  id: text('id').primaryKey(),
  programSessionId: text('program_session_id')
    .notNull()
    .references(() => programSessions.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  alternativeExerciseIds: text('alternative_exercise_ids', {
    mode: 'json',
  }).$type<string[]>(),
  order: integer('order').notNull(),
  targetSetsMin: integer('target_sets_min'),
  targetSetsMax: integer('target_sets_max'),
  targetRepsMin: integer('target_reps_min'),
  targetRepsMax: integer('target_reps_max'),
  targetWeightMin: real('target_weight_min'),
  targetWeightMax: real('target_weight_max'),
  targetRirMin: integer('target_rir_min'),
  targetRirMax: integer('target_rir_max'),
  targetRestSeconds: integer('target_rest_seconds'),
  targetDurationSeconds: integer('target_duration_seconds'),
  // Tempo au format "excentrique-pauseBasse-concentrique-pauseHaute", ex "3-1-1-0".
  tempo: text('tempo'),
  selectedVariation: text('selected_variation'),
  supersetGroupId: text('superset_group_id'),
});

// ─── CalendarEvent ────────────────────────────────────────────────────────────

export const calendarEvents = sqliteTable('calendar_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull().default('workout_session'),
  status: text('status', { enum: ['planned', 'completed', 'skipped'] })
    .notNull()
    .default('planned'),
  date: text('date'),
  week: text('week'),
  refId: text('ref_id'),
  refType: text('ref_type', { enum: ['program_session', 'meso_session'] }),
  title: text('title').notNull().default(''),
  description: text('description'),
});

// ─── WorkoutSession ───────────────────────────────────────────────────────────

export const workoutSessions = sqliteTable('workout_sessions', {
  id: text('id').primaryKey(),
  calendarEventId: text('calendar_event_id')
    .notNull()
    .references(() => calendarEvents.id),
  programSessionId: text('program_session_id').references(
    () => programSessions.id
  ),
  mesoSessionId: text('meso_session_id').references(() => mesoSessions.id),
  date: text('date').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  createdEvent: integer('created_event', { mode: 'boolean' }).notNull().default(false),
});

// ─── ExerciseLog ─────────────────────────────────────────────────────────────

export const exerciseLogs = sqliteTable('exercise_logs', {
  id: text('id').primaryKey(),
  workoutSessionId: text('workout_session_id')
    .notNull()
    .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  programExerciseId: text('program_exercise_id').references(
    () => programExercises.id
  ),
  mesoExerciseId: text('meso_exercise_id').references(() => mesoExercises.id),
  supersetGroupId: text('superset_group_id'),
  isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
  order: integer('order').notNull(),
  time: text('time').notNull(),
  note: text('note'),
});

// ─── SetLog ───────────────────────────────────────────────────────────────────

export const setLogs = sqliteTable('set_logs', {
  id: text('id').primaryKey(),
  exerciseLogId: text('exercise_log_id')
    .notNull()
    .references(() => exerciseLogs.id, { onDelete: 'cascade' }),
  weight: real('weight'),
  pdc: integer('pdc', { mode: 'boolean' }),
  reps: integer('reps'),
  durationSeconds: integer('duration_seconds'),
  restSeconds: integer('rest_seconds'),
  partialReps: integer('partial_reps'),
  rir: integer('rir'),
  executionSeconds: integer('execution_seconds'),
  setNumber: integer('set_number'),
  side: text('side'),
});

// ─── Mesocycle ────────────────────────────────────────────────────────────────
// Couche « plan » : instanciée depuis un programme (snapshot), porte les
// objectifs. Structurée en semaines logiques (week_index 1, 2, …), pas
// calendaires. start_date null = mésocycle non ancré dans le temps.

export const mesocycles = sqliteTable('mesocycles', {
  id: text('id').primaryKey(),
  // Provenance (snapshot) : modifier/supprimer le programme n'altère pas le méso
  programId: text('program_id').references(() => programs.id, {
    onDelete: 'set null',
  }),
  name: text('name').notNull(),
  numWeeks: integer('num_weeks').notNull(),
  startDate: text('start_date'),
  notes: text('notes'),
  createdAt: text('created_at'),
});

// ─── MesoSession ──────────────────────────────────────────────────────────────
// Pas de `date` stockée : la date concrète se calcule depuis
// mesocycle.startDate + weekIndex + day quand le méso est ancré.

export const mesoSessions = sqliteTable('meso_sessions', {
  id: text('id').primaryKey(),
  mesocycleId: text('mesocycle_id')
    .notNull()
    .references(() => mesocycles.id, { onDelete: 'cascade' }),
  programSessionId: text('program_session_id').references(
    () => programSessions.id,
    { onDelete: 'set null' }
  ),
  weekIndex: integer('week_index').notNull(),
  order: integer('order').notNull(),
  title: text('title'),
  note: text('note'),
  day: text('day', {
    enum: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
  }),
  color: text('color').notNull().default('#007AFF'),
});

// ─── MesoExercise ─────────────────────────────────────────────────────────────

export const mesoExercises = sqliteTable('meso_exercises', {
  id: text('id').primaryKey(),
  mesoSessionId: text('meso_session_id')
    .notNull()
    .references(() => mesoSessions.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id')
    .notNull()
    .references(() => exercises.id),
  alternativeExerciseIds: text('alternative_exercise_ids', {
    mode: 'json',
  }).$type<string[]>(),
  order: integer('order').notNull(),
  selectedVariation: text('selected_variation'),
  supersetGroupId: text('superset_group_id'),
});

// ─── MesoSet (objectifs par série) ────────────────────────────────────────────

export const mesoSets = sqliteTable('meso_sets', {
  id: text('id').primaryKey(),
  mesoExerciseId: text('meso_exercise_id')
    .notNull()
    .references(() => mesoExercises.id, { onDelete: 'cascade' }),
  setNumber: integer('set_number').notNull(),
  targetRepsMin: integer('target_reps_min'),
  targetRepsMax: integer('target_reps_max'),
  targetWeightMin: real('target_weight_min'),
  targetWeightMax: real('target_weight_max'),
  targetRirMin: integer('target_rir_min'),
  targetRirMax: integer('target_rir_max'),
  targetRestSeconds: integer('target_rest_seconds'),
  targetDurationSeconds: integer('target_duration_seconds'),
  // Tempo au format "excentrique-pauseBasse-concentrique-pauseHaute", ex "3-1-1-0".
  tempo: text('tempo'),
});

// ─── TargetMemory ─────────────────────────────────────────────────────────────
// Cache « derniers objectifs saisis » pour une program_session, afin de
// pré-remplir une nouvelle meso_session vide. `data` = { exerciseId: SetTarget[] }.

export const targetMemory = sqliteTable('target_memory', {
  programSessionId: text('program_session_id')
    .primaryKey()
    .references(() => programSessions.id, { onDelete: 'cascade' }),
  data: text('data', { mode: 'json' })
    .$type<Record<string, MemorizedSet[]>>()
    .notNull(),
  updatedAt: text('updated_at'),
});

// ─── RestPresets ──────────────────────────────────────────────────────────────

export const restPresets = sqliteTable('rest_presets', {
  id: text('id').primaryKey(),
  seconds: integer('seconds').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ─── UserSettings ─────────────────────────────────────────────────────────────

export const userSettings = sqliteTable('user_settings', {
  id: text('id').primaryKey().default('singleton'),
  weightUnit: text('weight_unit').notNull().default('kg'),
});

export type MemorizedSet = {
  setNumber: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetWeightMin: number | null;
  targetWeightMax: number | null;
  targetRirMin: number | null;
  targetRirMax: number | null;
  targetRestSeconds: number | null;
  targetDurationSeconds: number | null;
  tempo: string | null;
};
