import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import { useColorScheme } from '@/components/useColorScheme';
import { db } from '../src/db';
import migrations from '../src/db/migrations/migrations';
import { seedExercises } from '../src/db/seed';
import ActiveSessionBanner from '../src/components/ActiveSessionBanner';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const { success: migrationsSuccess, error: migrationsError } = useMigrations(
    db,
    migrations
  );

  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (migrationsError) throw migrationsError;
  }, [migrationsError]);

  useEffect(() => {
    if (!migrationsSuccess) return;
    seedExercises()
      .then(() => setSeeded(true))
      .catch((e) => { throw e; });
  }, [migrationsSuccess]);

  useEffect(() => {
    if (fontsLoaded && seeded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, seeded]);

  if (!fontsLoaded || !seeded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="exercices/[id]" options={{ title: 'Exercice' }} />
        <Stack.Screen name="exercices/nouveau" options={{ title: 'Nouvel exercice' }} />
        <Stack.Screen name="programmes/nouveau" options={{ title: 'Nouveau programme' }} />
        <Stack.Screen name="programmes/[id]" options={{ title: 'Programme' }} />
        <Stack.Screen name="programmes/[id]/modifier" options={{ title: 'Modifier le programme' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]" options={{ title: 'Séance' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]/modifier" options={{ title: 'Modifier la séance' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]/ajouter-exercice" options={{ title: 'Ajouter un exercice', presentation: 'modal' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]/ajouter-exercice/[exerciceId]" options={{ title: 'Aperçu' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]/exercises/[programExerciseId]" options={{ title: 'Exercice du programme' }} />
        <Stack.Screen name="programmes/[id]/sessions/[sessionId]/exercises/[programExerciseId]/ajouter-alternative" options={{ title: 'Exercice alternatif' }} />
        <Stack.Screen name="calendrier/[date]" options={{ title: '' }} />
        <Stack.Screen name="calendrier/event/nouveau" options={{ title: 'Nouvel événement' }} />
        <Stack.Screen name="calendrier/event/[eventId]/modifier" options={{ title: 'Modifier' }} />
        <Stack.Screen name="mesocycles/nouveau" options={{ title: 'Nouveau mésocycle' }} />
        <Stack.Screen name="mesocycles/[id]" options={{ title: 'Mésocycle' }} />
        <Stack.Screen name="mesocycles/[id]/modifier" options={{ title: 'Modifier le mésocycle' }} />
        <Stack.Screen name="mesocycles/[id]/ancrer" options={{ title: 'Ancrer au calendrier', presentation: 'modal' }} />
        <Stack.Screen name="mesocycles/[id]/sessions" options={{ title: 'Séances du mésocycle' }} />
        <Stack.Screen name="mesocycles/[id]/sessions/ajouter" options={{ title: 'Ajouter une séance', presentation: 'modal' }} />
        <Stack.Screen name="mesocycles/[id]/sessions/[mesoSessionId]" options={{ title: 'Séance' }} />
        <Stack.Screen name="mesocycles/[id]/sessions/[mesoSessionId]/modifier" options={{ title: 'Modifier la séance' }} />
        <Stack.Screen name="mesocycles/[id]/sessions/[mesoSessionId]/ajouter-exercice" options={{ title: 'Ajouter un exercice', presentation: 'modal' }} />
        <Stack.Screen name="mesocycles/[id]/sessions/[mesoSessionId]/exercises/[mesoExerciseId]" options={{ title: 'Exercice' }} />
        <Stack.Screen name="seance/[sessionId]" options={{ headerShown: false }} />
        <Stack.Screen name="seance/details/[sessionId]" options={{ title: 'Détails de la séance' }} />
        <Stack.Screen name="seance/details/[sessionId]/modifier" options={{ title: 'Modifier la séance' }} />
        <Stack.Screen name="seance/exercice/[logId]" options={{ title: 'Exercice' }} />
        <Stack.Screen name="seance/presets-repos" options={{ title: 'Temps de repos', presentation: 'modal' }} />
      </Stack>
      <ActiveSessionBanner />
    </ThemeProvider>
  );
}
