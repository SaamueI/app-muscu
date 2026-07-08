// Suggestion d'exercices existants ressemblant à un exercice nouvellement créé
// à l'import (réconciliation, phase 12 — solution 2). PUR (pas de dépendance
// DB/Expo) → testable sous Node (scripts/testExerciseMatch.ts).
//
// Contexte : le catalogue de base est en ANGLAIS (dataset free-exercise-db),
// mais l'utilisateur saisit souvent en FRANÇAIS. Une distance de chaînes seule
// ne relierait pas « Développé couché » à « Bench Press » → on traduit d'abord
// les mots FR→EN via un lexique, puis on compare par recouvrement de tokens.
// Les suggestions ne sont que des propositions : l'utilisateur confirme toujours.

// ─── Normalisation « lâche » (accents supprimés) ──────────────────────────────
// Distincte de normalizeName (transform.ts), qui régit le round-trip exact et
// ne doit pas changer. Ici on va plus loin : on retire les accents et la
// ponctuation pour maximiser les rapprochements.
export function normalizeLoose(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // ponctuation → espace
    .trim()
    .replace(/\s+/g, ' ');
}

// ─── Traduction FR→EN ─────────────────────────────────────────────────────────
// Idiomes traités sur la chaîne entière AVANT le découpage en mots (le mot-à-mot
// donnerait un mauvais résultat). Clés et valeurs en forme normalizeLoose.
const FR_EN_PHRASES: Record<string, string> = {
  'souleve de terre': 'deadlift',
  'souleve de terre roumain': 'romanian deadlift',
  'souleve de terre jambes tendues': 'stiff leg deadlift',
  'barre au front': 'skull crusher',
  'presse a cuisses': 'leg press',
  'presse a jambes': 'leg press',
  'extension mollets': 'calf raise',
  'oiseau': 'reverse fly',
  'tirage vertical': 'lat pulldown',
  'tirage horizontal': 'seated cable row',
  'tirage poitrine': 'lat pulldown',
  'tirage menton': 'upright row',
  'tirage visage': 'face pull',
  'tirage nuque': 'behind neck pulldown',
  'rowing barre': 'bent over barbell row',
  'developpe couche': 'bench press',
  'developpe militaire': 'overhead press',
  'developpe nuque': 'behind neck press',
  'elevations laterales': 'lateral raise',
  'elevations frontales': 'front raise',
  'good morning': 'good morning',
  'face pull': 'face pull',
};

// Mot FR → un ou plusieurs mots EN. Un token sans entrée est conservé tel quel
// (donc un custom déjà en anglais / mal orthographié reste matchable directement).
const FR_EN_LEXICON: Record<string, string[]> = {
  // Mouvements
  developpe: ['press'],
  developpes: ['press'],
  couche: ['bench', 'flat'],
  couchee: ['bench', 'flat'],
  incline: ['incline'],
  inclinee: ['incline'],
  decline: ['decline'],
  declinee: ['decline'],
  militaire: ['overhead'],
  souleve: ['deadlift'],
  traction: ['pull', 'up'],
  tractions: ['pull', 'up'],
  tirage: ['row', 'pulldown'],
  rowing: ['row'],
  squat: ['squat'],
  squats: ['squat'],
  fente: ['lunge'],
  fentes: ['lunge'],
  presse: ['press'],
  curl: ['curl'],
  curls: ['curl'],
  extension: ['extension'],
  extensions: ['extension'],
  ecarte: ['fly'],
  ecartes: ['fly'],
  elevation: ['raise'],
  elevations: ['raise'],
  laterale: ['lateral'],
  laterales: ['lateral'],
  frontale: ['front'],
  frontales: ['front'],
  visage: ['face'],
  menton: ['chin'],
  nuque: ['neck'],
  crunch: ['crunch'],
  crunchs: ['crunch'],
  releve: ['raise'],
  releves: ['raise'],
  dips: ['dip'],
  shrug: ['shrug'],
  hanche: ['hip'],
  hanches: ['hip'],
  pont: ['bridge'],
  // Équipement / prise
  barre: ['barbell'],
  halteres: ['dumbbell'],
  haltere: ['dumbbell'],
  poulie: ['cable'],
  poulies: ['cable'],
  machine: ['machine'],
  cable: ['cable'],
  cables: ['cable'],
  kettlebell: ['kettlebell'],
  smith: ['smith'],
  prise: ['grip'],
  serree: ['close'],
  serre: ['close'],
  large: ['wide'],
  neutre: ['neutral'],
  supination: ['supinated'],
  pronation: ['pronated'],
  // Muscles / zones
  pectoraux: ['chest'],
  pecs: ['chest'],
  poitrine: ['chest'],
  dos: ['back'],
  epaules: ['shoulder'],
  epaule: ['shoulder'],
  deltoides: ['deltoid'],
  deltoide: ['deltoid'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  avant: ['fore'],
  bras: ['arm'],
  jambe: ['leg'],
  jambes: ['leg'],
  jambees: ['leg'],
  cuisse: ['thigh', 'quad'],
  cuisses: ['thigh', 'quad'],
  quadriceps: ['quad'],
  ischios: ['hamstring'],
  ischio: ['hamstring'],
  fessiers: ['glute'],
  fessier: ['glute'],
  mollet: ['calf'],
  mollets: ['calf'],
  abdominaux: ['abs', 'crunch'],
  abdos: ['abs', 'crunch'],
  abdominal: ['abs'],
  lombaires: ['lower', 'back'],
  trapezes: ['trap'],
  trapeze: ['trap'],
  // Divers modificateurs
  assis: ['seated'],
  assise: ['seated'],
  debout: ['standing'],
  allonge: ['lying'],
  allongee: ['lying'],
  incliner: ['incline'],
  unilateral: ['single', 'one', 'arm'],
  unilaterale: ['single', 'one', 'arm'],
  concentration: ['concentration'],
  marteau: ['hammer'],
  bulgare: ['bulgarian'],
  roumain: ['romanian'],
  nordique: ['nordic'],
  buste: ['bent', 'over'],
  penche: ['bent', 'over'],
};

// Mots trop génériques pour peser dans le score (mots-outils FR et EN).
const STOPWORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'a',
  'au',
  'aux',
  'en',
  'et',
  'avec',
  'sur',
  'the',
  'of',
  'with',
  'to',
]);

// Nom → ensemble de tokens EN (après traduction). Applique d'abord les phrases
// idiomatiques, puis traduit mot à mot le reste.
export function tokensFor(name: string): Set<string> {
  let s = normalizeLoose(name);

  // Remplacement des phrases idiomatiques (les plus longues d'abord pour éviter
  // qu'une sous-chaîne courte ne masque une plus longue).
  const phrases = Object.keys(FR_EN_PHRASES).sort((a, b) => b.length - a.length);
  for (const fr of phrases) {
    if (s === fr || s.includes(fr)) {
      s = s.replace(fr, ` ${FR_EN_PHRASES[fr]} `);
    }
  }
  s = s.trim().replace(/\s+/g, ' ');

  const out = new Set<string>();
  for (const raw of s.split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const mapped = FR_EN_LEXICON[raw];
    if (mapped) {
      for (const m of mapped) out.add(m);
    } else {
      out.add(raw);
    }
  }
  return out;
}

// ─── Distance de chaînes (fautes de frappe même langue) ───────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Ratio de similarité [0,1] : 1 = identique.
function levRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

// Recouvrement de tokens (Jaccard) : |∩| / |∪|. L'union pénalise les
// rapprochements qui ne partagent qu'un mot générique.
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ─── API publique ─────────────────────────────────────────────────────────────

export type CatalogEntry = { id: string; name: string };
export type MatchSuggestion = { id: string; name: string; score: number };

export type SuggestOptions = {
  limit?: number;
  threshold?: number;
};

// Suggère les exercices du catalogue ressemblant le plus à `name`.
// Score = max(Jaccard des tokens traduits, ratio Levenshtein des chaînes
// normalisées) → un match par traduction OU par orthographe proche suffit.
export function suggestMatches(
  name: string,
  catalog: CatalogEntry[],
  { limit = 5, threshold = 0.34 }: SuggestOptions = {}
): MatchSuggestion[] {
  const qTokens = tokensFor(name);
  const qNorm = normalizeLoose(name);

  const scored: MatchSuggestion[] = [];
  for (const entry of catalog) {
    const cTokens = tokensFor(entry.name);
    const tokenScore = jaccard(qTokens, cTokens);
    const strScore = levRatio(qNorm, normalizeLoose(entry.name));
    const score = Math.max(tokenScore, strScore);
    if (score >= threshold) scored.push({ id: entry.id, name: entry.name, score });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}
