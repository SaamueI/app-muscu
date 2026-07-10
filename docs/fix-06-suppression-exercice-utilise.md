# Fix 06 — Suppression d'un exercice utilisé (crash FK)

## Problème

Supprimer un exercice référencé par un programme/méso/séance crashe : `program_exercises.exercise_id`, `meso_exercises.exercise_id` et `exercise_logs.exercise_id` référencent `exercises.id` **sans onDelete** → la contrainte FK bloque le `db.delete` direct de [app/exercices/[id].tsx:46](../app/exercices/[id].tsx). S'y ajoutent les mentions dans les tableaux JSON `alternativeExerciseIds` (sans FK, mais à nettoyer).

Rappel : seuls les exercices `isCustom` sont supprimables (le bouton n'apparaît que pour eux) — garde-fou à conserver.

## Décisions actées

**Choix guidé** : l'alerte de suppression détecte les usages, affiche un récap chiffré et propose :

1. **Annuler**
2. **Remplacer par…** — choisir un exercice cible (picker), toutes les références sont réassignées via `remapExercise` (phase 12), aucune donnée perdue.
3. **Tout supprimer** — cascade complète après une **seconde** confirmation destructive avec récap.

(3 boutons max par alerte sur Android → le récap + choix tient en une alerte, la confirmation destructive est une alerte imbriquée.)

Variantes lors d'un remplacement : `selectedVariation` est du texte libre et les écrans tolèrent une variante absente de la liste de l'exercice (chip « personnalisée ») → on **conserve** les `selectedVariation` telles quelles, pas de traitement spécial.

## Marche à suivre

### 1. Helpers DB — étendre `src/db/exerciseMerge.ts`

**`getExerciseUsage(exerciseId)`** → `{ programExerciseCount, mesoExerciseCount, logCount, altCount }` :

- `COUNT` sur `program_exercises`, `meso_exercises`, `exercise_logs` filtrés par `exercise_id`.
- `altCount` : scan des `alternativeExerciseIds` (JSON) de `program_exercises` + `meso_exercises` contenant l'id (même approche que `remapExercise`).

**`deleteExerciseCascade(exerciseId)`** (garde-fou `isCustom`, comme `remapExercise`) :

1. `DELETE FROM exercise_logs WHERE exercise_id = ?` → cascade auto vers `set_logs`.
2. `DELETE FROM meso_exercises WHERE exercise_id = ?` → cascade auto vers `meso_sets`.
3. `DELETE FROM program_exercises WHERE exercise_id = ?`.
4. Nettoyer les mentions dans `alternativeExerciseIds` des deux tables template (retrait de l'id ; tableau vide → `null`) — factoriser avec `replaceInAlt` existant (le généraliser en retrait, ou ajouter `removeFromAlt`).
5. `DELETE FROM exercises WHERE id = ? AND is_custom = 1`.

Note : un `exercise_log` supprimé fait disparaître l'exercice des séances passées (les autres exos de la séance restent) — c'est le prix assumé de « Tout supprimer », le warning doit le dire.

### 2. UI — `app/exercices/[id].tsx`, refonte de `handleDelete`

1. `const usage = await getExerciseUsage(id)`.
2. **Aucun usage FK** (`programExerciseCount + mesoExerciseCount + logCount === 0`) : confirmation simple actuelle, mais passer par `deleteExerciseCascade` quand même (nettoie les éventuelles mentions alternatives, `altCount > 0` possible sans FK).
3. **Usages présents** : `Alert.alert('Exercice utilisé', récap, [...])` — récap du type :
   « Utilisé dans X programme(s), Y mésocycle(s) et Z séance(s) enregistrée(s)· (+ W mention(s) comme alternative). »
   Boutons : `[Annuler (cancel), Remplacer par…, Tout supprimer…]`.
4. **Remplacer par…** : ouvrir un `Modal` avec `ExercisePicker` (même pattern que l'ajout d'exercice en séance live, `app/seance/[sessionId].tsx` ~l.228) ; exclure l'exercice lui-même de la sélection (au minimum, ignorer si `target.id === id`). À la sélection → alerte de confirmation « Remplacer {A} par {B} partout ? » → `await remapExercise(id, target.id)` → `router.back()`.
5. **Tout supprimer…** : seconde alerte destructive « Suppression définitive » reprenant les chiffres (« Z séance(s) enregistrée(s) perdront cet exercice et ses séries ») → `[Retour (cancel), Supprimer (destructive)]` → `await deleteExerciseCascade(id)` → `router.back()`.

## Points d'attention

- **Ordre des suppressions** : toujours les tables référençantes avant `exercises` (FK sans cascade).
- `remapExercise` exige `isCustom` sur la source et gère déjà : les 3 tables FK, les alternatives (avec dédoublonnage), la suppression du custom orphelin. Ne pas dupliquer cette logique.
- Import non transactionnel ailleurs dans l'app ; ici, garder chaque helper séquentiel simple (pattern existant). Si `expo-sqlite` le permet facilement via `db.transaction`, bonus, sinon assumer comme le reste du code.
- Après remplacement, les `set_logs` historiques comptent désormais pour l'exercice cible (visible dans fix-05) — cohérent avec la sémantique « c'était un doublon / le même mouvement ».

## Vérification

- `npx tsc --noEmit`
- Sur device, avec un exercice custom utilisé dans 1 programme + 1 méso + 1 séance terminée :
  1. Supprimer → récap correct (compte exact).
  2. « Remplacer par… » → picker → cible : le programme/méso/l'historique pointent vers la cible, le custom a disparu, pas de crash.
  3. « Tout supprimer » → double confirmation → l'exercice et toutes ses mentions disparaissent ; la séance passée s'ouvre sans crash (exercice absent, autres exos intacts).
  4. Exercice custom inutilisé → suppression simple toujours fonctionnelle.
