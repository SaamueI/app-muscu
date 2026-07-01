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

src/
  db/
    index.ts           # Ouverture DB + PRAGMA foreign_keys = ON
    schema.ts          # Tables Drizzle (source de vérité)
    meso.ts            # Helpers mésocycle (copy, duplicate, memory…)
    migrations/
      meta/_journal.json   # Journal Drizzle — timestamps DOIVENT être croissants
      migrations.js        # Import de toutes les migrations m0000–m0008
      0000_…sql … 0008_…sql
  components/
    ExercisePicker.tsx
  utils/
    generateId.ts
    altPickerStore.ts      # Store module-level pour passer un exo entre écrans
    mesoDeletePref.ts      # Flag "ne plus demander" suppression de séance
```

---

## Base de données

### Règle critique — migrations manuelles

`drizzle-kit generate` est **cassé** sur ce projet (les snapshots meta sont gelés à 0003). **Ne jamais l'utiliser.** Toutes les migrations doivent être écrites à la main :

1. Créer `src/db/migrations/00NN_description.sql`
2. Ajouter l'import dans `src/db/migrations/migrations.js`
3. Ajouter une entrée dans `meta/_journal.json` avec un `when` **strictement supérieur** au précédent

Drizzle n'applique une migration que si `migration.folderMillis > lastApplied.created_at`. Un `when` trop petit = migration silencieusement ignorée.

**Prochain `when` disponible** : > `1782600000000` (dernière migration : 0009).

### Schéma (résumé)

```
exercises              — catalogue d'exercices (custom + dataset)
programs               — programmes d'entraînement
  └─ program_sessions  — séances d'un programme (template, pas d'objectifs par série)
       └─ program_exercises — exercices d'une séance template (objectifs agrégés)

calendar_events        — événements (workout_session / rest / competition / other)
  └─ workout_sessions  — séance réalisée
       └─ exercise_logs
            └─ set_logs

mesocycles             — plan d'entraînement sur N semaines
  └─ meso_sessions     — séance planifiée (week_index, order, title, color, day)
       └─ meso_exercises
            └─ meso_sets   — objectifs PAR SÉRIE (reps, poids, RIR, repos, durée, tempo)

target_memory          — cache des derniers objectifs par program_session_id
```

**Points importants :**
- `programExercises.tempo` et `mesoSets.tempo` → `text` au format `"3-1-1-0"` (excentrique-pauseBasse-concentrique-pauseHaute)
- `PRAGMA foreign_keys = ON` activé dans `src/db/index.ts` (nécessaire pour les CASCADE)

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

## Phases restantes (non démarrées)

| Phase | Contenu |
|---|---|
| 6 | Séance en cours (mode live : timer, log des sets) |
| 7 | Onglet Progression (graphiques, records) |
| 8 | Export / import mésocycle |
| 9 | Ancrage calendaire des mésocycles |

---

## GitHub

Dépôt privé : https://github.com/SaamueI/app-muscu

```bash
git add -A && git commit -m "..." && git push
```
