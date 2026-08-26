import { Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { setUpdatePrefs } from '../db/settings';
import { getAppVersion } from './appVersion';
import { ReleaseInfo } from './updateCheck';

// Alerte à 3 boutons (limite Android), partagée entre la vérification
// automatique au lancement et le bouton "Vérifier maintenant" des Paramètres.
export function showUpdateAvailableAlert(latest: ReleaseInfo): void {
  Alert.alert(
    'Mise à jour disponible',
    `Version ${latest.version} disponible (tu es en ${getAppVersion()}).`,
    [
      { text: 'Plus tard', style: 'cancel' },
      {
        text: 'Ignorer cette version',
        onPress: () => setUpdatePrefs({ skippedVersion: latest.version }),
      },
      {
        text: 'Voir la release',
        onPress: () => WebBrowser.openBrowserAsync(latest.htmlUrl),
      },
    ]
  );
}
