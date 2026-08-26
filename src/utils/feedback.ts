import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getAppVersion } from './appVersion';

// Clé publique Web3Forms (pas un secret : elle ne fait que router vers la
// boîte mail configurée sur web3forms.com, avec un quota côté serveur).
const WEB3FORMS_ACCESS_KEY = '3c93845f-ebac-4745-b80a-35b55463dc04';
const WEB3FORMS_URL = 'https://api.web3forms.com/submit';
const TIMEOUT_MS = 8000;

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

// Envoie le message tapé dans l'app via Web3Forms (relais HTTPS -> e-mail,
// sans exposer de vraies identifiants de boîte mail dans le code public).
// Ne lève jamais : erreur réseau ou réponse non-2xx -> false.
export async function sendFeedback(kind: 'bug' | 'suggestion', message: string): Promise<boolean> {
  const version = getAppVersion();
  const subject =
    kind === 'bug'
      ? `[Carnet muscu] Bug — v${version}`
      : `[Carnet muscu] Suggestion — v${version}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(WEB3FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject,
        from_name: 'Carnet muscu (app)',
        message: `${message.trim()}\n\n--- Diagnostic (ne pas modifier) ---\n${buildDiagnostics()}`,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
