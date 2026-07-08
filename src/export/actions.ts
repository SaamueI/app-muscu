// Actions UI export/import : enchaînent façade DB + couche fichiers, et gèrent
// les erreurs via Alert. Appelées directement depuis les écrans.

import { Alert, Platform } from 'react-native';

import type { ExportFile, TextExportFile } from './index';
import {
  buildMesoTemplateCsv,
  buildMesoTemplateFile,
  buildMesocycleFile,
  buildProgramTemplateCsv,
  buildProgramTemplateFile,
  buildProgramFile,
  importMesocycleCsv,
  importMesocycleFile,
  importProgramCsv,
  importProgramFile,
} from './index';
import {
  pickImportFile,
  saveExportFile,
  saveTextFile,
  shareExportFile,
  shareTextFile,
} from './fileIO';

function reportError(title: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  Alert.alert(title, msg);
}

function run(fn: () => Promise<unknown>) {
  fn().catch((e) => reportError('Export impossible', e));
}

// ─── Export / téléchargement de modèle ────────────────────────────────────────
// Android : propose Partager ou Enregistrer dans un dossier.
// iOS : ouvre directement la feuille de partage (qui inclut « Enregistrer dans
// Fichiers »).

function shareOrSaveFlow(
  share: () => Promise<void>,
  save: () => Promise<'saved' | 'shared' | 'canceled'>,
  filename: string
) {
  if (Platform.OS !== 'android') {
    run(share);
    return;
  }
  Alert.alert('Exporter', filename, [
    { text: 'Partager', onPress: () => run(share) },
    {
      text: 'Enregistrer',
      onPress: () =>
        run(async () => {
          const res = await save();
          if (res === 'saved') {
            Alert.alert('Enregistré', 'Fichier enregistré dans le dossier choisi.');
          }
        }),
    },
    { text: 'Annuler', style: 'cancel' },
  ]);
}

async function exportFlow(build: () => Promise<ExportFile>) {
  let file: ExportFile;
  try {
    file = await build();
  } catch (e) {
    reportError('Export impossible', e);
    return;
  }
  shareOrSaveFlow(() => shareExportFile(file), () => saveExportFile(file), file.filename);
}

function templateFlow(file: ExportFile) {
  shareOrSaveFlow(() => shareExportFile(file), () => saveExportFile(file), file.filename);
}

function templateTextFlow(file: TextExportFile) {
  shareOrSaveFlow(() => shareTextFile(file), () => saveTextFile(file), file.filename);
}

export const exportMesocycle = (id: string) => exportFlow(() => buildMesocycleFile(id));
export const exportProgram = (id: string) => exportFlow(() => buildProgramFile(id));

export const downloadMesoTemplateXlsx = () => templateFlow(buildMesoTemplateFile());
export const downloadMesoTemplateCsv = () => templateTextFlow(buildMesoTemplateCsv());
export const downloadProgramTemplateXlsx = () => templateFlow(buildProgramTemplateFile());
export const downloadProgramTemplateCsv = () => templateTextFlow(buildProgramTemplateCsv());

// ─── Import (sélection + insertion) ───────────────────────────────────────────
// Retourne l'id créé, ou null si annulé / erreur. Accepte .xlsx (export ou
// modèle) et .csv (généré par un LLM, un tableur, ou le modèle téléchargé).

export async function pickAndImportMesocycle(): Promise<string | null> {
  try {
    const picked = await pickImportFile();
    if (!picked) return null;
    if (picked.kind === 'csv') return await importMesocycleCsv(picked.text, picked.baseName);
    return await importMesocycleFile(picked.base64);
  } catch (e) {
    reportError('Import impossible', e);
    return null;
  }
}

export async function pickAndImportProgram(): Promise<string | null> {
  try {
    const picked = await pickImportFile();
    if (!picked) return null;
    if (picked.kind === 'csv') return await importProgramCsv(picked.text, picked.baseName);
    return await importProgramFile(picked.base64);
  } catch (e) {
    reportError('Import impossible', e);
    return null;
  }
}
