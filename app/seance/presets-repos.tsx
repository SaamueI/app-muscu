import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import DurationPickerModal from '../../src/components/DurationPickerModal';
import { addRestPreset, deleteRestPreset, getRestPresets } from '../../src/db/session';

type Preset = { id: string; seconds: number; sortOrder: number };

function secondsToLabel(s: number): string {
  if (s < 60) return `${s} secondes`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} minute${m > 1 ? 's' : ''}` : `${m} min ${rem} s`;
}

export default function PresetsReposScreen() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    const rows = await getRestPresets();
    setPresets(rows);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async (seconds: number) => {
    setPickerOpen(false);
    if (presets.some((p) => p.seconds === seconds)) {
      Alert.alert('Déjà présent', `${secondsToLabel(seconds)} fait déjà partie des raccourcis.`);
      return;
    }
    await addRestPreset(seconds);
    load();
  };

  const handleDelete = (preset: Preset) => {
    Alert.alert(`Supprimer ${secondsToLabel(preset.seconds)} ?`, '', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deleteRestPreset(preset.id);
          load();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Ces durées de repos apparaissent comme raccourcis pendant vos séances.
        </Text>

        {presets.map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.label}>{secondsToLabel(p.seconds)}</Text>
            <Pressable onPress={() => handleDelete(p)} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>Supprimer</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.addBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addText}>+ Ajouter une durée</Text>
        </Pressable>
      </ScrollView>
      <DurationPickerModal
        visible={pickerOpen}
        title="Nouveau raccourci de repos"
        confirmLabel="Ajouter"
        onClose={() => setPickerOpen(false)}
        onConfirm={handleAdd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  scroll: { padding: 16, gap: 12 },
  hint: { fontSize: 14, color: '#8E8E93', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: { flex: 1, fontSize: 16, color: '#1C1C1E' },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  deleteText: { color: '#FF3B30', fontSize: 15 },
  addBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  addText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
});
