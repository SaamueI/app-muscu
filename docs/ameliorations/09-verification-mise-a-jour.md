# 09 — Vérification de mise à jour (releases GitHub)

## Problème

L'app se distribue par APK sur les [Releases GitHub](https://github.com/SaamueI/app-muscu/releases/latest) du dépôt public. Rien n'avertit qu'une nouvelle version existe : il faut penser à aller voir.

Par ailleurs, **l'app n'a aucun écran Paramètres**. La table `user_settings` existe, `getUserWeightUnit` / `setUserWeightUnit` existent dans `src/db/session.ts`… mais aucun écran ne les appelle. Ce point crée donc aussi cet écran, que le [point 10](10-signaler-bug-suggestion.md) réutilisera.

## Décisions actées

- Comparer la version locale (`app.json` → `expo.version`) au `tag_name` de la **dernière release GitHub**.
- Vérification automatique **désactivable**, plus un bouton **« Vérifier maintenant »** dans les Paramètres.
- Le bouton de mise à jour **ouvre la page de release dans le navigateur**. Pas de téléchargement ni d'installation d'APK depuis l'app (ce qui exigerait `REQUEST_INSTALL_PACKAGES`, un `FileProvider` et une sortie d'Expo Go).
- Échec réseau : **silencieux** en vérification automatique, **message explicite** en vérification manuelle.
- Accès aux Paramètres : **icône ⚙ dans le header de l'onglet Calendrier**, à gauche du `+` existant. Les 5 onglets restent inchangés.

## Marche à suivre

### 1. Écran `app/parametres.tsx`

Nouvelle route de stack, enregistrée dans `app/_layout.tsx` :

```tsx
<Stack.Screen name="parametres" options={{ title: 'Paramètres' }} />
```

Accès : dans `app/(tabs)/calendrier.tsx`, le `useLayoutEffect` (l.99-107) pose déjà un `headerRight` avec le `+`. Le remplacer par une `View` en ligne (`flexDirection: 'row'`, `gap: 16`) contenant d'abord une icône `MaterialIcons name="settings"` (→ `router.push('/parametres')`), puis le `+` existant.

Sections de l'écran, dans l'ordre :

| Section | Contenu |
|---|---|
| **Mises à jour** | version actuelle · toggle « Vérifier automatiquement » · bouton « Vérifier maintenant » · date de la dernière vérification |
| **Aide** | (rempli par le point 10) |
| **À propos** | version · lien vers le dépôt GitHub |

*Bonus optionnel, hors périmètre 6-10* : une section **Unités** (chips kg / lb) qui brancherait enfin `getUserWeightUnit` / `setUserWeightUnit`, jamais exposés dans l'UI, et un raccourci vers `/seance/presets-repos` (écran déjà existant). À faire seulement si l'écran paraît vide.

### 2. Migration — préférences de mise à jour

```sql
-- src/db/migrations/00NN_update_settings.sql
ALTER TABLE `user_settings` ADD COLUMN `update_check_enabled` integer NOT NULL DEFAULT 1;
ALTER TABLE `user_settings` ADD COLUMN `last_update_check_at` text;
ALTER TABLE `user_settings` ADD COLUMN `skipped_version` text;
```

Plus le schéma Drizzle (`userSettings`), l'import dans `migrations.js` et l'entrée `meta/_journal.json` avec un `when` **strictement supérieur** au précédent (dernier connu : `1782700002000`). Migrations écrites à la main (`drizzle-kit generate` cassé, cf. `CLAUDE.md`), puis `npx expo start --clear`.

### 3. `src/db/settings.ts`

```ts
export type UpdatePrefs = {
  enabled: boolean;
  lastCheckAt: string | null;   // ISO
  skippedVersion: string | null;
};

export async function getUpdatePrefs(): Promise<UpdatePrefs>;
export async function setUpdatePrefs(patch: Partial<UpdatePrefs>): Promise<void>;
```

⚠️ **La ligne singleton de `user_settings` est créée paresseusement.** `setUserWeightUnit` fait un `insert … onConflictDoUpdate` ; tant que l'utilisateur n'a jamais touché à l'unité, **la table est vide** et le `select` renvoie `undefined`. Donc :

- `getUpdatePrefs` retourne les défauts `{ enabled: true, lastCheckAt: null, skippedVersion: null }` quand aucune ligne n'existe ;
- `setUpdatePrefs` est un `insert … values({ id: 'singleton', … }).onConflictDoUpdate({ target: userSettings.id, set: … })`, jamais un `update` sec.

Les helpers d'unité restent où ils sont (`src/db/session.ts`) pour éviter du churn inutile.

### 4. `src/utils/appVersion.ts`

```ts
export function getAppVersion(): string;          // Constants.expoConfig?.version ?? '0.0.0'
export function compareVersions(a: string, b: string): number;   // -1 | 0 | 1
```

`expo-constants` est déjà installé. `compareVersions` doit tolérer le préfixe `v` (`v1.0.2` ⇄ `1.0.2`), les segments manquants (`1.1` vs `1.1.0`) et les suffixes non numériques (ignorés).

### 5. `src/utils/updateCheck.ts`

```ts
export type ReleaseInfo = {
  version: string;      // tag_name sans le 'v'
  tagName: string;
  htmlUrl: string;
  name: string | null;
  publishedAt: string | null;
};

export type UpdateStatus =
  | { status: 'up-to-date' }
  | { status: 'update-available'; latest: ReleaseInfo }
  | { status: 'unreachable' };

export async function checkForUpdate(): Promise<UpdateStatus>;
```

- Endpoint : `https://api.github.com/repos/SaamueI/app-muscu/releases/latest`, header `Accept: application/vnd.github+json`.
- `AbortController` + timeout ~8 s.
- Toute erreur réseau, tout statut non-2xx, et le cas « aucune release publiée » (404) → `'unreachable'`. **Aucune exception ne doit remonter.**
- **Pas de dépendance réseau supplémentaire** : un `fetch` qui échoue *est* le signal « hors ligne ». Inutile d'ajouter `@react-native-community/netinfo` juste pour ça.

### 6. Vérification automatique au lancement

`useEffect` dans `RootLayoutNav` (`app/_layout.tsx`). Il ne s'exécute qu'après migrations **et** seed : `RootLayout` rend `null` tant que `!fontsLoaded || !seeded`, donc `RootLayoutNav` n'est monté qu'une fois la DB prête.

Conditions d'exécution : `prefs.enabled` **et** `lastCheckAt` absent ou vieux de plus de 24 h. Écrire `lastCheckAt` à **chaque tentative** (même échouée), pour ne pas retenter à chaque ouverture quand on est hors ligne.

Si `'update-available'` **et** `latest.version !== prefs.skippedVersion` :

```
Alert.alert(
  'Mise à jour disponible',
  'Version 1.0.2 disponible (tu es en 1.0.1).',
  [ « Plus tard », « Ignorer cette version », « Voir la release » ]
)
```

**Exactement 3 boutons** — c'est la limite Android, ne rien y ajouter.

- *Ignorer cette version* → `setUpdatePrefs({ skippedVersion: latest.version })`.
- *Voir la release* → `WebBrowser.openBrowserAsync(latest.htmlUrl)` (`expo-web-browser` déjà installé).

Silence total si `'up-to-date'` ou `'unreachable'`.

### 7. Vérification manuelle depuis les Paramètres

Le bouton « Vérifier maintenant » **ignore** le délai de 24 h et `skippedVersion`, et donne un retour dans les trois cas :

| Résultat | Retour |
|---|---|
| à jour | « Tu es à jour (v1.0.1). » |
| mise à jour dispo | même alerte à 3 boutons que ci-dessus |
| injoignable | « Impossible de vérifier les mises à jour. Vérifie ta connexion internet. » |

Afficher un indicateur d'attente pendant l'appel (le timeout est de 8 s).

### 8. Discipline de version — à ajouter à `CLAUDE.md`

Compléter la section « Build APK Android (local) » avec une checklist de release :

1. Bumper `expo.version` **et** `android.versionCode` dans `app.json`.
2. Builder (`npx expo run:android --variant release`).
3. Publier la Release GitHub en taguant avec **la même version** que `app.json` (`v1.0.2` ⇄ `1.0.2`) — c'est cette égalité qui fait fonctionner la détection.

À signaler dans le doc : `package.json` est à `1.0.0` alors que `app.json` est à `1.0.1`. Les deux ont déjà divergé. Soit on resynchronise, soit on acte que **seule `app.json` fait foi** — c'est elle que lit `expo-constants`, donc c'est elle qui doit correspondre au tag.

## Points d'attention

- **Quota API GitHub** : 60 requêtes/h par IP en non authentifié. Largement suffisant avec le garde de 24 h, et le bouton manuel reste marginal. Ne pas ajouter de token dans un dépôt public.
- **Expo Go** : `Constants.expoConfig.version` y vaut la valeur d'`app.json`, donc l'alerte se teste normalement — même si aucun APK n'y est installable.
- **Aucune donnée personnelle envoyée** : c'est un simple `GET` sur une API publique, sans corps ni identifiant.
- Ne pas déclencher la vérification depuis `RootLayout` (avant le rendu de `RootLayoutNav`) : la DB pourrait ne pas être migrée et `Alert` s'afficherait par-dessus le splash.
- `update_check_enabled` est `NOT NULL DEFAULT 1` : les lignes `user_settings` déjà existantes héritent de la valeur 1, donc de la vérification automatique activée. C'est le comportement voulu.

## Vérification

- `npx tsc --noEmit` → 0 erreur.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Baisser temporairement `expo.version` à `0.9.0` → relancer → alerte « Mise à jour disponible » → « Voir la release » ouvre la bonne page GitHub.
  2. « Ignorer cette version » → relancer → plus d'alerte ; mais « Vérifier maintenant » la propose toujours.
  3. Mode avion → « Vérifier maintenant » → message d'échec explicite, aucun crash, aucun blocage de l'UI.
  4. Toggle « Vérifier automatiquement » désactivé → relancer → aucune alerte, et « Vérifier maintenant » fonctionne toujours.
  5. Remettre la vraie version → « Vérifier maintenant » → « Tu es à jour ».
  6. Première installation (DB vierge, aucune ligne `user_settings`) → aucun crash, vérification active par défaut.
