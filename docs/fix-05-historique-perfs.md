# Fix 05 — Historique des performances d'un exercice

## Problème

Deux sections « Performances » vides alors que des `exercise_logs` existent :

1. **`app/exercices/[id].tsx`** — la section est un placeholder statique jamais branché sur la DB.
2. **`app/programmes/[id]/sessions/[sessionId]/exercises/[programExerciseId].tsx`** — la requête filtre sur `exerciseLogs.programExerciseId` (~l.108). Or les séances démarrées **via un mésocycle** créent des logs avec `mesoExerciseId` seulement (`programExerciseId` reste null, cf. `startWorkoutSession`). Résultat : historique vide dès qu'on s'entraîne via méso.

## Décisions actées

- **Portée : toutes les perfs de l'exercice**, quelle qu'en soit l'origine (programme, méso, séance libre) — dans les deux écrans.
- Réutiliser `getPreviousPerfs(exerciseId, limit)` (`src/db/session.ts`), qui fait déjà exactement ça : N dernières séances **terminées** contenant l'exercice, sets groupés par séance, triés par `setNumber`.
- Limite : 5 séances (cohérent avec l'écran live). Pas de pagination dans ce fix.
- Poids affichés convertis via `formatWeight` avec `exercises.weightUnit ?? user_settings.weightUnit` (règle générale de l'app : stockage kg, affichage converti).

## Marche à suivre

### 1. `app/exercices/[id].tsx`

- Charger en plus de l'exercice : `getPreviousPerfs(id, 5)` et `getUserWeightUnit()` (imports depuis `src/db/session`).
- Passer le chargement sous `useFocusEffect` (actuellement `useEffect` simple) pour rafraîchir au retour d'une séance.
- Remplacer le placeholder : pour chaque `PerfGroup`, afficher la date (`sessionDate`) puis chaque set :
  - `Série {setNumber}{side === 'L' ? ' (G)' : side === 'R' ? ' (D)' : ''} · {formatWeight(weight, unit)} × {reps} · RIR {rir}` — champs null omis, `pdc` → « PDC », `durationSeconds` → `{n}s`.
- Aucune perf → conserver le texte placeholder actuel.

### 2. Écran exercice de programme (`.../exercises/[programExerciseId].tsx`)

- Supprimer la requête locale `exerciseLogs × workoutSessions × setLogs` filtrée par `programExerciseId` et le regroupement manuel (~l.102-121).
- Remplacer par `getPreviousPerfs(row.exercise.id, 5)` et adapter le rendu existant au type `PerfGroup` (mêmes infos : date + sets).
- Adapter le texte vide : « Aucune performance enregistrée pour cet exercice. » (plus « dans ce programme »).
- Affichage des poids : appliquer la même conversion `formatWeight` (l'écran affiche aujourd'hui des kg bruts).
- Gérer l'unilatéral comme au §1 (le rendu actuel ignorait `side`).

## Points d'attention

- `getPreviousPerfs` ne compte que les séances **terminées** (`finishedAt` non null) — c'est voulu : une séance en cours a sa propre vue.
- Le paramètre `excludeSessionId` ne sert que sur l'écran live ; ne pas le passer ici.
- Ne pas toucher à l'écran exercice de **mésocycle** (`mesocycles/.../exercises/[mesoExerciseId].tsx`) dans ce fix ; si une section perfs y manque aussi, même recette applicable plus tard.

## Vérification

- `npx tsc --noEmit`
- Sur device : après une séance méso terminée contenant l'exercice X :
  1. `exercices/X` → la section Performances liste la séance (poids convertis si exercice en lb).
  2. Écran programme → exercice X → la même séance apparaît (alors qu'avant : vide).
  3. Exercice jamais travaillé → placeholders inchangés.
