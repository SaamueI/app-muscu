import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { getUpdatePrefs, setUpdatePrefs } from '../src/db/settings';
import { getAppVersion } from '../src/utils/appVersion';
import { checkForUpdate } from '../src/utils/updateCheck';
import { showUpdateAvailableAlert } from '../src/utils/updateAlert';

const REPO_URL = 'https://github.com/SaamueI/app-muscu';

function formatCheckDate(iso: string | null): string {
  if (!iso) return 'Jamais';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ParametresScreen() {
  const [enabled, setEnabled] = useState(true);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getUpdatePrefs().then((prefs) => {
      setEnabled(prefs.enabled);
      setLastCheckAt(prefs.lastCheckAt);
    });
  }, []);

  const handleToggleEnabled = async (value: boolean) => {
    setEnabled(value);
    await setUpdatePrefs({ enabled: value });
  };

  const handleCheckNow = async () => {
    setChecking(true);
    const result = await checkForUpdate();
    const now = new Date().toISOString();
    setLastCheckAt(now);
    await setUpdatePrefs({ lastCheckAt: now });
    setChecking(false);

    if (result.status === 'up-to-date') {
      Alert.alert('À jour', `Tu es à jour (v${getAppVersion()}).`);
    } else if (result.status === 'update-available') {
      showUpdateAvailableAlert(result.latest);
    } else {
      Alert.alert(
        'Vérification impossible',
        'Impossible de vérifier les mises à jour. Vérifie ta connexion internet.'
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Mises à jour */}
      <View style={styles.section}>
        <Text style={styles.label}>Mises à jour</Text>

        <View style={styles.row}>
          <Text style={styles.rowText}>Version actuelle</Text>
          <Text style={styles.rowValue}>{getAppVersion()}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowText}>Vérifier automatiquement</Text>
          <Switch value={enabled} onValueChange={handleToggleEnabled} />
        </View>

        <View style={styles.row}>
          <Text style={styles.rowText}>Dernière vérification</Text>
          <Text style={styles.rowValue}>{formatCheckDate(lastCheckAt)}</Text>
        </View>

        <Pressable style={styles.checkBtn} onPress={handleCheckNow} disabled={checking}>
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkBtnText}>Vérifier maintenant</Text>
          )}
        </Pressable>
      </View>

      {/* À propos */}
      <View style={styles.section}>
        <Text style={styles.label}>À propos</Text>
        <View style={styles.row}>
          <Text style={styles.rowText}>Version</Text>
          <Text style={styles.rowValue}>{getAppVersion()}</Text>
        </View>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(REPO_URL)}>
          <Text style={styles.link}>Voir le dépôt GitHub</Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },

  section: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12,
    borderRadius: 12, padding: 14,
  },
  label: {
    fontSize: 13, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', marginBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  rowText: { fontSize: 15, color: '#333' },
  rowValue: { fontSize: 15, color: '#888' },

  checkBtn: {
    backgroundColor: '#007AFF', marginTop: 14,
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  checkBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  link: { fontSize: 15, color: '#007AFF', fontWeight: '500', paddingVertical: 9 },
});
