import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { db } from '../../src/db';
import { programs } from '../../src/db/schema';
import { generateId } from '../../src/utils/generateId';

export default function NouveauProgrammeScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    const id = generateId();
    await db.insert(programs).values({
      id,
      name: name.trim(),
      description: description.trim() || null,
    });
    router.replace(`/programmes/${id}`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.label}>Nom *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ex : Push Pull Legs"
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Objectifs, fréquence, notes…"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <Pressable
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim()}
        >
          <Text style={styles.buttonText}>Créer le programme</Text>
        </Pressable>

        <Pressable style={styles.importButton} onPress={() => router.push('/programmes/import')}>
          <Text style={styles.importButtonText}>Importer depuis un fichier</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 90 },
  button: {
    backgroundColor: '#007AFF',
    margin: 12,
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  importButton: {
    marginHorizontal: 12,
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importButtonText: { color: '#007AFF', fontSize: 15, fontWeight: '600' },
});
