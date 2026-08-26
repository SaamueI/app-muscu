import { compareVersions, getAppVersion } from './appVersion';

export type ReleaseInfo = {
  version: string; // tag_name sans le 'v'
  tagName: string;
  htmlUrl: string;
  name: string | null;
  publishedAt: string | null;
};

export type UpdateStatus =
  | { status: 'up-to-date' }
  | { status: 'update-available'; latest: ReleaseInfo }
  | { status: 'unreachable' };

const RELEASES_URL = 'https://api.github.com/repos/SaamueI/app-muscu/releases/latest';
const TIMEOUT_MS = 8000;

// Ping unique sur l'API publique des releases GitHub. Ne lève jamais : toute
// erreur réseau, tout statut non-2xx (dont 404 = "aucune release publiée")
// remonte comme 'unreachable'.
export async function checkForUpdate(): Promise<UpdateStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!res.ok) return { status: 'unreachable' };

    const data = await res.json();
    const tagName: string | undefined = data.tag_name;
    if (!tagName) return { status: 'unreachable' };

    const latest: ReleaseInfo = {
      version: tagName.replace(/^v/i, ''),
      tagName,
      htmlUrl: data.html_url,
      name: data.name ?? null,
      publishedAt: data.published_at ?? null,
    };

    const current = getAppVersion();
    if (compareVersions(current, latest.version) < 0) {
      return { status: 'update-available', latest };
    }
    return { status: 'up-to-date' };
  } catch {
    return { status: 'unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
