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

**Ne jamais utiliser la preview navigateur (`expo start --web`) pour tester** : l'app dépend de fonctionnalités natives (expo-sqlite, expo-keep-awake, Alert, PanResponder…) qui ne se comportent pas fidèlement sur web. Toute vérification doit se faire sur device/émulateur via Expo Go — se limiter au typecheck (`npx tsc --noEmit`) et à la relecture de code quand aucun device n'est disponible, et le dire explicitement plutôt que de prétendre avoir testé.

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
    GlobalRestBanner.tsx    # Bandeau repos en cours (phase 11) ; prop excludeLogId
    ActiveSessionBanner.tsx # Bandeau reprise séance globale (phase 11), déplaçable
    ImportScreen.tsx        # Écran d'import générique réutilisé par méso/programme (phase 12)
  utils/
    generateId.ts
    altPickerStore.ts      # Store module-level pour passer un exo entre écrans
    mesoDeletePref.ts      # Flag "ne plus demander" suppression de séance
    activeSessionStore.ts  # Store éphémère timer en cours de séance
    useSessionTimer.ts     # Hook useActiveSessionTick (tick 1s pour les bandeaux, phase 11)
    weightUtils.ts         # kgToLb, lbToKg, formatWeight
    eventStatus.ts         # Labels/couleurs statut event + getEffectiveStatus (déduit "en cours")
  export/                  # Phases 8 + 12 — export/import XLSX + CSV (voir sections dédiées)
    core/                  # Sérialisation pure (testable sous Node)
      mesoXlsx.ts / programXlsx.ts    # build*/parse* d'un classeur XLSX
      mesoCsv.ts / programCsv.ts      # to*Csv/parse*Csv (phase 12)
      csv.ts                # rowsToCsv/readCsvSheet génériques (phase 12)
      sampleData.ts         # Pivot d'exemple (templates + prompt LLM, phase 12)
      style.ts             # Styles xlsx-js-style + helpers mm:ss + SESSION_COLORS
      transform.ts         # Labels superset ⇄ UUID, matching exos par nom, parseAlternatives
      mesoTypes.ts / programTypes.ts  # Formats pivot
    db/                    # Pont Drizzle ⇄ pivot (mesoDb.ts, programDb.ts)
    index.ts               # Façade build*File / import*File / build*Template* (phase 12)
    fileIO.ts              # expo-file-system / document-picker / sharing / SAF (xlsx + texte)
    actions.ts             # Flux UI (Alert) : export* / pickAndImport* / download*Template*
    formatDoc.ts            # Explication format + prompt LLM copiable (phase 12)

scripts/
  testMesoExport.ts / testProgramExport.ts / testTransform.ts / testCsvImport.ts  # Tests Node (tsx)

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

## Séance live : améliorations (phase 11)

Trois axes (doc source `docs/phase-11-seance-live-ameliorations.md`), plus deux ajustements suite aux retours de test sur device.

**Préremplissage du modal** (`SetPerformanceModal` depuis `[logId].tsx`) : priorité à la série précédente de **la séance en cours** (`getPrefillFromCurrentSession`), puis à la même série (sinon la dernière) de la dernière séance **terminée** (`getPrefillFromHistory` / `getPreviousPerfs(exerciseId, limit, excludeSessionId)` — exclut la séance en cours et filtre `finishedAt` non nul), puis fallback objectifs (comportement historique inchangé).

**Chrono de repos visible partout** : `GlobalRestBanner` (prop `excludeLogId`) monté sur l'écran séance et sur l'écran exercice ; store enrichi de `restForExerciseName`. Le chrono continue de tourner après « Terminer l'exercice ✓ » (plus de reset forcé à `idle`). Bandeau rouge si le temps est négatif (mode manuel).

**Piège corrigé dans `[logId].tsx`** : `load()` réclamait auparavant `activeExerciseLogId` pour cet écran dès son ouverture, même sans avoir démarré de série — ce qui écrasait le timer d'un autre exercice réellement actif. Résolu par un état local (`localNextSetNumber`/`localIsUnilateral`/`localCurrentSide`) utilisé tant que l'écran n'est pas l'exercice actif (`isActive`) ; le store global n'est réclamé qu'au moment de `handleCommencer`/`handleSelectPreset`. Les fonctions d'objectifs (`getTargetRestSeconds`, `getCurrentMesoSet`, `getPrefillFromHistory`…) prennent le `setNumber`/`side` en paramètre explicite plutôt que de lire le store — ne pas revenir à un `getActiveSession()` implicite dans ces helpers.

**Interruption de séance + bandeau de reprise** : bouton retour + `Alert` Clôturer/Interrompre/Annuler sur `[sessionId].tsx`. `ActiveSessionBanner` monté globalement (`app/_layout.tsx`, frère du `Stack`) : pilule flottante **déplaçable** (`PanResponder`, seuil de 3px pour distinguer tap et drag, position bornée à l'écran au relâchement) et semi-transparente (`rgba`), masquable (croix → `bannerDismissed`, remis à `false` au démarrage d'une nouvelle séance). `finishSession` appelle `resetActiveSession()` si c'est la séance active.

**État « en cours » du calendrier** (déduit, PAS persisté — `calendar_events.status` reste `planned|completed|skipped`) : `getEffectiveStatus(status, hasActiveSession)` dans `eventStatus.ts` affiche « En cours » (orange `#FF9500`) quand un `workout_session` non terminé existe pour un event `planned`. Appliqué sur les deux vues calendrier (`calendrier/[date].tsx`, `(tabs)/calendrier.tsx`) et le badge de statut méso ancré (`mesocycles/[id].tsx`). Le libellé du bouton (« Commencer »/« Poursuivre ») se base sur l'existence réelle d'une séance, pas sur le statut DB seul. `calendrier/[date].tsx` propose aussi « Terminer la séance » dans le menu d'une séance en cours.

**Bug de duplication corrigé** : le bouton de démarrage sur `mesocycles/[id]/sessions/[mesoSessionId].tsx` créait un nouveau `calendar_event` à chaque appui au lieu de réutiliser celui déjà synchronisé par l'ancrage (`syncMesoCalendarEvents`) → séances « en cours » fantômes qui s'accumulaient à chaque appui/ré-ancrage. Corrigé : réutilise l'event ancré s'il existe (résolution `mesoSessionId` déjà gérée par `startWorkoutSession({calendarEventId})`). Le bouton devient « Poursuivre cette séance » (orange) + « Terminer cette séance » (rouge) une fois une séance en cours détectée pour cette meso_session. En complément, `detachCalendarEventForMesoSession` (désancrage, `src/db/meso.ts`) supprime désormais les séances démarrées-mais-jamais-pratiquées (aucun `set_log`, via `hasLoggedSets`) au lieu de les préserver comme historique fantôme — l'historique réel (au moins une série loggée, ou séance terminée) reste conservé comme avant.

---

## Import : écrans dédiés, CSV, prompt LLM, templates (phase 12)

Le bouton « Importer » a quitté les headers d'onglets : il vit désormais dans les écrans de création (`programmes/nouveau.tsx`, `mesocycles/nouveau.tsx`, lien « Importer depuis un fichier ») et pointe vers deux écrans dédiés `app/programmes/import.tsx` / `app/mesocycles/import.tsx`, tous deux de simples wrappers autour du composant partagé `src/components/ImportScreen.tsx`.

**Format CSV ajouté en plus du XLSX** (`src/export/core/mesoCsv.ts` / `programCsv.ts`, `mesoToCsv`/`parseMesoCsv`, `programToCsv`/`parseProgramCsv`) :
- Contrairement au XLSX, le CSV n'a qu'une seule feuille : pas d'onglet *Méta*, pas de colonnes techniques `_ordreSeance`/`_ordreExo`/`_couleur`. Le `type` (méso vs programme) est imposé par l'écran d'où vient l'import, pas par le fichier ; le **nom** de l'objet créé = nom du fichier sans extension (passé en paramètre `importName` aux `parse*Csv`).
- L'ordre des séances/exercices est déduit de **blocs contigus de lignes** partageant la même clé (semaine+séance+jour pour le méso, séance+jour pour le programme) — donc toutes les lignes d'une même séance doivent se suivre dans le fichier. La couleur de séance (absente du CSV) est auto-assignée depuis `SESSION_COLORS` (`core/style.ts`), stable par nom de séance.
- Réutilise les validations existantes du XLSX plutôt que de les dupliquer : `rowToSet`/`validateSet` (exportés de `mesoXlsx.ts`) et `rowToTargets`/`validateTargets` (exportés de `programXlsx.ts`).
- Lecture via `core/csv.ts` (`readCsvSheet` = `XLSX.read(text, {type:'string'})`, auto-détection du séparateur `,`/`;`/tab ; UTF-8 requis, non détecté/converti si le fichier est en latin-1).

**Templates téléchargeables** (méso/programme × XLSX/CSV) générés à la volée depuis un pivot d'exemple pur (`core/sampleData.ts`, `SAMPLE_MESOCYCLE`/`SAMPLE_PROGRAM`) — jamais de fichier statique embarqué, donc toujours synchrones avec le format. `index.ts` : `buildMesoTemplateFile`/`buildMesoTemplateCsv`/`buildProgramTemplateFile`/`buildProgramTemplateCsv`.

**Prompt LLM copiable** (`src/export/formatDoc.ts`) : `MESO_FORMAT_EXPLANATION`/`PROGRAM_FORMAT_EXPLANATION` et `MESO_LLM_PROMPT`/`PROGRAM_LLM_PROMPT` sont générés dynamiquement à partir des colonnes réelles (`MESO_CSV_COLS`/`PROGRAM_CSV_COLS`) et de l'exemple CSV du pivot d'exemple (`mesoToCsv(SAMPLE_MESOCYCLE)`) — jamais de texte inventé à la main, donc jamais désynchronisé du parseur. Le prompt cible une sortie **CSV** (un LLM ne peut pas produire un vrai `.xlsx` en chat).

**fileIO.ts** : `pickImportFile()` (remplace `pickXlsxBase64`) détecte `.xlsx` vs `.csv` par extension du nom de fichier et renvoie `{kind, base64|text, baseName}`. Ajout de `shareTextFile`/`saveTextFile`, symétriques de `shareExportFile`/`saveExportFile` pour du texte brut (CSV, encodage UTF-8 par défaut de `File.write`/`writeAsStringAsync`, pas de base64).

**actions.ts** : `pickAndImportMesocycle`/`pickAndImportProgram` branchent sur `kind` (`csv` → `importMesocycleCsv`/`importProgramCsv`, `xlsx` → chemin existant). Logique Partager/Enregistrer factorisée dans `shareOrSaveFlow`, réutilisée par l'export existant et les 4 actions `download*Template*`.

**Limite connue inchangée** : import toujours non transactionnel (validation au parse, avant tout écrit en DB) — le CSV réutilise le même chemin pivot → DB (`importMesocycle`/`importProgram`) que le XLSX.

**Tests** : `npm run test:import:csv` (`scripts/testCsvImport.ts`) — round-trip pivot→CSV→parse (méso+programme), auto-cohérence des 4 templates (round-trip exact pour XLSX, ré-import sans erreur pour CSV), rejets (CSV vide, en-têtes obligatoires manquantes).

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
| 11 | Séance live : préremplissage par dernières perfs, chrono de repos visible partout, interruption de séance + bandeau de reprise déplaçable, état "en cours" du calendrier | ✅ |
| 12 | Import : écrans dédiés, explication format + prompt LLM copiable, import CSV, templates téléchargeables | ✅ |

## Phases restantes

Chaque phase 13+ a un document d'implémentation détaillé dans `docs/` — **le lire en entier avant de commencer la phase**.

| Phase | Contenu | Doc |
|---|---|---|
| 7 | Onglet Progression (graphiques, records) | — |
| 13 | Chrono en arrière-plan : notification Android chronometer (⚠️ requiert dev build, sortie d'Expo Go) | `docs/phase-13-chrono-arriere-plan.md` |

La phase 13 change le workflow de build (sortie d'Expo Go) ; la phase 7 est indépendante.

---

## GitHub

Dépôt privé : https://github.com/SaamueI/app-muscu

```bash
git add -A && git commit -m "..." && git push
```
