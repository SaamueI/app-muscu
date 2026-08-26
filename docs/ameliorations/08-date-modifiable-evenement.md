# 08 — Changer la date d'une séance depuis l'écran de modification

## Problème

`app/calendrier/event/[eventId]/modifier.tsx` permet de changer le titre, la description, le statut et la séance liée — **mais pas la date**. L'écran de création `app/calendrier/event/nouveau.tsx` propose lui le choix « Date précise » / « Sans date fixe » (planifié à la semaine), avec `DatePickerField` ou `WeekPickerField` selon le mode.

Résultat : une séance mal datée, ou qu'on veut décaler, ne peut être corrigée qu'en la supprimant et en la recréant — ce qui perd la description et le lien vers la séance de programme.

## Décisions actées

- L'écran de modification reçoit **le même bloc « Quand »** que l'écran de création : deux cartes de mode + picker de date ou de semaine.
- Le bloc est **extrait dans un composant partagé** plutôt que dupliqué.
- L'écran concerné est bien celui de l'**événement calendrier**. `app/seance/details/[sessionId]/modifier.tsx` (édition des séries d'une séance **réalisée**) n'est **pas** touché : la date d'encodage d'une séance faite est un autre sujet, traité par le [point 07](07-annulation-date-seance.md).

## Marche à suivre

### 1. Extraire `src/components/WhenPickerField.tsx`

Depuis `app/calendrier/event/nouveau.tsx` (bloc l.210-252 + styles `modeRow`, `modeCard`, `modeCardActive`, `modeCardTitle*`, `modeCardSub*`) :

```ts
type Props = {
  mode: 'dated' | 'undated';
  onModeChange: (mode: 'dated' | 'undated') => void;
  date: Date | null;
  onDateChange: (d: Date) => void;
  week: string;                    // ISO "YYYY-Www"
  onWeekChange: (w: string) => void;
};
```

Le composant rend les deux cartes de mode (« Date précise » / « Sans date fixe »), puis `<DatePickerField>` ou `<WeekPickerField>` selon `mode`. Il **n'inclut pas** les `<Text style={styles.label}>` de section — chaque écran garde ses propres en-têtes de carte pour ne pas casser la mise en page existante.

Brancher `nouveau.tsx` dessus : comportement et rendu strictement inchangés.

### 2. Déplacer `parseDateParam` dans `src/utils/dateUtils.ts`

`nouveau.tsx` définit localement un `parseDateParam(dateStr?: string): Date | null`. Il est maintenant utilisé par deux écrans → le déplacer à côté de `toDateStr` / `dateToIsoWeek` / `formatShortDate` dans `src/utils/dateUtils.ts`.

### 3. `modifier.tsx` — états et initialisation

Nouveaux états, initialisés dans le `.then()` de chargement de l'événement (l.59-87) :

```ts
const [eventMode, setEventMode] = useState<'dated' | 'undated'>('dated');
const [selectedDate, setSelectedDate] = useState<Date | null>(null);
const [selectedWeek, setSelectedWeek] = useState(() => dateToIsoWeek(new Date()));
```

À la lecture de l'événement :

- `ev.date` renseignée → `eventMode = 'dated'`, `selectedDate = parseDateParam(ev.date)` ;
- sinon → `eventMode = 'undated'`, `selectedWeek = ev.week ?? dateToIsoWeek(new Date())`.

Insérer une section « Quand » avec `<WhenPickerField>`, placée **après** la section Statut (donc avant Type et Séance).

### 4. `modifier.tsx` — sauvegarde

Dans `handleSave`, ajouter au `db.update(calendarEvents).set({ … })` :

```ts
date: eventMode === 'dated' && selectedDate ? toDateStr(selectedDate) : null,
week: eventMode === 'undated' ? selectedWeek : null,
```

Et étendre la garde :

```ts
const canSave = title.trim().length > 0 && (eventMode === 'undated' || selectedDate !== null);
```

Les deux champs sont **toujours écrits ensemble** : passer d'un mode à l'autre doit mettre l'un à `null` et renseigner l'autre.

### 5. Événements liés à un mésocycle

Pour `event.refType === 'meso_session'`, la date **reste modifiable** — décaler une séance de méso d'un jour est justement le cas d'usage principal. Afficher sous le picker un texte explicatif dans le même style que celui déjà présent sur le champ Séance :

> Liée à un mésocycle ancré — un ré-ancrage du mésocycle replacera cette séance à sa date théorique.

C'est exact : `syncMesoCalendarEvents` (`src/db/meso.ts`) recalcule `date` depuis `startDate + weekIndex + day` pour tout événement encore au statut `planned`. Limite déjà actée dans `fix-04`, ne pas chercher à la contourner ici.

### 6. Correctif connexe (optionnel, même famille de fichiers)

`nouveau.tsx` (l.113) pose `refId` sans poser `refType` quand on crée un événement de type séance liée à une session de programme. Ça ne casse rien aujourd'hui — `startWorkoutSession` retombe sur `program_session` quand `refType` est null (`src/db/session.ts` l.156-159) — mais c'est incohérent avec `modifier.tsx` qui, lui, le pose. Ajouter :

```ts
refType: type === 'workout_session' && selectedSessionId ? 'program_session' : null,
```

## Points d'attention

- **Cohérence date ⇄ semaine** : un événement avec `date` **et** `week` renseignés, ou aucun des deux, disparaît ou se duplique dans les vues du calendrier. Toujours écrire le couple.
- **Ne pas toucher à `workout_sessions.date`** : si une séance a déjà été encodée sur cet événement, sa date d'encodage lui appartient. Déplacer l'événement calendrier ne doit pas réécrire l'historique.
- L'écran `app/seance/details/[sessionId]/modifier.tsx` porte le titre « Modifier la séance » et pourrait prêter à confusion : il édite les **séries** d'une séance réalisée et n'est pas concerné par ce point.
- `WeekPickerField` rend un calendrier `react-native-calendars` inline, nettement plus haut que le bouton `DatePickerField` : vérifier que la `ScrollView` de `modifier.tsx` reste confortable en mode « sans date fixe ».
- `noUnusedLocals` est actif : après l'extraction, retirer de `nouveau.tsx` les imports `DatePickerField` / `WeekPickerField` et les styles de cartes devenus inutilisés.

## Vérification

- `npx tsc --noEmit` → 0 erreur.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Créer un événement daté depuis le calendrier → le rendu de l'écran de création est identique à avant (non-régression de l'extraction).
  2. Le modifier vers une autre date → il se déplace dans la vue mensuelle, et n'apparaît plus à l'ancienne date.
  3. Le repasser en « Sans date fixe » sur une semaine donnée → il disparaît de la grille des jours et apparaît dans le bucket « semaine ».
  4. Le repasser en « Date précise » → il revient dans la grille.
  5. Ouvrir un événement de méso ancré : l'avertissement s'affiche, la date est bien modifiable, et un ré-ancrage du méso la replace à la date théorique (comportement attendu, documenté).
  6. Vider le titre en mode « Date précise » sans date → le bouton Enregistrer est désactivé.
