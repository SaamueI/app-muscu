// Couche fichiers (device) : écriture dans le cache, partage, et sélection.
// Nouvelle API expo-file-system SDK 54 (classes File / Paths).

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { ExportFile } from './index';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

// Ouvre le sélecteur de fichier et renvoie le contenu en base64, ou null si
// l'utilisateur annule. `copyToCacheDirectory` garantit une URI file:// lisible.
export async function pickXlsxBase64(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*', // beaucoup de gestionnaires Android ne taguent pas le xlsx
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;
  return new File(asset.uri).base64();
}
