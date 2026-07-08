// Textes partagés par les écrans d'import (explication du format + prompt LLM
// copiable). Générés à partir des colonnes réelles (core/mesoCsv.ts,
// core/programCsv.ts) et de l'exemple pivot (core/sampleData.ts), pour rester
// toujours synchrones avec le format effectivement lu par le parseur.

import { mesoToCsv, MESO_CSV_COLS } from './core/mesoCsv';
import { programToCsv, PROGRAM_CSV_COLS } from './core/programCsv';
import { SAMPLE_MESOCYCLE, SAMPLE_PROGRAM } from './core/sampleData';

function describeColumns(cols: { header: string; required?: boolean }[]): string {
  return cols
    .map((c) => `- ${c.header}${c.required ? ' (obligatoire)' : ' (optionnel)'}`)
    .join('\n');
}

const CONVENTIONS = `
- Tempo : format "excentrique-pauseBasse-concentrique-pauseHaute", ex. "3-1-1-0".
- Repos / Durée : "mm:ss" (ex. "1:30") ou un nombre de secondes (ex. "90").
- Superset : une même lettre (A, B, C…) sur plusieurs exercices d'une même séance les regroupe en superset ; laisser vide si l'exercice est seul.
- Alternatives : plusieurs noms d'exercices séparés par " ; ".
- Les exercices sont retrouvés par leur NOM exact (insensible à la casse et aux espaces). Si un nom est inconnu, un exercice personnalisé minimal est créé automatiquement — soigner l'orthographe pour retrouver les exercices déjà existants.
- Encodage : UTF-8 requis pour les fichiers .csv.
`.trim();

export const MESO_FORMAT_EXPLANATION = `
Format attendu pour un mésocycle (.xlsx ou .csv) : une ligne = une SÉRIE.

Colonnes :
${describeColumns(MESO_CSV_COLS)}

Les séances sont regroupées par (Semaine, Séance) : toutes les lignes d'une même séance, pour une même semaine, doivent se suivre dans le fichier.

${CONVENTIONS}

Le fichier .xlsx (export ou modèle téléchargé) contient en plus un onglet « Méta » et des couleurs par séance — inutiles en .csv, qui ne contient que les données ci-dessus.
`.trim();

export const PROGRAM_FORMAT_EXPLANATION = `
Format attendu pour un programme (.xlsx ou .csv) : une ligne = un EXERCICE (objectifs agrégés, pas de notion de semaine).

Colonnes :
${describeColumns(PROGRAM_CSV_COLS)}

Les séances sont regroupées par leur nom : toutes les lignes d'une même séance doivent se suivre dans le fichier.

${CONVENTIONS}

Le fichier .xlsx (export ou modèle téléchargé) contient en plus un onglet « Méta » et des couleurs par séance — inutiles en .csv, qui ne contient que les données ci-dessus.
`.trim();

function buildPrompt(kind: 'mésocycle' | 'programme', explanation: string, example: string): string {
  return `
Tu vas générer un fichier CSV pour importer un ${kind} de musculation dans une application mobile.

${explanation}

Réponds UNIQUEMENT avec le contenu du CSV (pas de texte autour, pas de bloc de code), en-têtes en première ligne, séparateur virgule, encodage UTF-8.

Exemple minimal valide (à adapter à ma demande ci-dessous) :

${example}

Ma demande :
`.trim();
}

export const MESO_LLM_PROMPT = buildPrompt(
  'mésocycle',
  MESO_FORMAT_EXPLANATION,
  mesoToCsv(SAMPLE_MESOCYCLE)
);

export const PROGRAM_LLM_PROMPT = buildPrompt(
  'programme',
  PROGRAM_FORMAT_EXPLANATION,
  programToCsv(SAMPLE_PROGRAM)
);
