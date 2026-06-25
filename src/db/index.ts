import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const expo = openDatabaseSync('muscu.db', { enableChangeListener: true });

// Active l'intégrité référentielle : sans ça, les ON DELETE CASCADE / SET NULL
// du schéma ne sont pas appliqués (SQLite désactive les FK par défaut).
expo.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expo, { schema });
