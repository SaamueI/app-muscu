// Catalogue des noms d'exercices présents dans la DB de l'utilisateur, pour
// alimenter le prompt LLM (formatDoc.buildMesoLlmPrompt / buildProgramLlmPrompt).
// But : inciter le LLM/l'utilisateur à réutiliser un nom existant plutôt que
// d'en créer un nouveau (qui produirait un exercice personnalisé en double).

import { db } from '../../db/index';
import { exercises } from '../../db/schema';
import { normalizeName } from '../core/transform';

// Liste dédupliquée (par nom normalisé) et triée alphabétiquement des noms
// d'exercices — custom ET dataset, car les deux sont des cibles valides.
export async function loadExerciseCatalog(): Promise<string[]> {
  const rows = await db.select({ name: exercises.name }).from(exercises);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(r.name.trim());
  }
  names.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  return names;
}
