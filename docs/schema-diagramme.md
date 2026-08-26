# Diagramme de la base de données

Diagramme Mermaid (`erDiagram`) reflétant `src/db/schema.ts`. **À tenir à jour** : voir la note dans `CLAUDE.md` (section Base de données) — toute session qui modifie le schéma (nouvelle colonne, nouvelle table, migration) doit régénérer ce fichier avant de terminer.

Dernière mise à jour : après la migration **0016** (`meso_exercises.note`, amélioration 06, 2026-08-26).

```mermaid
erDiagram
    EXERCISES {
        text id PK
        text name
        json primary_muscles
        json secondary_muscles
        text description
        text measurement_type
        boolean is_custom
        text notes
        text weight_unit
        text equipment
        text category
        text level
        text mechanic
        text force
        json custom_image_uris
        json variations
    }

    PROGRAMS {
        text id PK
        text name
        text description
    }

    PROGRAM_SESSIONS {
        text id PK
        text program_id FK
        text name
        int order
        text color
        text day
    }

    PROGRAM_EXERCISES {
        text id PK
        text program_session_id FK
        text exercise_id FK
        json alternative_exercise_ids
        int order
        int target_sets_min
        int target_sets_max
        int target_reps_min
        int target_reps_max
        real target_weight_min
        real target_weight_max
        int target_rir_min
        int target_rir_max
        int target_rest_seconds
        int target_duration_seconds
        text tempo
        text selected_variation
        text superset_group_id
    }

    CALENDAR_EVENTS {
        text id PK
        text type
        text status
        text date
        text week
        text ref_id
        text ref_type
        text title
        text description
    }

    WORKOUT_SESSIONS {
        text id PK
        text calendar_event_id FK
        text program_session_id FK
        text meso_session_id FK
        text date
        text started_at
        text finished_at
        boolean created_event
        text moved_event_from_date
    }

    EXERCISE_LOGS {
        text id PK
        text workout_session_id FK
        text exercise_id FK
        text program_exercise_id FK
        text meso_exercise_id FK
        text superset_group_id
        boolean is_done
        int order
        text time
        text note
    }

    SET_LOGS {
        text id PK
        text exercise_log_id FK
        real weight
        boolean pdc
        int reps
        int duration_seconds
        int rest_seconds
        int partial_reps
        int rir
        int execution_seconds
        int set_number
        text side
    }

    MESOCYCLES {
        text id PK
        text program_id FK
        text name
        int num_weeks
        text start_date
        text notes
        text created_at
    }

    MESO_SESSIONS {
        text id PK
        text mesocycle_id FK
        text program_session_id FK
        int week_index
        int order
        text title
        text note
        text day
        text color
    }

    MESO_EXERCISES {
        text id PK
        text meso_session_id FK
        text exercise_id FK
        json alternative_exercise_ids
        int order
        text selected_variation
        text superset_group_id
        text note
    }

    MESO_SETS {
        text id PK
        text meso_exercise_id FK
        int set_number
        int target_reps_min
        int target_reps_max
        real target_weight_min
        real target_weight_max
        int target_rir_min
        int target_rir_max
        int target_rest_seconds
        int target_duration_seconds
        text tempo
    }

    TARGET_MEMORY {
        text program_session_id PK
        json data
        text updated_at
    }

    REST_PRESETS {
        text id PK
        int seconds
        int sort_order
    }

    USER_SETTINGS {
        text id PK
        text weight_unit
        boolean update_check_enabled
        text last_update_check_at
        text skipped_version
    }

    PROGRAMS ||--o{ PROGRAM_SESSIONS : "has"
    PROGRAM_SESSIONS ||--o{ PROGRAM_EXERCISES : "has"
    EXERCISES ||--o{ PROGRAM_EXERCISES : "used by"

    CALENDAR_EVENTS ||--o{ WORKOUT_SESSIONS : "has"
    PROGRAM_SESSIONS |o--o{ WORKOUT_SESSIONS : "template of"
    MESO_SESSIONS |o--o{ WORKOUT_SESSIONS : "planned by"

    WORKOUT_SESSIONS ||--o{ EXERCISE_LOGS : "has"
    EXERCISES ||--o{ EXERCISE_LOGS : "used by"
    PROGRAM_EXERCISES |o--o{ EXERCISE_LOGS : "objective of"
    MESO_EXERCISES |o--o{ EXERCISE_LOGS : "objective of"

    EXERCISE_LOGS ||--o{ SET_LOGS : "has"

    PROGRAMS |o--o{ MESOCYCLES : "instantiated from"
    MESOCYCLES ||--o{ MESO_SESSIONS : "has"
    PROGRAM_SESSIONS |o--o{ MESO_SESSIONS : "template of"

    MESO_SESSIONS ||--o{ MESO_EXERCISES : "has"
    EXERCISES ||--o{ MESO_EXERCISES : "used by"

    MESO_EXERCISES ||--o{ MESO_SETS : "has"

    PROGRAM_SESSIONS ||--o| TARGET_MEMORY : "cache of"
```

**Note :** `calendar_events.ref_id` n'est volontairement pas une vraie FK — il pointe soit vers un `program_session`, soit vers un `meso_session`, disambiguïsé par `ref_type` (voir section « Ancrage calendaire » de `CLAUDE.md`). C'est pour ça qu'il n'apparaît pas dans les relations ci-dessus.
