# Carnet de musculation — muscu-app

Application mobile React Native / Expo de suivi d'entraînement.

---

## Pédagogie

L'utilisateur n'est pas du tout familier avec le developpement mobile, ni avec react. 
Le but est de créer une app qui fonctionne mais aussi d'instruire l'utilisateur.
Pour cela, explique toujours ce que tu fais.
Si des cas d'école sont recontrés, explique les en détail.

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

**Typecheck** : `npx tsc --noEmit` doit rester à **0 erreur** (`noUnusedLocals` activé dans `tsconfig.json` — c'est ce qui rattrape les imports/variables morts laissés par une édition).

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
  phase-NN-*.md          # Docs d'implémentation par phase (marche à suivre + notes d'implémentation une fois réalisée)
  Notes.md               # Backlog de problèmes/features ; chaque point pointe vers son plan fix-NN
  fix-NN-*.md            # Plans de correctifs indépendants (voir section Correctifs en attente)
```

---

## Base de données

### Règle critique — migrations manuelles

`drizzle-kit generate` est **cassé** sur ce projet (les snapshots meta sont gelés à 0003). **Ne jamais l'utiliser.** Toutes les migrations doivent être écrites à la main :

1. Créer `src/db/migrations/00NN_description.sql`
2. Ajouter l'import dans `src/db/migrations/migrations.js`
3. Ajouter une entrée dans `meta/_journal.json` avec un `when` **strictement supérieur** au précédent

Drizzle n'applique une migration que si `migration.folderMillis > lastApplied.created_at`. Un `when` trop petit = migration silencieusement ignorée.

**Piège découvert avec la migration 0014 (plusieurs `ALTER TABLE` dans un même fichier) :** le migrateur Expo/Drizzle (`node_modules/drizzle-orm/expo-sqlite/migrator.js`) ne découpe un fichier `.sql` en instructions séparées que sur le marqueur littéral `--> statement-breakpoint`. Sans ce marqueur, tout le fichier est envoyé en un seul bloc à `NativeDatabase.prepareSync`, qui ne compile et n'exécute **que la toute première instruction** — les suivantes sont silencieusement ignorées, sans erreur, et la migration est quand même marquée comme appliquée. Toujours séparer chaque instruction SQL par une ligne `--> statement-breakpoint` dès qu'un fichier de migration en contient plus d'une (voir `0010_workout_session_live.sql` ou `0011_meso_calendar_anchor.sql` pour l'exemple). Un fichier à une seule instruction n'en a pas besoin.

**Prochain `when` disponible** : > `1782700005000` (dernière migration : 0015).

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
| 0012 | workout_session_created_event | `workout_sessions.created_event` (fix 02, annulation de séance) |
| 0013 | workout_session_moved_from | `workout_sessions.moved_event_from_date` (amélioration 07) |
| 0014 | update_settings | `user_settings.update_check_enabled` (amélioration 09) |
| 0015 | update_settings_fix | `user_settings.last_update_check_at` + `skipped_version` — suite de la 0014, qui n'ajoutait que la première colonne (piège multi-instructions, voir ci-dessus) |

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

## Pièges connus (transverses)

- **FK sans `onDelete`** : `workoutSessions.calendarEventId`/`mesoSessionId` et `exerciseLogs.mesoExerciseId` référencent leur parent sans cascade (`ON DELETE NO ACTION`). Ne jamais faire de `db.delete` direct sur `mesoSessions`/`mesocycles`/`calendarEvents` — toujours passer par les helpers de détachement de `src/db/meso.ts` (`detachCalendarEventForMesoSession`, `detachMesoSessionHistory`, `deleteMesoSessionCascade`/`deleteMesocycleCascade`). Détails : [docs/phase-09-ancrage-calendaire.md](docs/phase-09-ancrage-calendaire.md).
- **`Alert.alert` sur Android** : 3 boutons max — au-delà, les derniers sont silencieusement supprimés. Toujours découper en alertes imbriquées de ≤3 boutons plutôt que d'empiler les options.
- **Route racine `/`** : `app/index.tsx` (`<Redirect href="/calendrier" />`) doit exister. Au démarrage d'un build standalone, expo-router résout l'URL initiale `muscuapp:///` → chemin `''` ; sans route servant `/`, il empile `+not-found` **par-dessus** les onglets (« Oops! this screen doesn't exist »). Invisible en dev : sous Expo Go l'URL initiale vaut `''` (falsy), donc React Navigation garde la route par défaut. Corollaire : **tout bug de navigation au démarrage est à tester en build release, pas en Expo Go**.
- **Ne pas utiliser `expo-symbols` / `SymbolView`** : le composant est iOS-only (sur Android `requireNativeViewManager` n'est jamais appelé et il rend uniquement sa prop `fallback`, donc rien si elle est absente). Les icônes d'onglets passent par `@expo/vector-icons` (`MaterialIcons`) dans `app/(tabs)/_layout.tsx` ; `expo-symbols` a été désinstallé.
- **`activeSessionStore`** : les helpers d'objectifs (`getTargetRestSeconds`, `getPrefillFromHistory`…) doivent prendre `setNumber`/`side` en paramètre explicite plutôt que de lire `getActiveSession()` implicitement — sinon un écran non actif peut écraser le timer d'un autre exercice réellement actif.

---

## Export / import XLSX (phase 8)

Export et import de **mésocycles** et **programmes** en `.xlsx` stylisé (`xlsx-js-style`) et en `.csv` (phase 12). Deux formats **distincts et non mélangeables** (onglet *Méta* / colonne `type`). Architecture en couches : `core/` (pur, testable Node), `db/` (pont Drizzle ⇄ pivot), `fileIO.ts`/`actions.ts` (fichiers + UI). Import non transactionnel (limite connue).

Détails complets (format de fichier, deps) : [docs/phase-08-export-import.md](docs/phase-08-export-import.md).

---

## Ancrage calendaire des mésocycles (phase 9)

Ancrer un mésocycle (`mesocycles/[id]/ancrer.tsx`) génère des `calendar_events` pour chaque `meso_session` — **jamais** de `workout_sessions` à l'avance (créées *lazily* par `startWorkoutSession()`). Fonctions clés dans `src/db/meso.ts` : `syncMesoCalendarEvents`, `detachCalendarEventForMesoSession`, `anchorMesocycle`/`unanchorMesocycle`… Voir le piège FK ci-dessus.

Détails complets : [docs/phase-09-ancrage-calendaire.md](docs/phase-09-ancrage-calendaire.md).

---

## Détails de séance (phase 10)

Écran `app/seance/details/[sessionId].tsx` (consultation) + `.../modifier.tsx` (édition), accessibles depuis le calendrier et un mésocycle ancré (badge de statut, `src/utils/eventStatus.ts`). Helpers `renumberSetsAfterDelete`/`swapSetNumbers` dans `src/db/session.ts`. Édition unilatérale : chaque côté modifiable indépendamment (contrairement à l'écran live).

Détails complets : [docs/phase-10-details-seance.md](docs/phase-10-details-seance.md) (§ Notes d'implémentation).

---

## Séance live : améliorations (phase 11)

Préremplissage du modal par les dernières perfs (`getPrefillFromHistory`), chrono de repos visible partout (`GlobalRestBanner`), interruption de séance + bandeau de reprise déplaçable (`ActiveSessionBanner`), état « en cours » déduit du calendrier (`eventStatus.ts` → `getEffectiveStatus`, pas persisté en DB).

Détails complets : [docs/phase-11-seance-live-ameliorations.md](docs/phase-11-seance-live-ameliorations.md) (§ Notes d'implémentation).

---

## Import : écrans dédiés, CSV, prompt LLM, templates (phase 12)

Écrans d'import dédiés (`app/programmes/import.tsx`/`app/mesocycles/import.tsx`, composant partagé `ImportScreen.tsx`), format CSV en plus du XLSX, templates téléchargeables générés depuis un pivot d'exemple (`core/sampleData.ts`), prompt LLM copiable, et anti-doublons d'exercices : prompt enrichi du catalogue existant + écran de réconciliation post-import (`exercices/reconcilier.tsx`, matching FR→EN dans `src/export/core/exerciseMatch.ts`, remap via `src/db/exerciseMerge.ts`).

Détails complets : [docs/phase-12-import-dedie.md](docs/phase-12-import-dedie.md) (§ Notes d'implémentation).

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
| 12 | Import : écrans dédiés, prompt LLM copiable (+ catalogue existant), import CSV, templates, anti-doublons d'exercices (prompt enrichi + réconciliation post-import) | ✅ |

## Phases restantes

Chaque phase 13+ a un document d'implémentation détaillé dans `docs/` — **le lire en entier avant de commencer la phase**.

| Phase | Contenu | Doc |
|---|---|---|
| 7 | Onglet Progression (graphiques, records) | — |
| 13 | Chrono en arrière-plan : notification Android chronometer (⚠️ requiert dev build, sortie d'Expo Go) | `docs/phase-13-chrono-arriere-plan.md` |

La phase 13 change le workflow de build (sortie d'Expo Go) ; la phase 7 est indépendante.

## Correctifs en attente (fix-NN)

Backlog issu de `docs/Notes.md` — décisions déjà actées avec l'utilisateur, plans détaillés dans `docs/fix-NN-*.md`. **Lire le plan en entier avant d'implémenter un fix.**

Aucun correctif en attente actuellement.

## Améliorations en attente (6 à 10)

Cinq plans détaillés dans [docs/ameliorations/](docs/ameliorations/README.md) — décisions déjà actées avec l'utilisateur, **lire le plan en entier avant d'implémenter**. 07, 08, 09 et 10 implémentés (branche `feature/ameliorations-07-a-10`) ; reste **06**.

| # | Sujet | Impact DB | Statut |
|---|---|---|---|
| [06](docs/ameliorations/06-infos-exercice-seance.md) | Photos / variante / alternatives / notes sur les écrans séance planifiée (éditable) et live (lecture seule) | `meso_exercises.note` + ripple export/import | à implémenter |

Les numéros de migration sont attribués **au moment de l'implémentation** (les docs donnent le SQL, pas le numéro). Prochain `when` disponible : > `1782700004000` (dernière migration : 0014).

**07 implémenté :** `workout_sessions.moved_event_from_date` (migration 0013) mémorise la date d'origine avant qu'« Encoder aujourd'hui » (`startSessionFlow.ts`) ne déplace l'événement ; `cancelWorkoutSession` (`src/db/session.ts`) la restaure à l'annulation. Une séance terminée n'est pas concernée.

**08 implémenté :** bloc « Quand » (date précise / sans date fixe) extrait en composant partagé `src/components/WhenPickerField.tsx`, utilisé par `calendrier/event/nouveau.tsx` (rendu inchangé) et désormais par `calendrier/event/[eventId]/modifier.tsx`, qui permet enfin de changer la date d'un événement sans le recréer. `parseDateParam` déplacé dans `src/utils/dateUtils.ts`.

**09 implémenté :** premier écran Paramètres (`app/parametres.tsx`, accès via icône ⚙ dans le header du calendrier) + vérification de mise à jour comparant `app.json` au tag de la dernière Release GitHub (`src/utils/updateCheck.ts`, `src/utils/appVersion.ts`) — auto au lancement (`app/_layout.tsx`, gardée par toggle + délai 24h) et bouton manuel. Migrations 0014 + 0015 : `user_settings.update_check_enabled/last_update_check_at/skipped_version` (en 2 fichiers suite au piège multi-instructions documenté ci-dessus). Checklist de release ajoutée ci-dessus.

**10 implémenté :** section « Aide » de `app/parametres.tsx` (Signaler un bug / Envoyer une suggestion) → `src/utils/feedback.ts`, `mailto:` prérempli avec diagnostic (version, plateforme, appareil), sans donnée d'entraînement. Repli presse-papier si aucun client mail.

Fixes 01 (menu calendrier « Voir la séance planifiée »), 02 (annuler une séance commencée), 03 (header exercice live tappable), 04 (cohérence calendrier × date d'encodage), 05 (sections « Performances » vides) et 06 (suppression d'un exercice utilisé) implémentés. Fix 01 : `src/utils/plannedSessionRoute.ts` (`getPlannedSessionRoute`) résout `refType`/`refId` → route méso ou programme (fallback `program_session` si `refType` absent, cf. `startWorkoutSession`) ; entrée de menu dans `app/calendrier/[date].tsx` et `app/(tabs)/calendrier.tsx`. Fix 02/04 : migration 0012, `cancelWorkoutSession`/`startWorkoutSession` dans `src/db/session.ts`, `src/utils/startSessionFlow.ts` ; annulation sans confirmation supplémentaire si 0 série enregistrée (`confirmCancel` dans `app/seance/[sessionId].tsx`). Fix 03 : `app/seance/exercice/[logId].tsx` affiche le nom de l'exercice dans une `View` juste avant la section « Objectifs » (pas de header dynamique, pas de navigation). Fix 05 : `app/exercices/[id].tsx` et l'écran exercice de programme (`app/programmes/[id]/sessions/[sessionId]/exercises/[programExerciseId].tsx`) utilisent `getPreviousPerfs`/`getUserWeightUnit` (`src/db/session.ts`) au lieu d'un placeholder statique / d'une requête filtrée sur `programExerciseId`. Fix 06 : `getExerciseUsage`/`deleteExerciseCascade` ajoutés à `src/db/exerciseMerge.ts` (aux côtés de `remapExercise`, phase 12) ; `app/exercices/[id].tsx` — `handleDelete` détecte les usages et propose Annuler / « Remplacer par… » (Modal + `ExercisePicker`, exclusion manuelle de l'exercice courant) / « Tout supprimer… » (double confirmation Android-safe, ≤3 boutons par alerte).

---

## Build APK Android (local)

EAS Build (cloud) échoue silencieusement sur ce projet — probablement à cause des ~2600 fichiers d'assets exercices (102 Mo), trop lourd pour le pipeline gratuit. Builder en local à la place :

```bash
npx expo install --check   # vérifier les versions de deps avant de builder
npx expo run:android --variant release
```

Nécessite Android Studio (SDK + `adb`) installé, `ANDROID_HOME` configuré, et un téléphone en USB avec débogage activé. APK généré dans `android/app/build/outputs/apk/release/app-release.apk`, à publier sur une [Release GitHub](https://github.com/SaamueI/app-muscu/releases/latest) (lien déjà dans le README).

### Checklist de release (amélioration 09 — vérification de mise à jour)

L'app compare `expo.version` (`app.json`) au `tag_name` de la dernière Release GitHub (`src/utils/updateCheck.ts`) pour détecter une mise à jour disponible. Cette détection **ne fonctionne que si le tag de la release est identique à `app.json`** — donc à chaque release :

1. Bumper `expo.version` **et** `android.versionCode` dans `app.json`.
2. Builder (`npx expo run:android --variant release`).
3. Publier la Release GitHub en taguant avec **la même version** que `app.json` (`v1.0.2` pour `"version": "1.0.2"`).

**Seul `app.json` fait foi** pour la version (c'est lui que lit `expo-constants`, donc `getAppVersion()`) : `package.json` a divergé (`1.0.0` vs `1.0.1` dans `app.json`) et ce n'est pas gênant, mais ne jamais se fier à `package.json` pour la comparaison de version.

---

## GitHub

Dépôt public : https://github.com/SaamueI/app-muscu

```bash
git add -A && git commit -m "..." && git push
```
