import { Redirect } from 'expo-router';

// Route racine « / ». Sans elle, le chemin initial résolu au démarrage d'un
// build standalone (muscuapp:///) ne correspond à aucune route et expo-router
// empile +not-found par-dessus les onglets (« Oops! this screen doesn't exist »).
// En dev via Expo Go le problème est invisible : l'URL initiale y est une chaîne
// vide, donc React Navigation garde simplement la route par défaut.
export default function Index() {
  return <Redirect href="/calendrier" />;
}
