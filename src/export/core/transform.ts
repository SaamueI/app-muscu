// Transformations pures partagées par les couches DB d'export/import.
// Pas de dépendance DB/Expo → testable sous Node.

// ─── Labels de superset ⇄ supersetGroupId ─────────────────────────────────────
// En DB, les exercices d'un même superset partagent un supersetGroupId (UUID).
// À l'export on le remplace par une étiquette lisible et stable PAR SÉANCE
// ("A", "B"…). À l'import on régénère un UUID frais par étiquette.

// 0 → "A", 25 → "Z", 26 → "AA"… (base 26 façon colonnes de tableur).
function indexToLetters(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

// Convertit une liste de supersetGroupId (ordre des exercices d'une séance) en
// étiquettes. Les exercices solo (groupId null) restent null. Deux exercices au
// même groupId reçoivent la même lettre.
export function groupIdsToLabels(groupIds: (string | null)[]): (string | null)[] {
  const seen = new Map<string, string>();
  return groupIds.map((g) => {
    if (g == null || g === '') return null;
    let label = seen.get(g);
    if (!label) {
      label = indexToLetters(seen.size);
      seen.set(g, label);
    }
    return label;
  });
}

// Inverse : étiquettes → supersetGroupId. Une étiquette → un UUID frais (partagé
// entre exercices de même étiquette dans la séance). null → null.
export function labelsToGroupIds(
  labels: (string | null)[],
  genId: () => string
): (string | null)[] {
  const map = new Map<string, string>();
  return labels.map((l) => {
    if (l == null || l === '') return null;
    let id = map.get(l);
    if (!id) {
      id = genId();
      map.set(l, id);
    }
    return id;
  });
}

// ─── Matching d'exercices par nom ─────────────────────────────────────────────
// Les IDs d'exercices diffèrent d'un appareil à l'autre : on apparie par nom.

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Construit l'index nom normalisé → id. En cas de doublon de nom, le premier
// rencontré gagne (déterministe selon l'ordre fourni).
export function buildNameIndex(rows: { id: string; name: string }[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!idx.has(key)) idx.set(key, r.id);
  }
  return idx;
}
