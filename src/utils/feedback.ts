import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { getAppVersion } from './appVersion';

export const FEEDBACK_EMAIL = 'muscu_app.unspoiled785@passinbox.com';

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Bloc court et stable, aucune donnée d'entraînement ni adresse personnelle.
export function buildDiagnostics(): string {
  const versionCode = Constants.expoConfig?.android?.versionCode;
  return [
    `App : ${getAppVersion()}${versionCode ? ` (versionCode ${versionCode})` : ''}`,
    `Plateforme : ${Platform.OS} ${Platform.Version}`,
    `Appareil : ${Constants.deviceName ?? 'inconnu'}`,
    `Date : ${todayStr()}`,
  ].join('\n');
}

function buildMailto(kind: 'bug' | 'suggestion'): string {
  const version = getAppVersion();
  const diagnostics = `--- Diagnostic (ne pas modifier) ---\n${buildDiagnostics()}`;

  const subject =
    kind === 'bug'
      ? `[Carnet muscu] Bug — v${version}`
      : `[Carnet muscu] Suggestion — v${version}`;

  const body =
    kind === 'bug'
      ? `Ce que je faisais :\n\nCe qui s'est passé :\n\nCe qui aurait dû se passer :\n\n${diagnostics}`
      : `Ce que j'aimerais :\n\nPourquoi :\n\n${diagnostics}`;

  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Ouvre le client mail avec un brouillon prérempli. N'utilise volontairement
// pas Linking.canOpenURL('mailto:...') : sur Android 11+ il renvoie false
// tant qu'une balise <queries> n'est pas déclarée dans le manifeste, même
// quand un client mail est installé — ça bloquerait la fonctionnalité pour
// la plupart des appareils. On tente l'ouverture directement.
export async function sendFeedback(kind: 'bug' | 'suggestion'): Promise<boolean> {
  try {
    await Linking.openURL(buildMailto(kind));
    return true;
  } catch {
    return false;
  }
}
