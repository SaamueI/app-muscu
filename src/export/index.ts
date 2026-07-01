// Façade export/import : combine la couche DB et la sérialisation XLSX.
// La couche fichiers (expo-file-system / document-picker / sharing) n'a plus
// qu'à fournir/récupérer du base64 et déclencher le partage.

import { buildMesoWorkbook, parseMesoWorkbook } from './core/mesoXlsx';
import { buildProgramWorkbook, parseProgramWorkbook } from './core/programXlsx';
import { importMesocycle, loadMesocycleForExport } from './db/mesoDb';
import { importProgram, loadProgramForExport } from './db/programDb';

export type ExportFile = { base64: string; filename: string };

// Rend un nom de fichier sûr (Android/iOS) à partir du nom de l'objet.
function safeFilename(base: string, prefix: string): string {
  const clean = base
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, '-') // caractères interdits
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${clean || 'sans-nom'}-${date}.xlsx`;
}

// ─── Mésocycle ────────────────────────────────────────────────────────────────

export async function buildMesocycleFile(mesocycleId: string): Promise<ExportFile> {
  const data = await loadMesocycleForExport(mesocycleId);
  return {
    base64: buildMesoWorkbook(data, 'base64') as string,
    filename: safeFilename(data.name, 'meso'),
  };
}

// Retourne l'id du mésocycle importé.
export async function importMesocycleFile(base64: string): Promise<string> {
  const data = parseMesoWorkbook({ type: 'base64', data: base64 });
  return importMesocycle(data);
}

// ─── Programme ────────────────────────────────────────────────────────────────

export async function buildProgramFile(programId: string): Promise<ExportFile> {
  const data = await loadProgramForExport(programId);
  return {
    base64: buildProgramWorkbook(data, 'base64') as string,
    filename: safeFilename(data.name, 'programme'),
  };
}

export async function importProgramFile(base64: string): Promise<string> {
  const data = parseProgramWorkbook({ type: 'base64', data: base64 });
  return importProgram(data);
}
