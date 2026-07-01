// Actions UI export/import : enchaînent façade DB + couche fichiers, et gèrent
// les erreurs via Alert. Appelées directement depuis les écrans.

import { Alert, Platform } from 'react-native';

import type { ExportFile } from './index';
import {
  buildMesocycleFile,
  buildProgramFile,
  importMesocycleFile,
  importProgramFile,
} from './index';
import { pickXlsxBase64, saveExportFile, shareExportFile } from './fileIO';

function reportError(title: string, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  Alert.alert(title, msg);
}

function run(fn: () => Promise<unknown>) {
  fn().catch((e) => reportError('Export impossible', e));
}

// ─── Export ───────────────────────────────────────────────────────────────────
// Android : propose Partager ou Enregistrer dans un dossier.
// iOS : ouvre directement la feuille de partage (qui inclut « Enregistrer dans
// Fichiers »).

async function exportFlow(build: () => Promise<ExportFile>) {
  let file: ExportFile;
  try {
    file = await build();
  } catch (e) {
    reportError('Export impossible', e);
    return;
  }

  if (Platform.OS !== 'android') {
    run(() => shareExportFile(file));
    return;
  }

  Alert.alert('Exporter', file.filename, [
    { text: 'Partager', onPress: () => run(() => shareExportFile(file)) },
    {
      text: 'Enregistrer',
      onPress: () =>
        run(async () => {
          const res = await saveExportFile(file);
          if (res === 'saved') {
            Alert.alert('Enregistré', 'Fichier enregistré dans le dossier choisi.');
          }
        }),
    },
    { text: 'Annuler', style: 'cancel' },
  ]);
}

export const exportMesocycle = (id: string) => exportFlow(() => buildMesocycleFile(id));
export const exportProgram = (id: string) => exportFlow(() => buildProgramFile(id));

// ─── Import (sélection + insertion) ───────────────────────────────────────────
// Retourne l'id créé, ou null si annulé / erreur.

export async function pickAndImportMesocycle(): Promise<string | null> {
  try {
    const b64 = await pickXlsxBase64();
    if (!b64) return null;
    return await importMesocycleFile(b64);
  } catch (e) {
    reportError('Import impossible', e);
    return null;
  }
}

export async function pickAndImportProgram(): Promise<string | null> {
  try {
    const b64 = await pickXlsxBase64();
    if (!b64) return null;
    return await importProgramFile(b64);
  } catch (e) {
    reportError('Import impossible', e);
    return null;
  }
}
