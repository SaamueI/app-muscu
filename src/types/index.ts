export type MeasurementType = 'reps' | 'time';

export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  description?: string;
  measurementType: MeasurementType;
  isCustom: boolean;
  notes?: string;
}

export type Weekday =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

export interface Program {
  id: string;
  name: string;
  description?: string;
  sessions: ProgramSession[];
}

export interface ProgramSession {
  id: string;
  programId: string;
  name: string;
  order: number;
  color: string;
  exercises: ProgramExercise[];
  day?: Weekday;
}

export interface ProgramExercise {
  id: string;
  exerciseId: string;
  alternativeExerciseIds?: string[];
  order: number;
  targetSets?: number;
  targetReps?: number;
  targetWeight?: number;
  targetDurationSeconds?: number;
  tempo?: number;
}

export type CalendarEventType = 'workout_session' | string;
export type CalendarEventStatus = 'planned' | 'completed' | 'skipped';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  status: CalendarEventStatus;
  date?: string;
  week?: string;
  refId?: string;
}

export interface WorkoutSession {
  id: string;
  calendarEventId: string;
  programSessionId?: string;
  date: string;
  startedAt?: string;
  finishedAt?: string;
  exercises: ExerciseLog[];
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  programExerciseId?: string;
  order: number;
  sets: SetLog[];
  time: string;
  note?: string;
}

export interface SetLog {
  id: string;
  weight?: number;
  pdc?: boolean;
  reps?: number;
  durationSeconds?: number;
  restSeconds?: number;
  partialReps?: number;
  rir?: number;
}
