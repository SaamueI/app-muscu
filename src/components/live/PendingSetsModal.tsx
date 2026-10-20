import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { setLogs } from '../../db/schema';
import type { SetLogData } from '../../db/session';
import type { SetPrefill } from '../../utils/setPrefill';
import SetPerformanceForm from '../SetPerformanceForm';
import { PerformanceSheet } from '../SetPerformanceModal';

type SetLogRow = typeof setLogs.$inferSelect;

// Une série terminée à encoder (ligne set_logs is_pending), prête à afficher.
export type PendingItem = {
  row: SetLogRow;
  // Onglet : « Lateral raise · S2 G »
  tabLabel: string;
  // Titre du formulaire : « Lateral raise — Série 2 (Gauche) »
  title: string;
  exerciseId: string;
  weightUnit: 'kg' | 'lb';
  prefill: SetPrefill;
};

type Props = {
  visible: boolean;
  // Liste FIGÉE à l'ouverture (l'appelant la reconstruit depuis des ids) : une série encodée
  // reste dans les onglets, avec ✓ (row.isPending passé à false).
  items: PendingItem[];
  initialRowId?: string | null;
  onComplete: (rowId: string, data: SetLogData) => Promise<void>;
  onClose: () => void;
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Modal à onglets des séries « à encoder » (superset, amélioration 01b) : un onglet par
// série, dans l'ordre d'exécution. « Valider » enregistre l'onglet courant et passe au
// suivant non encodé ; le modal se ferme quand tout est encodé. Le fermer avant ne perd
// rien : les séries restantes restent « à encoder ».
export default function PendingSetsModal({ visible, items, initialRowId, onComplete, onClose }: Props) {
  const firstTodo = items.find((i) => i.row.isPending)?.row.id ?? items[0]?.row.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(
    initialRowId && items.some((i) => i.row.id === initialRowId) ? initialRowId : firstTodo
  );

  const handleSave = async (rowId: string, data: SetLogData) => {
    await onComplete(rowId, data);
    // Prochain onglet non encodé : d'abord après l'onglet courant, sinon depuis le début
    const idx = items.findIndex((i) => i.row.id === rowId);
    const todo = (i: PendingItem) => i.row.id !== rowId && i.row.isPending;
    const next = items.slice(idx + 1).find(todo) ?? items.slice(0, idx).find(todo);
    if (next) setActiveId(next.row.id);
    else onClose();
  };

  return (
    <PerformanceSheet visible={visible} onClose={onClose}>
      {items.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBar}
          contentContainerStyle={styles.tabBarContent}
        >
          {items.map((i) => {
            const active = i.row.id === activeId;
            const done = !i.row.isPending;
            return (
              <Pressable
                key={i.row.id}
                style={[styles.tab, done ? styles.tabDone : styles.tabPending, active && styles.tabActive]}
                onPress={() => setActiveId(i.row.id)}
              >
                <Text style={[styles.tabText, done ? styles.tabTextDone : styles.tabTextPending, active && styles.tabTextActive]}>
                  {done ? '✓ ' : ''}
                  {i.tabLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/*
        Cas d'école React : un composant démonté perd son état local. Si on n'affichait que
        le formulaire de l'onglet actif, changer d'onglet effacerait ce qui a été tapé.
        On garde donc TOUS les formulaires montés et on masque les inactifs (display: none).
      */}
      <View style={styles.forms}>
        {items.map((i) => (
          <View key={i.row.id} style={i.row.id === activeId ? styles.formVisible : styles.formHidden}>
            <SetPerformanceForm
              title={i.title}
              subtitle={i.row.executionSeconds != null ? `Exécution : ${formatSeconds(i.row.executionSeconds)}` : null}
              weightUnit={i.weightUnit}
              exerciseId={i.exerciseId}
              prefillWeightKg={i.row.isPending ? i.prefill.weightKg : i.row.weight}
              prefillReps={i.row.isPending ? i.prefill.reps : i.row.reps}
              prefillRir={i.row.isPending ? i.prefill.rir : i.row.rir}
              prefillPartialReps={i.row.isPending ? i.prefill.partialReps : i.row.partialReps}
              prefillPdc={i.row.isPending ? i.prefill.pdc : (i.row.pdc ?? false)}
              prefillNote={i.row.isPending ? null : i.row.note}
              saveLabel={items.length > 1 ? 'Valider et suivant' : 'Valider'}
              onSave={(data) => { handleSave(i.row.id, data); }}
            />
          </View>
        ))}
      </View>
    </PerformanceSheet>
  );
}

const styles = StyleSheet.create({
  tabBar: { flexGrow: 0, marginBottom: 12 },
  tabBarContent: { gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  tabPending: { backgroundColor: '#FFF4E5', borderColor: '#FFCC80' },
  tabDone: { backgroundColor: '#E8F8EE', borderColor: '#B7E4C7' },
  tabActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabTextPending: { color: '#C77700' },
  tabTextDone: { color: '#248A3D' },
  tabTextActive: { color: '#FFFFFF' },
  // flexShrink : laisse le ScrollView du formulaire défiler dans la hauteur max de la feuille
  forms: { flexShrink: 1 },
  formVisible: { flexShrink: 1 },
  formHidden: { display: 'none' },
});
