import { eq } from 'drizzle-orm';

import { db } from './index';
import { userSettings } from './schema';

export type UpdatePrefs = {
  enabled: boolean;
  lastCheckAt: string | null;
  skippedVersion: string | null;
};

const DEFAULT_PREFS: UpdatePrefs = {
  enabled: true,
  lastCheckAt: null,
  skippedVersion: null,
};

// La ligne singleton de user_settings est créée paresseusement (cf. setUserWeightUnit
// dans session.ts) : tant que rien n'y a jamais été écrit, la table est vide.
export async function getUpdatePrefs(): Promise<UpdatePrefs> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.id, 'singleton'));
  if (!row) return DEFAULT_PREFS;
  return {
    enabled: row.updateCheckEnabled,
    lastCheckAt: row.lastUpdateCheckAt,
    skippedVersion: row.skippedVersion,
  };
}

// Côté par lequel commencent les séries unilatérales (même réglage partout).
// Gauche par défaut, y compris tant que la ligne singleton n'existe pas.
export async function getFirstSide(): Promise<'L' | 'R'> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.id, 'singleton'));
  return row?.firstSide === 'R' ? 'R' : 'L';
}

// Upsert qui ne touche QUE first_side : les autres colonnes gardent leur valeur
// (ou leur DEFAULT si la ligne vient d'être créée).
export async function setFirstSide(side: 'L' | 'R'): Promise<void> {
  await db
    .insert(userSettings)
    .values({ id: 'singleton', firstSide: side })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: { firstSide: side },
    });
}

export async function setUpdatePrefs(patch: Partial<UpdatePrefs>): Promise<void> {
  const current = await getUpdatePrefs();
  const next = { ...current, ...patch };
  await db
    .insert(userSettings)
    .values({
      id: 'singleton',
      updateCheckEnabled: next.enabled,
      lastUpdateCheckAt: next.lastCheckAt,
      skippedVersion: next.skippedVersion,
    })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: {
        updateCheckEnabled: next.enabled,
        lastUpdateCheckAt: next.lastCheckAt,
        skippedVersion: next.skippedVersion,
      },
    });
}
