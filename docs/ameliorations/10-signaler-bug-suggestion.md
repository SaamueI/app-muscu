# 10 — Signaler un bug / envoyer une suggestion

## Problème

Aucun moyen, depuis l'app, de signaler un bug ou de proposer une amélioration. Les retours se perdent (« il faudra que je pense à noter que… ») et arrivent sans contexte technique : version de l'app, appareil, version d'Android.

## Décisions actées

> **Révision post-implémentation :** le plan ci-dessous (canal `mailto:`) a été implémenté puis remplacé — l'utilisateur voulait que le message se tape **directement dans l'app**, sans dépendre d'un client mail installé/configuré sur l'appareil. Nouveau mécanisme : formulaire in-app → relais **Web3Forms** (HTTPS → e-mail), documenté en fin de fichier. Décisions encore valables : deux entrées dans **Aide**, gabarit différent bug/suggestion, bloc diagnostic automatique, aucune donnée d'entraînement.

- ~~Canal unique : e-mail, via un lien `mailto:` prérempli ouvert dans le client mail de l'appareil.~~ Remplacé par un formulaire in-app (voir révision ci-dessus).
- Destinataire : **`muscu_app.unspoiled785@passinbox.com`** (alias dédié), configuré côté Web3Forms.
- Deux entrées dans la section **Aide** de `app/parametres.tsx` : « Signaler un bug » et « Envoyer une suggestion » — même mécanique, gabarit de message différent.
- Le message embarque un **bloc diagnostic** (version, plateforme, appareil) et **aucune donnée d'entraînement**.

**Dépendance** : l'écran `app/parametres.tsx` et son accès (icône ⚙ dans le header de l'onglet Calendrier) sont créés par le [point 09](09-verification-mise-a-jour.md). Si le point 10 est implémenté en premier, créer l'écran ici et le noter dans le doc 09.

## Marche à suivre

### 1. `src/utils/feedback.ts`

```ts
export const FEEDBACK_EMAIL = 'muscu_app.unspoiled785@passinbox.com';

export function buildDiagnostics(): string;
export async function sendFeedback(kind: 'bug' | 'suggestion'): Promise<boolean>;
```

**`buildDiagnostics()`** — bloc court et stable :

```
App : 1.0.1 (versionCode 2)
Plateforme : android 34
Appareil : Pixel 7
Date : 2026-08-26
```

Sources : `getAppVersion()` (créé au point 09), `Constants.expoConfig?.android?.versionCode`, `Platform.OS` + `Platform.Version`, `Constants.deviceName`. **Aucune donnée d'entraînement, aucune adresse personnelle.**

**`sendFeedback(kind)`** — construit l'URL :

```ts
const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
```

- Sujet : `[Carnet muscu] Bug — v1.0.1` ou `[Carnet muscu] Suggestion — v1.0.1`.
- Corps *bug* : « Ce que je faisais : » / « Ce qui s'est passé : » / « Ce qui aurait dû se passer : », puis un bloc `--- Diagnostic (ne pas modifier) ---`.
- Corps *suggestion* : « Ce que j'aimerais : » / « Pourquoi : », puis le même bloc diagnostic.

**Garder les gabarits courts** : certains clients mail tronquent les `mailto:` au-delà de ~2000 caractères une fois encodés.

Puis `Linking.openURL(url)` — le `Linking` de **`react-native`**, pas `expo-linking` — dans un `try / catch`, retour `true` / `false`.

### 2. Ne pas utiliser `Linking.canOpenURL`

Sur Android 11+, `canOpenURL('mailto:…')` renvoie **`false`** tant qu'une balise `<queries><intent>` correspondante n'est pas déclarée dans le manifeste — même quand un client mail est installé. Un garde `canOpenURL` bloquerait donc la fonctionnalité sur la plupart des appareils.

Faire l'`openURL` **directement** et ne traiter l'échec que dans le `catch`.

### 3. Repli si aucun client mail

Dans le `catch` (`sendFeedback` a renvoyé `false`) :

```
Alert.alert(
  'Aucune application e-mail',
  'Envoie ton retour à muscu_app.unspoiled785@passinbox.com',
  [ « Copier l'adresse », « OK » ]
)
```

« Copier l'adresse » via `expo-clipboard`, déjà installé et déjà utilisé pour le prompt LLM de la phase 12. Deux boutons : bien en dessous de la limite Android de 3.

### 4. Section Aide dans `app/parametres.tsx`

Deux lignes tappables, au style des autres lignes de réglage de l'écran :

| Libellé | Icône `MaterialIcons` | Action |
|---|---|---|
| Signaler un bug | `bug-report` | `sendFeedback('bug')` |
| Envoyer une suggestion | `lightbulb-outline` | `sendFeedback('suggestion')` |

### 5. Documentation

Ajouter l'adresse de contact au `README.md` (petite section « Retours / support »), pour les personnes qui lisent le dépôt sans avoir l'app installée.

## Points d'attention

- **L'adresse apparaîtra en clair dans un dépôt public.** C'est assumé : c'est précisément l'objet d'un alias dédié, jetable si nécessaire.
- **Un `mailto:` n'envoie rien tout seul** : il ouvre le brouillon, l'utilisateur relit et valide dans son client mail. Aucune donnée ne quitte l'appareil sans son geste — c'est aussi pour ça que ce canal est préférable à un envoi silencieux vers un backend.
- Ne pas préremplir le corps avec des logs applicatifs ou un dump de la DB : le message doit rester lisible et éditable dans un champ de saisie mobile.
- `Platform.Version` vaut le **niveau d'API** sur Android (34), pas « Android 14 » : le préciser dans le gabarit ou l'accepter tel quel, mais ne pas l'étiqueter « Android 34 ».
- Vérifier que `expo-clipboard` est bien importé au bon endroit — `noUnusedLocals` est actif, un import laissé sans usage casse le typecheck.

## Vérification (plan `mailto:` original — obsolète, voir révision ci-dessous)

- `npx tsc --noEmit` → 0 erreur.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Paramètres → « Signaler un bug » → le client mail s'ouvre avec destinataire, sujet et corps (gabarit + diagnostic) préremplis, sans envoyer.
  2. « Envoyer une suggestion » → même chose avec l'autre gabarit.
  3. Vérifier que le bloc diagnostic contient une version, une plateforme et un appareil plausibles.
  4. Sur un appareil / émulateur **sans client mail** → le message de repli s'affiche et « Copier l'adresse » met bien l'adresse dans le presse-papier.

## Révision : implémentation Web3Forms (remplace le `mailto:` ci-dessus)

**Pourquoi le changement :** l'utilisateur voulait pouvoir taper son message directement dans l'app, sans dépendre d'un client mail installé/configuré sur l'appareil. Un vrai envoi automatique depuis l'app nécessite un relais réseau — impossible d'embarquer les identifiants d'une vraie boîte mail dans le code (dépôt public, identifiants récupérables et exploitables pour spammer). [Web3Forms](https://web3forms.com) sert de relais HTTPS → e-mail via une **clé d'accès publique** (pas un secret : elle ne fait que router vers la boîte configurée sur leur dashboard, avec un quota côté serveur).

- `src/utils/feedback.ts` : `WEB3FORMS_ACCESS_KEY` (clé publique, en clair dans le code — assumé, même logique que `FEEDBACK_EMAIL` avant) + `WEB3FORMS_URL = 'https://api.web3forms.com/submit'`. `buildDiagnostics()` inchangée. `sendFeedback(kind, message)` prend maintenant le **message tapé par l'utilisateur** en paramètre, POST JSON (`access_key`, `subject`, `from_name`, `message` = texte utilisateur + bloc diagnostic), `AbortController` timeout 8 s (même pattern que `checkForUpdate`), ne lève jamais (erreur réseau/non-2xx/`success !== true` → `false`).
- `app/feedback.tsx` — nouvel écran modal (remplace l'ouverture directe du client mail) : `TextInput` multiline pour le message, bloc diagnostic affiché en lecture seule sous le champ (transparence — l'utilisateur voit ce qui part avec son message), bouton Envoyer avec indicateur de chargement. Accessible via `?kind=bug` / `?kind=suggestion` (query param, pas un segment dynamique — `kind` n'est pas une entité DB).
- `app/parametres.tsx` — les deux lignes de la section Aide naviguent maintenant vers `/feedback?kind=...` au lieu d'appeler `sendFeedback` directement ; le repli « aucun client mail » (`Linking.canOpenURL`, `expo-clipboard`) a disparu de cet écran.
- Échec réseau (`sendFeedback` renvoie `false`) : alerte sur `app/feedback.tsx` avec **« Copier le message »** (`expo-clipboard`) — le texte tapé n'est jamais effacé du champ, l'utilisateur peut réessayer ou le copier pour l'envoyer autrement.
- `app/_layout.tsx` : route `feedback` enregistrée en `presentation: 'modal'`.

### Vérification (révisée)

- `npx tsc --noEmit` → 0 erreur.
- Sur device (Expo Go — **jamais** `expo start --web`) :
  1. Paramètres → « Signaler un bug » → l'écran de saisie s'ouvre, bloc diagnostic visible et plausible (version, plateforme, appareil).
  2. Taper un message → Envoyer → alerte de confirmation, retour à Paramètres, e-mail bien reçu sur la boîte configurée côté Web3Forms.
  3. « Envoyer une suggestion » → même chemin.
  4. Mode avion → Envoyer → message d'échec explicite, texte tapé toujours présent dans le champ, « Copier le message » fonctionne.
