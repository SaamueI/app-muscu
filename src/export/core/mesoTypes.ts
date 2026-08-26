// Représentation « plate » d'un mésocycle, indépendante de la DB et d'Expo.
// C'est le format pivot : la couche DB produit/consomme ces objets, le builder
// XLSX les sérialise. Aucune dépendance native ici → testable sous Node.

export const MESO_FORMAT_VERSION = 1;

export type MesoSetTarget = {
  setNumber: number;
  repsMin: number | null;
  repsMax: number | null;
  weightMin: number | null; // kg (unité de stockage DB)
  weightMax: number | null; // kg
  rirMin: number | null;
  rirMax: number | null;
  restSeconds: number | null;
  durationSeconds: number | null;
  tempo: string | null; // "3-1-1-0"
};

export type MesoExerciseExport = {
  exerciseName: string;
  selectedVariation: string | null;
  // Étiquette courte de superset au sein de la séance ("A", "B"…), null si solo.
  // Le mapping étiquette ⇄ supersetGroupId (UUID) est fait côté DB.
  supersetLabel: string | null;
  alternatives: string[]; // noms d'exercices
  note: string | null; // note propre à l'exercice tel que planifié (amélioration 06)
  sets: MesoSetTarget[];
};

export type MesoSessionExport = {
  weekIndex: number;
  order: number;
  title: string | null;
  day: string | null;
  color: string; // hex "#RRGGBB"
  note: string | null;
  exercises: MesoExerciseExport[];
};

export type MesocycleExport = {
  formatVersion: number;
  name: string;
  numWeeks: number;
  startDate: string | null;
  notes: string | null;
  sessions: MesoSessionExport[];
};
