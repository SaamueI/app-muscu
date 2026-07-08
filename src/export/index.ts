// Façade export/import : combine la couche DB et la sérialisation XLSX/CSV.
// La couche fichiers (expo-file-system / document-picker / sharing) n'a plus
// qu'à fournir/récupérer du contenu (base64 ou texte) et déclencher le partage.

import { mesoToCsv, parseMesoCsv } from './core/mesoCsv';
import { buildMesoWorkbook, parseMesoWorkbook } from './core/mesoXlsx';
import { programToCsv, parseProgramCsv } from './core/programCsv';
import { buildProgramWorkbook, parseProgramWorkbook } from './core/programXlsx';
import type { ImportResult } from './core/importResult';
import { SAMPLE_MESOCYCLE, SAMPLE_PROGRAM } from './core/sampleData';
import { loadExerciseCatalog } from './db/catalog';
import { importMesocycle, loadMesocycleForExport } from './db/mesoDb';
import { importProgram, loadProgramForExport } from './db/programDb';

export { loadExerciseCatalog };
export type { CreatedExercise, ImportResult } from './core/importResult';

export type ExportFile = { base64: string; filename: string };
export type TextExportFile = { text: string; filename: string };

// Rend un nom de fichier sûr (Android/iOS) à partir du nom de l'objet.
function safeFilename(base: string, prefix: string, ext: string): string {
  const clean = base
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '-') // caractères interdits
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${clean || 'sans-nom'}-${date}.${ext}`;
}

// ─── Mésocycle ────────────────────────────────────────────────────────────────

export async function buildMesocycleFile(mesocycleId: string): Promise<ExportFile> {
  const data = await loadMesocycleForExport(mesocycleId);
  return {
    base64: buildMesoWorkbook(data, 'base64') as string,
    filename: safeFilename(data.name, 'meso', 'xlsx'),
  };
}

// Retourne l'id du mésocycle importé + les exercices personnalisés créés.
export async function importMesocycleFile(base64: string): Promise<ImportResult> {
  const data = parseMesoWorkbook({ type: 'base64', data: base64 });
  return importMesocycle(data);
}

export async function importMesocycleCsv(csvText: string, importName: string): Promise<ImportResult> {
  const data = parseMesoCsv(csvText, importName);
  return importMesocycle(data);
}

export function buildMesoTemplateFile(): ExportFile {
  return {
    base64: buildMesoWorkbook(SAMPLE_MESOCYCLE, 'base64') as string,
    filename: 'modele-mesocycle.xlsx',
  };
}

export function buildMesoTemplateCsv(): TextExportFile {
  return { text: mesoToCsv(SAMPLE_MESOCYCLE), filename: 'modele-mesocycle.csv' };
}

// ─── Programme ────────────────────────────────────────────────────────────────

export async function buildProgramFile(programId: string): Promise<ExportFile> {
  const data = await loadProgramForExport(programId);
  return {
    base64: buildProgramWorkbook(data, 'base64') as string,
    filename: safeFilename(data.name, 'programme', 'xlsx'),
  };
}

export async function importProgramFile(base64: string): Promise<ImportResult> {
  const data = parseProgramWorkbook({ type: 'base64', data: base64 });
  return importProgram(data);
}

export async function importProgramCsv(csvText: string, importName: string): Promise<ImportResult> {
  const data = parseProgramCsv(csvText, importName);
  return importProgram(data);
}

export function buildProgramTemplateFile(): ExportFile {
  return {
    base64: buildProgramWorkbook(SAMPLE_PROGRAM, 'base64') as string,
    filename: 'modele-programme.xlsx',
  };
}

export function buildProgramTemplateCsv(): TextExportFile {
  return { text: programToCsv(SAMPLE_PROGRAM), filename: 'modele-programme.csv' };
}
