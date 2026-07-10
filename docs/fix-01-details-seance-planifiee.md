# Fix 01 — Accès aux détails d'une séance planifiée

## Problème

Depuis le calendrier, un événement `workout_session` **planifié** (pas encore commencé) n'offre aucune option pour consulter le contenu de la séance prévue. « Voir les détails » n'apparaît que si un `workout_session` existe déjà ([app/calendrier/[date].tsx:156](../app/calendrier/[date].tsx)).

## Décisions actées

- Ajouter une option « Voir la séance planifiée » dans le menu d'événement, résolue via `refType`/`refId` :
  - `refType = 'meso_session'` → `/mesocycles/{mesocycleId}/sessions/{refId}` (le `mesocycleId` se retrouve via `meso_sessions`)
  - `refType = 'program_session'` → `/programmes/{programId}/sessions/{refId}` (via `program_sessions.programId`) — pour anticiper la planification hors mésocycle
- Libellé distinct de « Voir les détails » (réservé à la séance réalisée) : **« Voir la séance planifiée »**. Les deux options peuvent coexister (ex. séance terminée dont on veut revoir le plan).

## Marche à suivre

### 1. Helper de résolution de route

Nouveau fichier `src/utils/plannedSessionRoute.ts` :

```ts
export async function getPlannedSessionRoute(ev: CalendarEvent): Promise<string | null>
```

- Si `!ev.refId || !ev.refType` → `null`.
- `meso_session` : `SELECT mesocycle_id FROM meso_sessions WHERE id = refId` → `/mesocycles/${mesocycleId}/sessions/${refId}`. Ligne absente (méso supprimé) → `null`.
- `program_session` : `SELECT program_id FROM program_sessions WHERE id = refId` → `/programmes/${programId}/sessions/${refId}`. Absente → `null`.

### 2. Vue jour — `app/calendrier/[date].tsx`

Dans le menu d'actions (`openMenu === ev.id`), ajouter une entrée quand `ev.type === 'workout_session' && ev.refId` :

- `onPress` : `const route = await getPlannedSessionRoute(ev)` ; si `null` → `Alert.alert('Séance introuvable', 'La séance planifiée liée à cet événement n\'existe plus.')` ; sinon `router.push(route)`.
- Résolution à la volée au tap (pas besoin de précharger dans `load()`).

### 3. Vue mensuelle — `app/(tabs)/calendrier.tsx`

Même entrée dans le menu des événements « Sans jour fixe » (bloc `openMenu === ev.id`, ~ligne 232). Même logique.

## Points d'attention

- `calendarEvents.refId` est **sans FK** (par design) : la cible peut avoir été supprimée → toujours gérer le cas `null`.
- Les events pré-migration 0011 peuvent avoir `refId` sans `refType` : dans ce cas, tenter `program_session` (comportement par défaut historique, cf. `startWorkoutSession`) ou masquer l'option — au choix de l'implémentation, mais rester cohérent avec `startWorkoutSession` (fallback program_session).
- L'écran `mesocycles/[id]/sessions/[mesoSessionId].tsx` attend bien ces deux params de route (vérifié).

## Vérification

- `npx tsc --noEmit`
- Sur device : méso ancré → calendrier → jour avec séance planifiée → menu → « Voir la séance planifiée » → écran méso session correct. Supprimer le méso → l'option affiche l'alerte d'introuvable (pas de crash).
