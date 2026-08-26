// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_magenta_rocket_raccoon.sql';
import m0001 from './0001_fearless_outlaw_kid.sql';
import m0002 from './0002_loose_jetstream.sql';
import m0003 from './0003_parallel_skrulls.sql';
import m0004 from './0004_rebuild_program_exercises.sql';
import m0005 from './0005_calendar_event_fields.sql';
import m0006 from './0006_mesocycle_layer.sql';
import m0007 from './0007_target_memory.sql';
import m0008 from './0008_tempo_text.sql';
import m0009 from './0009_program_exercises_tempo_text.sql';
import m0010 from './0010_workout_session_live.sql';
import m0011 from './0011_meso_calendar_anchor.sql';
import m0012 from './0012_workout_session_created_event.sql';
import m0013 from './0013_workout_session_moved_from.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009,
m0010,
m0011,
m0012,
m0013
    }
  }
