# 🏋️ Carnet de musculation

Application mobile (Android / iOS) de suivi d'entraînement en musculation, développée en solo avec **React Native** et **Expo**. Stockage 100% local (SQLite), pensée pour accompagner une séance de bout en bout : programmation, planification, exécution avec chronomètre, historique et export de données.

## ✨ Fonctionnalités

- **Catalogue d'exercices** — dataset de ~870 exercices (images incluses) + exercices personnalisés, variations, alternatives
- **Programmes** — séances → exercices → objectifs (répétitions, poids, RIR, tempo, supersets, mouvements unilatéraux)
- **Mésocycles** — plans d'entraînement sur plusieurs semaines avec objectifs détaillés par série, ancrés automatiquement sur le calendrier
- **Calendrier** — planification des séances, statut en temps réel (à venir / en cours / terminée)
- **Séance live** — chronomètre d'exécution et de repos, préremplissage des performances à partir de l'historique, bandeau de reprise après interruption
- **Export / import** XLSX et CSV des programmes et mésocycles, avec génération d'un **prompt LLM** copiable pour créer un programme à partir d'une simple description en langage naturel
- **Réconciliation d'exercices** — détection et fusion des doublons créés à l'import (matching français → anglais)
- **Unités kg / lb** configurables par exercice

## 🛠 Stack technique

| Outil | Rôle |
|---|---|
| [Expo](https://expo.dev) (SDK 54) + React Native | Application mobile cross-platform |
| [expo-router](https://docs.expo.dev/router/introduction/) | Navigation par fichiers |
| [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) + [Drizzle ORM](https://orm.drizzle.team/) | Base de données locale, typée |
| TypeScript | Typage statique sur tout le projet |
| xlsx-js-style | Export/import de classeurs Excel stylisés |

Toutes les données sont stockées **en local sur l'appareil** (aucun backend) — le choix d'une couche `src/db/` bien séparée du reste du code garde la porte ouverte à une synchronisation cloud future sans réécriture majeure.

## 📂 Structure du projet

```
app/                    # Écrans (expo-router)
  (tabs)/                 # Exercices, Programmes, Calendrier, Progression, Mésocycles
  exercices/ programmes/ mesocycles/ calendrier/ seance/

src/
  db/                    # Schéma Drizzle, migrations, helpers métier (mésocycles, séances)
  components/            # Composants réutilisables (timer, pickers, modales…)
  export/                # Export/import XLSX + CSV (sérialisation pure testable, pont DB, UI)
  utils/                 # Stores et helpers transverses

docs/                   # Documentation d'implémentation par phase
```

## 📱 Installer l'APK (Android)

Un APK autonome prêt à installer (pas besoin d'Expo Go ni de build) est disponible sur la page [Releases](https://github.com/SaamueI/app-muscu/releases/latest) — le télécharger sur le téléphone et l'installer en autorisant "sources inconnues".

## 🚀 Installation (développement)

```bash
git clone https://github.com/SaamueI/app-muscu.git
cd app-muscu
npm install
npx expo start --clear
```

Scanner le QR code avec l'app **Expo Go** (Android/iOS) pour lancer l'app sur un appareil, ou lancer un émulateur (`npm run android` / `npm run ios`).

## 🗄️ Base de données

Le schéma est défini avec Drizzle ORM (`src/db/schema.ts`) et versionné par migrations SQL (`src/db/migrations/`), appliquées automatiquement au démarrage de l'app — aucune configuration manuelle nécessaire.

## 📌 État du projet

Projet actif, développé de manière itérative par phases documentées dans [`docs/`](docs).

| Fonctionnalité | Statut |
|---|---|
| Catalogue d'exercices | ✅ |
| Programmes & objectifs | ✅ |
| Calendrier & planification | ✅ |
| Mésocycles & ancrage calendaire | ✅ |
| Séance live (timer, supersets, unilatéral) | ✅ |
| Export / import XLSX & CSV, prompt LLM, anti-doublons | ✅ |
| Onglet Progression (graphiques, records) | 🚧 |
| Chronomètre en arrière-plan (notification) | 🚧 |

## Auteur

Développé par [Samuel Gilot](https://github.com/SaamueI).
