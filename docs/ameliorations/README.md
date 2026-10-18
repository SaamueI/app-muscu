# Améliorations

Plans d'implémentation issus de `Default/Améliorations app muscu.md` (backlog d'idées hors app). Chaque point a son document ; **le lire en entier avant de commencer**. Même gabarit que les `docs/fix-NN-*.md` : Problème → Décisions actées → Marche à suivre → Points d'attention → Vérification.

## État

| # | Sujet | Doc | Statut |
|---|---|---|---|
| 1 | Superset : suivi en séance live | [01](01-superset-live.md) | ✅ acté, à implémenter (en dernier) |
| 2 | Synchronisation du calendrier (système) | — | pas encore planifié |
| 3 | Import/export des perfs + prompt LLM | — | pas encore planifié |
| 4 | Création d'exercices complets à l'import d'un programme/méso | — | pas encore planifié |
| 5 | Onglet Progression → export des perfs + prompt notebook | — | pas encore planifié |
| 6 | Infos exercice (photos, variante, alternatives, notes) sur séance planifiée et live | [06](06-infos-exercice-seance.md) | ✅ implémenté |
| 7 | Annuler une séance live ne réinitialise pas sa date | [07](07-annulation-date-seance.md) | ✅ implémenté |
| 8 | Changer la date d'une séance depuis l'écran de modification | [08](08-date-modifiable-evenement.md) | ✅ implémenté |
| 9 | Vérification de mise à jour (releases GitHub) | [09](09-verification-mise-a-jour.md) | ✅ implémenté |
| 10 | Signaler un bug / envoyer une suggestion | [10](10-signaler-bug-suggestion.md) | ✅ implémenté |
| 11 | Séance live : chrono global + sortie (flèche = interrompre, croix du widget = Annuler/Terminer/Retour) | [11](11-seance-live-chrono-et-sortie.md) | ✅ acté, à implémenter |
| 12 | Exercice live : saisie des séries (RIR 0, clavier auto, back pendant l'encodage, modifier un seul côté, note par série) | [12](12-exercice-live-saisie-series.md) | ✅ implémenté et testé sur device |
| 13 | Exercice live : avancement dans les objectifs, pré-toggle unilatéral, repos ÷ 2, repos prédéfini modifiable, côté de départ réglable | [13](13-exercice-live-progression-unilateral-repos.md) | ✅ acté, à implémenter |
| 14 | Exercice live : basculer sur un exercice alternatif, changer la variante de l'exercice en cours | [14](14-exercice-live-alternative.md) | ✅ acté, à implémenter |

## Ordre d'implémentation recommandé — lot 11-14 + 01 (séance live)

1. **12** *(fait)* — surtout des bugs (RIR 0 enregistré `null`, temps d'exécution effacé à l'édition…) + note par série (migration `set_logs.note`). À faire en premier.
2. **11** — indépendant des autres (écran séance + widget), peut aussi passer en premier ou en parallèle.
3. **13** — introduit le moteur d'avancement dérivé de la DB (`exerciseProgress.ts`) et extrait `ObjectivesList`/`SetLogList` de l'écran exercice. Unilatéral déduit de la variante + de l'historique ; migration `user_settings.first_side`.
4. **14** — utilise `computeProgress` (`startSetNumber`) du plan 13.
5. **01** — superset : réutilise le moteur et les composants de 13, et commence par extraire le reste de l'écran exercice. Le plus gros, à faire en dernier.

## Ordre d'implémentation suivi — améliorations 06 à 10 (fait)

1. **07** puis **08** — petits, indépendants, aucun impact sur le reste.
2. **09** — crée l'écran `app/parametres.tsx` et son accès depuis le header du calendrier.
3. **10** — se greffe sur l'écran Paramètres créé au point 9.
4. **06** — le plus gros (migration + 2 écrans + composant partagé + ripple export/import), à faire à part.

## Numéros de migration

Lot 11-14 + 01 : **12** → `set_logs.note` ; **13** → `user_settings.first_side` ; **14** → `exercise_logs.selected_variation`. Une instruction par migration. Numéros attribués à l'implémentation, à partir de 0017.

Trois points touchent la DB : **06** (`meso_exercises.note`, migration **0016**), **07** (`workout_sessions.moved_event_from_date`, migration **0013**) et **09** (3 colonnes sur `user_settings`, migrations **0014** + **0015**).

Les documents donnent le **SQL**, pas le numéro : celui-ci s'attribue au moment de l'implémentation, dans l'ordre réel. Dernière migration appliquée : **0017** (`when` = `1782700007000`, `set_logs.note`, plan 12). Rappel de la règle critique (`CLAUDE.md`) : `drizzle-kit generate` est cassé sur ce projet, les migrations s'écrivent **à la main** (fichier `.sql` + import dans `migrations.js` + entrée dans `meta/_journal.json` avec un `when` **strictement supérieur** au précédent) — et **toujours séparer plusieurs instructions par `--> statement-breakpoint`**, sinon seule la première s'exécute silencieusement (piège rencontré sur la migration 0014, voir CLAUDE.md).

## Contraintes transverses

- `npx tsc --noEmit` doit rester à **0 erreur** (`noUnusedLocals` actif).
- `Alert.alert` sur Android : **3 boutons maximum**, au-delà les derniers sont silencieusement supprimés.
- **Jamais** de test via `expo start --web` : vérification sur device/émulateur via Expo Go, ou typecheck + relecture de code en disant explicitement qu'aucun device n'a été utilisé.
