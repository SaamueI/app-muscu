// Couche fichiers (device) : écriture dans le cache, partage, et sélection.
// Nouvelle API expo-file-system SDK 54 (classes File / Paths).

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { ExportFile, TextExportFile } from './index';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

// Écrit le fichier dans le cache puis ouvre la feuille de partage de l'OS.
export async function shareExportFile(file: ExportFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  const target = new File(Paths.cache, file.filename);
  if (target.exists) target.delete();
  target.create();
  target.write(file.base64, { encoding: 'base64' });

  await Sharing.shareAsync(target.uri, {
    mimeType: XLSX_MIME,
    dialogTitle: 'Exporter',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}

// Variante texte (CSV) de shareExportFile.
export async function shareTextFile(file: TextExportFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  const target = new File(Paths.cache, file.filename);
  if (target.exists) target.delete();
  target.create();
  target.write(file.text);

  await Sharing.shareAsync(target.uri, {
    mimeType: CSV_MIME,
    dialogTitle: 'Exporter',
    UTI: 'public.comma-separated-values-text',
  });
}

// Enregistre le fichier à un emplacement choisi par l'utilisateur.
// Android : Storage Access Framework (choix d'un dossier, ex. Téléchargements).
// iOS : pas de dossier « Téléchargements » exposé → on passe par la feuille de
// partage (option « Enregistrer dans Fichiers »).
// Retourne 'saved', 'shared', ou 'canceled'.
export async function saveExportFile(
  file: ExportFile
): Promise<'saved' | 'shared' | 'canceled'> {
  if (Platform.OS !== 'android') {
    await shareExportFile(file);
    return 'shared';
  }
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return 'canceled';

  // createFileAsync attend le nom SANS extension (ajoutée d'après le mimeType).
  const nameNoExt = file.filename.replace(/\.xlsx$/i, '');
  const uri = await StorageAccessFramework.createFileAsync(
    perm.directoryUri,
    nameNoExt,
    XLSX_MIME
  );
  await StorageAccessFramework.writeAsStringAsync(uri, file.base64, {
    encoding: 'base64',
  });
  return 'saved';
}

// Variante texte (CSV) de saveExportFile.
export async function saveTextFile(
  file: TextExportFile
): Promise<'saved' | 'shared' | 'canceled'> {
  if (Platform.OS !== 'android') {
    await shareTextFile(file);
    return 'shared';
  }
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return 'canceled';

  const nameNoExt = file.filename.replace(/\.csv$/i, '');
  const uri = await StorageAccessFramework.createFileAsync(
    perm.directoryUri,
    nameNoExt,
    CSV_MIME
  );
  await StorageAccessFramework.writeAsStringAsync(uri, file.text);
  return 'saved';
}

export type PickedImportFile =
  | { kind: 'xlsx'; base64: string; baseName: string }
  | { kind: 'csv'; text: string; baseName: string };

// Ouvre le sélecteur de fichier et renvoie le contenu (base64 pour un .xlsx,
// texte UTF-8 pour un .csv), ou null si l'utilisateur annule.
// `copyToCacheDirectory` garantit une URI file:// lisible. Le type est détecté
// par extension (beaucoup de gestionnaires Android ne taguent pas le mime).
export async function pickImportFile(): Promise<PickedImportFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;

  const name = asset.name ?? '';
  // .txt traité comme .csv : un LLM ou un partage renomme parfois le fichier
  // texte généré en .txt, le contenu (en-têtes + lignes séparées par virgule)
  // reste identique.
  const baseName = name.replace(/\.(xlsx|csv|txt)$/i, '').trim() || 'Import';
  const file = new File(asset.uri);

  if (/\.(csv|txt)$/i.test(name)) {
    return { kind: 'csv', text: await file.text(), baseName };
  }
  return { kind: 'xlsx', base64: await file.base64(), baseName };
}
