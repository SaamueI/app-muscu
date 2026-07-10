# Fix 04 — Cohérence calendrier × date d'encodage de la séance

## Problème

Une séance planifiée le jour A mais encodée le jour B reste attachée au jour A dans le calendrier (`calendar_events.date = A`) alors que `workout_sessions.date = B` (toujours `today` dans `startWorkoutSession`). Les deux vues se contredisent.

## Décisions actées

Au démarrage d'une séance dont l'événement a une date ≠ aujourd'hui, alerte à 3 choix (exactement la limite Android) :

1. **Annuler** — ne rien faire.
2. **Encoder aujourd'hui** — l'événement calendrier est **déplacé** au jour actuel (`UPDATE calendar_events SET date = today`) ; la séance est datée d'aujourd'hui. Le calendrier reflète la réalité, plus rien au jour A.
3. **Encoder au {date planifiée}** — l'événement ne bouge pas ; la séance est créée avec `workout_sessions.date = event.date`.

Le contrôle s'applique aux trois points d'entrée qui démarrent depuis un événement. Les événements « à la semaine » (`date` null, `week` renseignée) ne déclenchent pas l'alerte.

## Marche à suivre

### 1. `startWorkoutSession` (`src/db/session.ts`)

Ajouter un paramètre optionnel `date?: string` à `StartParams` ; l'utiliser pour `workoutSessions.date` (défaut : `today` inchangé). Ne rien changer d'autre (la branche « event ad hoc » crée toujours l'event à `today`).

### 2. Flux partagé — nouveau `src/utils/startSessionFlow.ts`

```ts
export function startPlannedSession(ev: CalendarEvent, onStarted: (sessionId: string) => void): void
```

- `today = new Date().toISOString().slice(0, 10)`.
- `!ev.date || ev.date === today` → `startWorkoutSession({ calendarEventId: ev.id })` direct.
- Sinon `Alert.alert('Séance planifiée le {date formatée}', 'Cette séance n\'est pas prévue aujourd\'hui.', [...])` avec les 3 boutons ci-dessus :
  - « Encoder aujourd'hui » : `UPDATE calendar_events SET date = today WHERE id = ev.id`, puis `startWorkoutSession({ calendarEventId: ev.id })` (date par défaut = today) ;
  - « Encoder au {ev.date} » : `startWorkoutSession({ calendarEventId: ev.id, date: ev.date })`.
- Dans les deux cas → `onStarted(sessionId)` (les appelants font `router.push('/seance/${sessionId}')`).

### 3. Points d'entrée à brancher

| Fichier | Endroit |
|---|---|
| `app/calendrier/[date].tsx` | `handleStart` (~l.64) — seulement le chemin « nouvelle séance » ; le chemin « Poursuivre » (`getExistingSession`) reste direct |
| `app/(tabs)/calendrier.tsx` | `handleStart` (~l.118) — idem |
| `app/mesocycles/[id]/sessions/[mesoSessionId].tsx` | `handleStart` (~l.110) — uniquement la branche `event` ; la branche sans event (méso non ancré) reste directe |

## Points d'attention

- **3 boutons max sur Android** : on est pile à 3 — ne rien ajouter à cette alerte.
- Garder « Poursuivre la séance » hors du flux : on ne repose pas la question pour une séance déjà commencée.
- Déplacer l'événement d'un méso ancré : `syncMesoCalendarEvents` (re-ancrage, `src/db/meso.ts`) peut recalculer la date depuis `startDate + weekIndex + day` et écraser le déplacement si l'utilisateur ré-ancre le méso ensuite. Limite acceptée ; ne pas tenter de la contourner dans ce fix.
- Démarrage anticipé (event dans le futur) : même alerte, mêmes 3 choix — le libellé « Encoder au {date} » couvre aussi ce cas.
- Format de date du bouton 3 : réutiliser un format court lisible (ex. « mer. 8 juil. ») plutôt que l'ISO brut.

## Vérification

- `npx tsc --noEmit`
- Sur device :
  1. Méso ancré, séance planifiée hier → « Commencer » aujourd'hui → alerte ; choix 2 : l'événement apparaît à aujourd'hui dans le calendrier (plus rien hier) et les détails de séance affichent aujourd'hui ; choix 3 : l'événement reste hier et les détails affichent hier.
  2. Séance planifiée aujourd'hui → pas d'alerte.
  3. « Poursuivre » une séance en cours → pas d'alerte.
