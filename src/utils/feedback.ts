import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getAppVersion } from './appVersion';

// EmailJS, mode "API non-navigateur" (activé dans le compte, Account > Security).
// Identifiants lus depuis .env (EXPO_PUBLIC_* est inliné dans le bundle au
// build, cf. .env.example) plutôt qu'en dur dans le code : ça les garde hors
// de l'historique git d'un dépôt public. Public Key : safe à exposer, c'est
// son rôle. Private Key (accessToken) : au niveau du compte entier (pas
// juste ce template) — si extraite de l'app compilée (APK décompilable),
// elle permettrait d'envoyer via n'importe quel service EmailJS connecté à
// ce compte, dans la limite du quota gratuit. Risque assumé, borné par le
// quota — l'app.json/EXPO_PUBLIC_* ne protège pas contre la décompilation,
// seulement contre la lecture directe du dépôt source.
const EMAILJS_SERVICE_ID = process.env.EXPO_PUBLIC_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = process.env.EXPO_PUBLIC_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = process.env.EXPO_PUBLIC_EMAILJS_PUBLIC_KEY;
const EMAILJS_PRIVATE_KEY = process.env.EXPO_PUBLIC_EMAILJS_PRIVATE_KEY;
const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';
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

// Envoie le message tapé dans l'app via EmailJS (relais HTTPS -> e-mail,
// sans exposer de vraies identifiants de boîte mail dans le code public).
// Ne lève jamais : erreur réseau ou réponse non-2xx -> false.
export async function sendFeedback(kind: 'bug' | 'suggestion', message: string): Promise<boolean> {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY || !EMAILJS_PRIVATE_KEY) {
    console.error('[feedback] Identifiants EmailJS manquants — voir .env.example');
    return false;
  }

  const version = getAppVersion();
  const subject =
    kind === 'bug'
      ? `[Carnet muscu] Bug — v${version}`
      : `[Carnet muscu] Suggestion — v${version}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(EMAILJS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
          subject,
          content: `${message.trim()}\n\n--- Diagnostic (ne pas modifier) ---\n${buildDiagnostics()}`,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[feedback] EmailJS a refusé la soumission', { httpStatus: res.status, body: text });
      return false;
    }
    return true;
  } catch (e) {
    console.error('[feedback] Échec réseau vers EmailJS', e);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
