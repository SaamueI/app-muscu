# Carnet de musculation — muscu-app

Application mobile React Native / Expo de suivi d'entraînement.

---

## Stack

| Outil | Version |
|---|---|
| Expo SDK | ~54.0.0 |
| React Native | 0.81.5 |
| expo-router | ~6.0.24 |
| expo-sqlite | ~16.0.10 |
| drizzle-orm | ^0.45.2 |
| drizzle-kit | ^0.31.10 |

**Lancer l'app** : `npx expo start --clear` (le `--clear` est nécessaire après toute nouvelle migration).

---

## Structure des fichiers

```
app/
  (tabs)/              # 5 onglets : exercices, programmes, calendrier, progression, mesocycle
  exercices/           # CRUD exercices
  programmes/          # CRUD programmes → sessions → exercices
  calendrier/          # Vue mensuelle + création/édition d'événements
  mesocycles/          # CRUD mésocycles → semaines → séances → exercices → séries
  seance/
    [sessionId].tsx    # Séance live : liste À faire / Faits, toggle isDone
    exercice/
      [logId].tsx      # Écran exercice : objectifs, timer, sets, historique
    presets-repos.tsx  # CRUD rest_presets (modal)

src/
  db/
    index.ts           # Ouverture DB + PRAGMA foreign_keys = ON
    schema.ts          # Tables Drizzle (source de vérité)
    meso.ts            # Helpers mésocycle (copy, duplicate, memory…)
    session.ts         # Helpers séance live (start, saveSetLog, finishSession…)
    migrations/
      meta/_journal.json   # Journal Drizzle — timestamps DOIVENT être croissants
      migrations.js        # Import de toutes les migrations m0000–m0010
      0000_…sql … 0010_…sql
  components/
    ExercisePicker.tsx
    TimerDisplay.tsx        # Composant timer (chrono / compte à rebours)
    RestPresetPicker.tsx    # Chips preset temps de repos
    SetPerformanceModal.tsx # Modal saisie performance (poids, reps, RIR…)
    DatePickerField.tsx     # Bouton → picker natif OS (date) ; props: value: Date|null, onChange
    WeekPickerField.tsx     # Calendrier inline react-native-calendars, sélection à la semaine ; props: value: string (ISO "YYYY-Www"), onChange
  utils/
    generateId.ts
    altPickerStore.ts      # Store module-level pour passer un exo entre écrans
    mesoDeletePref.ts      # Flag "ne plus demander" suppression de séance
    activeSessionStore.ts  # Store éphémère timer en cours de séance
    weightUtils.ts         # kgToLb, lbToKg, formatWeight
  export/                  # Phase 8 — export/import XLSX (voir section dédiée)
    core/                  # Sérialisation XLSX pure (testable sous Node)
      mesoXlsx.ts / programXlsx.ts    # build*/parse* d'un classeur
      style.ts             # Styles xlsx-js-style + helpers mm:ss
      transform.ts         # Labels superset ⇄ UUID, matching exos par nom
      mesoTypes.ts / programTypes.ts  # Formats pivot
    db/                    # Pont Drizzle ⇄ pivot (mesoDb.ts, programDb.ts)
    index.ts               # Façade build*File / import*File
    fileIO.ts              # expo-file-system / document-picker / sharing / SAF
    actions.ts             # Flux UI (Alert) : export* / pickAndImport*

scripts/
  testMesoExport.ts / testProgramExport.ts / testTransform.ts  # Tests Node (tsx)

docs/
  phase-NN-*.md          # Docs d'implémentation des phases restantes (marche à suivre)
```

---

## Base de données

### Règle critique — migrations manuelles

`drizzle-kit generate` est **cassé** sur ce projet (les snapshots meta sont gelés à 0003). **Ne jamais l'utiliser.** Toutes les migrations doivent être écrites à la main :

1. Créer `src/db/migrations/00NN_description.sql`
2. Ajouter l'import dans `src/db/migrations/migrations.js`
3. Ajouter une entrée dans `meta/_journal.json` avec un `when` **strictement supérieur** au précédent

Drizzle n'applique une migration que si `migration.folderMillis > lastApplied.created_at`. Un `when` trop petit = migration silencieusement ignorée.

**Prochain `when` disponible** : > `1782700001000` (dernière migration : 0011).

### Schéma (résumé)

```
exercises              — catalogue (custom + dataset) ; weightUnit = 'kg'|'lb'|null
programs               — programmes d'entraînement
  └─ program_sessions  — séances d'un programme (template)
       └─ program_exercises — objectifs agrégés ; supersetGroupId

calendar_events        — événements (workout_session / rest / competition / other)
  └─ workout_sessions  — séance réalisée ; mesoSessionId nullable
       └─ exercise_logs — isDone, supersetGroupId, mesoExerciseId
            └─ set_logs — setNumber, side ('L'|'R'|null), executionSeconds

mesocycles             — plan d'entraînement sur N semaines
  └─ meso_sessions     — séance planifiée (week_index, order, title, color, day)
       └─ meso_exercises — supersetGroupId
            └─ meso_sets   — objectifs PAR SÉRIE (reps, poids, RIR, repos, durée, tempo)

target_memory          — cache des derniers objectifs par program_session_id
rest_presets           — chips temps de repos prédéfinis (60/90/120/150/180/240 s)
user_settings          — singleton ; weightUnit = 'kg'|'lb'
```

**Points importants :**
- `programExercises.tempo` et `mesoSets.tempo` → `text` au format `"3-1-1-0"` (excentrique-pauseBasse-concentrique-pauseHaute)
- `PRAGMA foreign_keys = ON` activé dans `src/db/index.ts` (nécessaire pour les CASCADE)
- Unités : stockées en kg dans la DB, affichées converties selon `exercises.weightUnit` (ou fallback `user_settings.weightUnit`)
- Supersets : `supersetGroupId` UUID partagé entre les exercices du même superset (sur `program_exercises`, `meso_exercises`, `exercise_logs`)
- Unilatéral : deux `set_logs` par set logique, `side = 'L'` et `'R'`, même `setNumber`
- `calendarEvents.refId` (sans FK, par design) pointe soit vers un `program_session`, soit vers un `meso_session` ; `refType` (`'program_session'|'meso_session'`, migration 0011) désambiguïse — voir section Ancrage calendaire

### Migrations appliquées

| # | Tag | Contenu |
|---|---|---|
| 0000 | magenta_rocket_raccoon | Tables initiales |
| 0001 | fearless_outlaw_kid | Champs exercices supplémentaires |
| 0002 | loose_jetstream | Variations / images custom |
| 0003 | parallel_skrulls | SetLog + ExerciseLog |
| 0004 | rebuild_program_exercises | Rebuild program_exercises (écrit à la main) |
| 0005 | calendar_event_fields | title + description sur calendar_events |
| 0006 | mesocycle_layer | Tables mesocycles, meso_sessions, meso_exercises, meso_sets |
| 0007 | target_memory | Table target_memory |
| 0008 | tempo_text | Rebuild meso_sets : tempo integer → text |
| 0009 | program_exercises_tempo_text | Rebuild program_exercises : tempo integer → text |
| 0010 | workout_session_live | Colonnes séance live, tables rest_presets + user_settings, supersets, unités |
| 0011 | meso_calendar_anchor | `calendar_events.ref_type` (+ backfill des lignes existantes) |

---

## Timer séance live (activeSessionStore)

Machine d'états : `idle → execution → rest → (modal) → idle`.

Le store (`src/utils/activeSessionStore.ts`) est module-level (pas de Context). Champs clés :
- `timerPhase` : `'idle' | 'execution' | 'rest'`
- `timerStartedAt` : `Date.now()` au démarrage de la phase
- `timerTargetSeconds` : `null` = chrono, `n` = compte à rebours
- `timerMode` : `'auto'` (démarrage auto au 0) | `'manual'` (continue en négatif)
- `isUnilateral`, `currentSide` (`'L'|'R'|null`), `currentSetNumber`

`useKeepAwake()` activé sur l'écran session.

---

## Export / import XLSX (phase 8)

Export et import de **mésocycles** et **programmes** en `.xlsx` stylisé (`xlsx-js-style`). Deux formats **distincts et non mélangeables** : l'onglet *Méta* porte `type` = `mesocycle` | `programme`, lu à l'import pour router / refuser un mauvais fichier.

**Couches** (`src/export/`) :
- `core/` — **pur**, testable sous Node (`npm run test:export:meso` / `test:export:program`). Round-trip sans perte vérifié.
- `db/` — `loadXForExport` (DB → pivot) et `importX` (pivot → DB : **régénère tous les IDs**, crée un exo custom minimal si le nom est absent, reconstruit les `supersetGroupId` depuis des étiquettes A/B).
- `fileIO.ts` / `actions.ts` — **nouvelle** API `expo-file-system` (SDK 54 : `import { File, Paths } from 'expo-file-system'`), `expo-sharing`, et `StorageAccessFramework` (`expo-file-system/legacy`) pour « Enregistrer dans un dossier » sur Android.

**Format de fichier** : onglet *Méta* (clé/valeur + légende) + onglet de données. Mésocycle = 1 ligne / série ; programme = 1 ligne / exercice (objectifs agrégés). En-têtes colorés **obligatoire (ambre) / optionnel (ardoise)**, lignes teintées par couleur de séance. **Import lu par nom d'en-tête** (robuste au style) ; colonnes techniques `_ordreSeance` / `_ordreExo` / `_couleur` masquées. Clé de regroupement méso = `(semaine, ordre)` car `order` est réinitialisé par semaine.

**UI** : bouton « Exporter (Excel) » sur les écrans détail méso/programme ; bouton « Importer » (`headerLeft`) sur les onglets Mésocycle et Programmes.

**Limite connue** : import non transactionnel (validation faite au parse, avant tout écrit).

**Deps ajoutées** : `xlsx-js-style`, `expo-file-system`, `expo-document-picker`, `expo-sharing` ; dev : `tsx`.

---

## Ancrage calendaire des mésocycles (phase 9)

Ancrer un mésocycle = choisir sa date de départ (`mesocycles.startDate`, lundi ISO de la semaine sélectionnée via `WeekPickerField`, écran `mesocycles/[id]/ancrer.tsx`). Ça génère des `calendar_events` pour chaque `meso_session` — **jamais** de `workout_sessions` à l'avance (celles-ci restent créées *lazily* par `startWorkoutSession()` quand l'utilisateur commence réellement une séance).

**Fonctions clés** (`src/db/meso.ts`) :
- `syncMesoCalendarEvents(mesocycleId)` — upsert idempotent par `(refType='meso_session', refId=mesoSessionId)`. N'écrase `title`/`date`/`week` que si l'event existant est `status='planned'` : un event déjà `completed`/`skipped` est un enregistrement historique figé (sinon une séance réalisée avant un ré-ancrage se retrouverait déplacée à la nouvelle date en gardant son statut « Terminé »). Branchée automatiquement en fin de `addWeek`/`duplicateWeek`/`deleteWeek`/`copyProgramSessionToMeso`/`addBlankMesoSession` et après modification d'une séance (day/title), donc toujours à jour sans action manuelle — à condition que `mesocycle.startDate` soit renseigné (no-op sinon).
- `detachCalendarEventForMesoSession(mesoSessionId)` — supprime le calendar_event si jamais commencé (orphelin), ou le décorrèle (`refId`/`refType` → `null`, event conservé comme historique autonome) s'il a un `workout_session` lié. Indispensable : `syncMesoCalendarEvents` retrouve un event via `(refType, refId)`, donc un lien laissé intact bloquerait indéfiniment tout futur (ré)ancrage de cette séance.
- `detachMesoSessionHistory(mesoSessionId)` — met à `null` `workoutSessions.mesoSessionId` et `exerciseLogs.mesoExerciseId` (FK sans cascade) pour permettre de supprimer une meso_session déjà exécutée sans violer de contrainte.
- `deleteMesoSessionCascade` / `deleteMesocycleCascade` — enchaînent les deux détachements ci-dessus avant de supprimer (utilisées partout où on supprime une séance/semaine/mésocycle, à la place d'un `db.delete` direct).
- `anchorMesocycle` / `unanchorMesocycle` — le désancrage détache complètement l'historique (mêmes fonctions que ci-dessus), pas seulement les events orphelins.
- `duplicateMesocycle` — copie indépendante (nouveaux IDs), `startDate: null`, jamais ancrée automatiquement.

**Suppression depuis le calendrier** (`src/db/session.ts` → `deleteCalendarEventCascade`) : supprime aussi le `workout_session` lié (cascade vers `exercise_logs`/`set_logs` via les FK du schéma), sinon la contrainte FK sur `workoutSessions.calendarEventId` bloque la suppression d'un event déjà réalisé.

**Piège FK récurrent** : `workoutSessions.calendarEventId`/`mesoSessionId` et `exerciseLogs.mesoExerciseId` référencent leur parent **sans** `onDelete` (`ON DELETE NO ACTION`). Toute suppression côté template (meso_session, mesocycle) ou côté calendrier doit détacher/gérer ces FK explicitement — ne jamais faire de `db.delete` direct sur `mesoSessions`/`mesocycles`/`calendarEvents` s'il peut exister un historique lié.

---

## Détails de séance (phase 10)

Écran `app/seance/details/[sessionId].tsx` (consultation) + `app/seance/details/[sessionId]/modifier.tsx` (édition), accessibles depuis le calendrier (item « Voir les détails ») et depuis un mésocycle ancré (badge de statut par séance, `src/utils/eventStatus.ts` — extrait du calendrier pour être partagé).

**Helpers ajoutés à `src/db/session.ts`** :
- `renumberSetsAfterDelete(exerciseLogId, deletedSetNumber)` — après suppression d'une série, décale d'un cran les `setNumber` suivants pour combler le trou.
- `swapSetNumbers(exerciseLogId, setNumberA, setNumberB)` — échange les `set_logs` de deux numéros de série (déplace G+D ensemble pour l'unilatéral), utilisé par les flèches ▲▼ de réordonnancement dans l'écran d'édition.

**Édition d'une série unilatérale** : contrairement à l'écran séance live (`seance/exercice/[logId].tsx`, où seul le côté G est éditable), l'écran d'édition de la phase 10 permet de modifier **chaque côté indépendamment**, ou les deux à la fois avec une performance identique (option « Modifier les deux côtés »).

**Piège Android** : `Alert.alert` n'affiche que **3 boutons max** sur Android (au-delà, les derniers sont silencieusement supprimés — c'est ce qui faisait disparaître « Annuler »). Toujours découper en alertes imbriquées de ≤3 boutons plutôt que d'empiler les options dans une seule alerte.

---

## Patterns récurrents

### Rafraîchissement au focus
```ts
useFocusEffect(useCallback(() => { load(); }, [load]));
```

### Passage de données entre écrans
Stores module-level (pas de Context) : `altPickerStore.ts`, `mesoDeletePref.ts`.

### Navigation
expo-router v3 avec routes dynamiques imbriquées. Les modals (`ajouter`, `ajouter-exercice`) sont enregistrés dans `app/_layout.tsx` avec `presentation: 'modal'`.

### Helpers mm:ss (meso_sets)
```ts
secondsToMMSS(n)      // 90 → "1:30"
mmssToSeconds(str)    // "1:30" ou "90" → 90, "" → null
```

### Validation formulaires
- **Tempo** (`mesoExerciseId`): regex `/^\d+-\d+-\d+-\d+$/` avant sauvegarde
- **Min ≤ Max** : vérification sur reps, poids, RIR avant sauvegarde (Alert.alert si erreur)

---

## Phases réalisées

| Phase | Contenu | Statut |
|---|---|---|
| 1 | Catalogue exercices (CRUD, images, variations) | ✅ |
| 2 | Programmes + séances + objectifs template + historique perf | ✅ |
| 3 | Calendrier mensuel + événements datés/semaine | ✅ |
| 4 | Création d'événements avec date picker | ✅ |
| 5 | Mésocycles (CRUD complet, semaines, objectifs par série, mémoire) | ✅ |
| 6 | Séance live (timer, log sets, supersets, unités kg/lb, unilatéral) | ✅ |
| 8 | Export / import XLSX des mésocycles et programmes | ✅ |
| 9 | Ancrage calendaire des mésocycles | ✅ |
| 10 | Détails de séance : écran détail + mode édition des séries (ajout/suppression/réorganisation) + accès depuis calendrier + états/accès depuis méso ancré | ✅ |

## Phases restantes

Chaque phase 11+ a un document d'implémentation détaillé dans `docs/` — **le lire en entier avant de commencer la phase**.

| Phase | Contenu | Doc |
|---|---|---|
| 7 | Onglet Progression (graphiques, records) | — |
| 11 | Séance live : préremplissage par dernières perfs, chrono de repos visible partout, interruption de séance + bandeau de reprise global | `docs/phase-11-seance-live-ameliorations.md` |
| 12 | Import : écrans dédiés, explication format + prompt LLM copiable, import CSV, templates téléchargeables | `docs/phase-12-import-dedie.md` |
| 13 | Chrono en arrière-plan : notification Android chronometer (⚠️ requiert dev build, sortie d'Expo Go) | `docs/phase-13-chrono-arriere-plan.md` |

Ordre recommandé : 11 → 12 → 13 (13 en dernier car elle change le workflow de build). La phase 7 est indépendante.

---

## GitHub

Dépôt privé : https://github.com/SaamueI/app-muscu

```bash
git add -A && git commit -m "..." && git push
```
