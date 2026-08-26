import Constants from 'expo-constants';

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

// Compare deux versions "semver-ish" : tolère le préfixe 'v', les segments
// manquants (1.1 vs 1.1.0) et les suffixes non numériques (ignorés).
// Retourne -1 si a < b, 0 si égales, 1 si a > b.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}
