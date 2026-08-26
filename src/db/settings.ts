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
