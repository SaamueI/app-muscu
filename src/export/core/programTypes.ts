// Format pivot d'un programme (template), indépendant de la DB et d'Expo.
// Différence clé avec le mésocycle : les objectifs sont AGRÉGÉS par exercice
// (targetSets min/max + une plage unique), pas détaillés par série.

export const PROGRAM_FORMAT_VERSION = 1;

export type ProgramTargets = {
  setsMin: number | null;
  setsMax: number | null;
  repsMin: number | null;
  repsMax: number | null;
  weightMin: number | null; // kg
  weightMax: number | null; // kg
  rirMin: number | null;
  rirMax: number | null;
  restSeconds: number | null;
  durationSeconds: number | null;
  tempo: string | null; // "3-1-1-0"
};

export type ProgramExerciseExport = {
  exerciseName: string;
  selectedVariation: string | null;
  supersetLabel: string | null; // "A", "B"… au sein de la séance
  alternatives: string[]; // noms d'exercices
  targets: ProgramTargets;
};

export type ProgramSessionExport = {
  order: number;
  name: string;
  day: string | null;
  color: string; // hex "#RRGGBB"
  exercises: ProgramExerciseExport[];
};

export type ProgramExport = {
  formatVersion: number;
  name: string;
  description: string | null;
  sessions: ProgramSessionExport[];
};
