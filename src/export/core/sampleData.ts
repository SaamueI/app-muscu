// Pivot d'exemple (méso + programme) utilisé pour générer les templates
// téléchargeables (XLSX + CSV) et l'exemple embarqué dans le prompt LLM.
// Fichier pur : toute modification ici se répercute automatiquement partout
// (templates + prompt), donc reste toujours synchrone avec le format réel.

import { MESO_FORMAT_VERSION, type MesocycleExport } from './mesoTypes';
import { PROGRAM_FORMAT_VERSION, type ProgramExport } from './programTypes';

export const SAMPLE_MESOCYCLE: MesocycleExport = {
  formatVersion: MESO_FORMAT_VERSION,
  name: 'Exemple — Bloc hypertrophie',
  numWeeks: 1,
  startDate: null,
  notes: null,
  sessions: [
    {
      weekIndex: 1,
      order: 0,
      title: 'Push',
      day: 'Monday',
      color: '#007AFF',
      note: null,
      exercises: [
        {
          exerciseName: 'Développé couché',
          selectedVariation: 'Barre',
          supersetLabel: 'A',
          alternatives: ['Développé haltères'],
          sets: [
            { setNumber: 1, repsMin: 6, repsMax: 8, weightMin: 60, weightMax: 70, rirMin: 1, rirMax: 2, restSeconds: 120, durationSeconds: null, tempo: '3-1-1-0' },
            { setNumber: 2, repsMin: 6, repsMax: 8, weightMin: 60, weightMax: 70, rirMin: 1, rirMax: 2, restSeconds: 120, durationSeconds: null, tempo: '3-1-1-0' },
          ],
        },
        {
          exerciseName: 'Écarté poulie',
          selectedVariation: null,
          supersetLabel: 'A',
          alternatives: [],
          sets: [
            { setNumber: 1, repsMin: 12, repsMax: 15, weightMin: 10, weightMax: 12, rirMin: 1, rirMax: 2, restSeconds: 60, durationSeconds: null, tempo: null },
          ],
        },
        {
          exerciseName: 'Développé militaire unilatéral',
          selectedVariation: null,
          supersetLabel: null,
          alternatives: [],
          sets: [
            { setNumber: 1, repsMin: 10, repsMax: 12, weightMin: 12, weightMax: 14, rirMin: 2, rirMax: 3, restSeconds: 90, durationSeconds: null, tempo: null },
          ],
        },
      ],
    },
    {
      weekIndex: 1,
      order: 1,
      title: 'Pull',
      day: 'Thursday',
      color: '#34C759',
      note: 'Focus dos',
      exercises: [
        {
          exerciseName: 'Tirage horizontal',
          selectedVariation: null,
          supersetLabel: null,
          alternatives: [],
          sets: [
            { setNumber: 1, repsMin: 8, repsMax: 10, weightMin: 50, weightMax: 55, rirMin: 1, rirMax: 2, restSeconds: 90, durationSeconds: null, tempo: null },
          ],
        },
      ],
    },
  ],
};

export const SAMPLE_PROGRAM: ProgramExport = {
  formatVersion: PROGRAM_FORMAT_VERSION,
  name: 'Exemple — Push Pull',
  description: null,
  sessions: [
    {
      order: 0,
      name: 'Push',
      day: 'Monday',
      color: '#007AFF',
      exercises: [
        {
          exerciseName: 'Développé couché',
          selectedVariation: 'Barre',
          supersetLabel: 'A',
          alternatives: ['Développé haltères'],
          targets: { setsMin: 3, setsMax: 4, repsMin: 6, repsMax: 8, weightMin: 60, weightMax: 70, rirMin: 1, rirMax: 2, restSeconds: 120, durationSeconds: null, tempo: '3-1-1-0' },
        },
        {
          exerciseName: 'Écarté poulie',
          selectedVariation: null,
          supersetLabel: 'A',
          alternatives: [],
          targets: { setsMin: 3, setsMax: 3, repsMin: 12, repsMax: 15, weightMin: 10, weightMax: 12, rirMin: 1, rirMax: 2, restSeconds: 60, durationSeconds: null, tempo: null },
        },
      ],
    },
    {
      order: 1,
      name: 'Pull',
      day: 'Thursday',
      color: '#34C759',
      exercises: [
        {
          exerciseName: 'Tirage horizontal',
          selectedVariation: null,
          supersetLabel: null,
          alternatives: [],
          targets: { setsMin: 3, setsMax: 4, repsMin: 8, repsMax: 10, weightMin: 50, weightMax: 55, rirMin: 1, rirMax: 2, restSeconds: 90, durationSeconds: null, tempo: null },
        },
      ],
    },
  ],
};
