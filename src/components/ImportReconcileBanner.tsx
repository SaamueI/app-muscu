// Bannière affichée en haut des écrans de détail méso/programme quand le dernier
// import a créé des exercices personnalisés (phase 12, solution 2). Propose
// d'ouvrir l'écran de réconciliation pour les remplacer par des exercices
// existants. Ne rend rien si rien n'est à réconcilier pour cet écran.

import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { peekImportReconcile } from '../utils/importReconcileStore';

export default function ImportReconcileBanner({ targetId }: { targetId: string }) {
  const router = useRouter();
  const [count, setCount] = useState(0);

  // Le store est module-level (non réactif) : on le relit à chaque focus, ce qui
  // masque la bannière une fois la réconciliation terminée/passée (store vidé).
  useFocusEffect(
    useCallback(() => {
      const s = peekImportReconcile();
      setCount(s && s.targetId === targetId ? s.createdExercises.length : 0);
    }, [targetId])
  );

  if (count === 0) return null;

  return (
    <Pressable style={styles.banner} onPress={() => router.push('/exercices/reconcilier')}>
      <View style={styles.textCol}>
        <Text style={styles.title}>
          {count} nouvel{count > 1 ? 'x' : ''} exercice{count > 1 ? 's' : ''} personnalisé
          {count > 1 ? 's' : ''} créé{count > 1 ? 's' : ''}
        </Text>
        <Text style={styles.subtitle}>
          Vérifier s'ils font doublon avec des exercices existants →
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  textCol: { gap: 3 },
  title: { fontSize: 14, fontWeight: '700', color: '#9A3412' },
  subtitle: { fontSize: 13, color: '#B45309' },
});
