import { eq } from 'drizzle-orm';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { db } from '../../../src/db';
import { anchorMesocycle, unanchorMesocycle } from '../../../src/db/meso';
import { mesocycles } from '../../../src/db/schema';
import { WeekPickerField } from '../../../src/components/WeekPickerField';
import { dateToIsoWeek, isoWeekToMonday, toDateStr } from '../../../src/utils/dateUtils';

type Mesocycle = typeof mesocycles.$inferSelect;

export default function AncrerMesocycleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [meso, setMeso] = useState<Mesocycle | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(() => dateToIsoWeek(new Date()));
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.select().from(mesocycles).where(eq(mesocycles.id, id)).then(([m]) => {
      if (m) {
        setMeso(m);
        if (m.startDate) {
          const [y, mo, d] = m.startDate.split('-').map(Number);
          setSelectedWeek(dateToIsoWeek(new Date(y, mo - 1, d)));
        }
      }
      setLoaded(true);
    });
  }, [id]);

  const isAnchored = !!meso?.startDate;

  const handleAnchor = async () => {
    if (!id || busy) return;
    setBusy(true);
    const monday = isoWeekToMonday(selectedWeek);
    await anchorMesocycle(id, toDateStr(monday));
    setBusy(false);
    router.back();
  };

  const handleUnanchor = () => {
    if (!id) return;
    Alert.alert(
      'Désancrer le mésocycle',
      'Les séances planifiées non commencées seront retirées du calendrier. Les séances déjà commencées ou terminées resteront visibles dans leur historique.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désancrer',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            await unanchorMesocycle(id);
            setBusy(false);
            router.back();
          },
        },
      ]
    );
  };

  if (!loaded || !meso) {
    return <View style={styles.center}><Text>Chargement…</Text></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.label}>Statut</Text>
        {isAnchored ? (
          <Text style={styles.statusAnchored}>
            Ancré · la semaine 1 commence le {meso.startDate}
          </Text>
        ) : (
          <Text style={styles.statusUnanchored}>Non ancré</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>
          {isAnchored ? 'Changer la semaine de départ' : 'Semaine de départ (semaine 1)'}
        </Text>
        <WeekPickerField value={selectedWeek} onChange={setSelectedWeek} />
      </View>

      <Pressable style={styles.anchorBtn} onPress={handleAnchor} disabled={busy}>
        <Text style={styles.anchorBtnText}>{isAnchored ? 'Ré-ancrer' : 'Ancrer'}</Text>
      </Pressable>

      {isAnchored && (
        <Pressable style={styles.unanchorBtn} onPress={handleUnanchor} disabled={busy}>
          <Text style={styles.unanchorBtnText}>Désancrer</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, borderRadius: 12, padding: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', marginBottom: 8 },
  statusAnchored: { fontSize: 15, color: '#34C759', fontWeight: '600' },
  statusUnanchored: { fontSize: 15, color: '#888' },
  anchorBtn: { backgroundColor: '#007AFF', marginHorizontal: 12, marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  anchorBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  unanchorBtn: { marginHorizontal: 12, marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#FF3B30' },
  unanchorBtnText: { color: '#FF3B30', fontWeight: '700', fontSize: 16 },
});
