// Écran de réconciliation post-import (phase 12, solution 2).
// Pour chaque exercice personnalisé créé au dernier import, propose des
// exercices existants ressemblants (matcher FR→EN + fuzzy) et permet de
// remplacer le doublon, d'en choisir une variante, ou de le garder.
//
// Les décisions restent en état LOCAL jusqu'à « Terminer » : rien n'est écrit en
// DB avant, ce qui rend « Annuler » trivial et sûr (sinon remapExercise aurait
// déjà supprimé le custom). Générique méso/programme.

import { eq } from 'drizzle-orm';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ExercisePicker from '../../src/components/ExercisePicker';
import { db } from '../../src/db';
import { remapExercise } from '../../src/db/exerciseMerge';
import { exercises } from '../../src/db/schema';
import { suggestMatches, type CatalogEntry } from '../../src/export/core/exerciseMatch';
import {
  clearImportReconcile,
  peekImportReconcile,
} from '../../src/utils/importReconcileStore';

type Decision =
  | { kind: 'pending' }
  | { kind: 'replace'; target: CatalogEntry; variation: string | null }
  | { kind: 'keep' };

type Item = { id: string; name: string; decision: Decision };

type VariationState = {
  itemId: string;
  target: CatalogEntry;
  variations: string[];
  current: string | null;
};

export default function ReconcileScreen() {
  const router = useRouter();
  // Instantané du store pris une seule fois (le store est vidé à la sortie).
  const [snapshot] = useState(() => peekImportReconcile());
  const [items, setItems] = useState<Item[]>(
    () =>
      snapshot?.createdExercises.map((e) => ({
        ...e,
        decision: { kind: 'pending' } as Decision,
      })) ?? []
  );
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [variation, setVariation] = useState<VariationState | null>(null);
  const [variationInput, setVariationInput] = useState('');
  const [applying, setApplying] = useState(false);

  // Catalogue = tous les exercices SAUF ceux qu'on est en train de réconcilier.
  useEffect(() => {
    const createdIds = new Set(snapshot?.createdExercises.map((e) => e.id) ?? []);
    db.select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .then((rows) => setCatalog(rows.filter((r) => !createdIds.has(r.id))))
      .catch(() => setCatalog([]));
  }, [snapshot]);

  const suggestionsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof suggestMatches>>();
    if (!catalog) return map;
    for (const it of items) {
      if (it.decision.kind === 'pending') {
        map.set(it.id, suggestMatches(it.name, catalog));
      }
    }
    return map;
  }, [catalog, items]);

  const setDecision = (itemId: string, decision: Decision) => {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, decision } : it)));
  };

  const chooseReplace = (itemId: string, target: CatalogEntry) => {
    setDecision(itemId, { kind: 'replace', target, variation: null });
    setPickerFor(null);
  };

  const showExercise = (id: string) => router.push(`/exercices/${id}`);

  // Appui long sur une suggestion : menu → afficher le détail de l'exercice.
  const suggestionMenu = (s: CatalogEntry) => {
    Alert.alert(s.name, undefined, [
      { text: "Afficher l'exercice", onPress: () => showExercise(s.id) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const openVariation = async (item: Item) => {
    if (item.decision.kind !== 'replace') return;
    const target = item.decision.target;
    let variations: string[] = [];
    try {
      const [row] = await db
        .select({ variations: exercises.variations })
        .from(exercises)
        .where(eq(exercises.id, target.id));
      variations = ((row?.variations as string[] | null) ?? []).filter(Boolean);
    } catch {
      variations = [];
    }
    setVariationInput('');
    setVariation({ itemId: item.id, target, variations, current: item.decision.variation });
  };

  const applyVariation = (value: string | null) => {
    if (!variation) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === variation.itemId && it.decision.kind === 'replace'
          ? { ...it, decision: { ...it.decision, variation: value } }
          : it
      )
    );
    setVariation(null);
  };

  const finish = async () => {
    if (applying) return;
    setApplying(true);
    try {
      for (const it of items) {
        if (it.decision.kind === 'replace') {
          await remapExercise(it.id, it.decision.target.id, it.decision.variation);
        }
      }
      clearImportReconcile();
      router.back();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : String(e));
      setApplying(false);
    }
  };

  if (!snapshot || items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Aucun exercice à réconcilier.</Text>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() => {
            clearImportReconcile();
            router.back();
          }}
        >
          <Text style={styles.btnPrimaryText}>Fermer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Ces exercices ont été créés à l'import faute de correspondance exacte. Remplace ceux qui
          font doublon avec un exercice existant (appui long sur une suggestion pour l'afficher), ou
          garde-les tels quels.
        </Text>

        {items.map((item) => {
          // ── Décision : remplacer ──────────────────────────────────────────
          if (item.decision.kind === 'replace') {
            const { target, variation: chosen } = item.decision;
            return (
              <View key={item.id} style={[styles.card, styles.cardDone]}>
                <Text style={styles.doneText}>
                  « {item.name} » → {target.name}
                </Text>
                {chosen ? <Text style={styles.variationLabel}>Variante : {chosen}</Text> : null}
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.btn, styles.btnSecondary, styles.actionBtn]}
                    onPress={() => openVariation(item)}
                  >
                    <Text style={styles.btnSecondaryText}>{chosen ? 'Variante ✎' : 'Variante'}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnSecondary, styles.actionBtn]}
                    onPress={() => showExercise(target.id)}
                  >
                    <Text style={styles.btnSecondaryText}>Afficher</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, styles.btnGhost, styles.actionBtn]}
                    onPress={() => setDecision(item.id, { kind: 'pending' })}
                  >
                    <Text style={styles.btnGhostText}>Annuler</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          // ── Décision : garder ─────────────────────────────────────────────
          if (item.decision.kind === 'keep') {
            return (
              <View key={item.id} style={[styles.card, styles.cardDone]}>
                <Text style={styles.keptText}>« {item.name} » gardé tel quel</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[styles.btn, styles.btnGhost, styles.actionBtn]}
                    onPress={() => setDecision(item.id, { kind: 'pending' })}
                  >
                    <Text style={styles.btnGhostText}>Annuler</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          // ── En attente : suggestions + actions ────────────────────────────
          const suggestions = suggestionsById.get(item.id) ?? [];
          return (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardName}>{item.name}</Text>
              {catalog === null ? (
                <ActivityIndicator style={{ marginVertical: 8 }} />
              ) : suggestions.length > 0 ? (
                <View style={styles.suggestions}>
                  {suggestions.map((s) => (
                    <Pressable
                      key={s.id}
                      style={styles.suggestChip}
                      onPress={() => chooseReplace(item.id, s)}
                      onLongPress={() => suggestionMenu(s)}
                    >
                      <Text style={styles.suggestChipText}>{s.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={styles.noSuggest}>Aucune suggestion automatique.</Text>
              )}

              <View style={styles.actionRow}>
                <Pressable
                  style={[styles.btn, styles.btnSecondary, styles.actionBtn]}
                  onPress={() => setPickerFor(item.id)}
                >
                  <Text style={styles.btnSecondaryText}>Chercher…</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnGhost, styles.actionBtn]}
                  onPress={() => setDecision(item.id, { kind: 'keep' })}
                >
                  <Text style={styles.btnGhostText}>Garder tel quel</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.btn, styles.btnPrimary, applying && styles.btnDisabled]}
          onPress={finish}
          disabled={applying}
        >
          {applying ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.btnPrimaryText}>Application…</Text>
            </View>
          ) : (
            <Text style={styles.btnPrimaryText}>Terminer</Text>
          )}
        </Pressable>
      </View>

      {/* Recherche manuelle dans le catalogue */}
      <Modal visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Choisir l'exercice existant</Text>
          <Pressable onPress={() => setPickerFor(null)}>
            <Text style={styles.modalClose}>Annuler</Text>
          </Pressable>
        </View>
        <ExercisePicker
          cardIndicator="chevron"
          onSelect={(ex) => {
            if (pickerFor) chooseReplace(pickerFor, { id: ex.id, name: ex.name });
          }}
          onCreateNew={() => setPickerFor(null)}
        />
      </Modal>

      {/* Sélection d'une variante de l'exercice de remplacement */}
      <Modal visible={variation !== null} animationType="slide" onRequestClose={() => setVariation(null)}>
        {variation && (
          <>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Variante — {variation.target.name}</Text>
              <Pressable onPress={() => setVariation(null)}>
                <Text style={styles.modalClose}>Fermer</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.variationContent}>
              <Pressable
                style={[styles.variationRow, variation.current == null && styles.variationRowActive]}
                onPress={() => applyVariation(null)}
              >
                <Text style={styles.variationRowText}>Aucune variante</Text>
              </Pressable>
              {variation.variations.map((v) => (
                <Pressable
                  key={v}
                  style={[styles.variationRow, variation.current === v && styles.variationRowActive]}
                  onPress={() => applyVariation(v)}
                >
                  <Text style={styles.variationRowText}>{v}</Text>
                </Pressable>
              ))}

              <Text style={styles.variationCustomLabel}>Variante personnalisée</Text>
              <View style={styles.variationCustomRow}>
                <TextInput
                  style={styles.variationInput}
                  placeholder="Ex. prise serrée"
                  value={variationInput}
                  onChangeText={setVariationInput}
                />
                <Pressable
                  style={[styles.btn, styles.btnSecondary, styles.variationAddBtn, !variationInput.trim() && styles.btnDisabled]}
                  disabled={!variationInput.trim()}
                  onPress={() => applyVariation(variationInput.trim())}
                >
                  <Text style={styles.btnSecondaryText}>Utiliser</Text>
                </Pressable>
              </View>
            </ScrollView>
          </>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 12, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: '#f2f2f7' },
  emptyText: { fontSize: 15, color: '#555' },

  intro: { fontSize: 13, color: '#555', lineHeight: 19 },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10 },
  cardDone: { backgroundColor: '#f0f7f0' },
  cardName: { fontSize: 16, fontWeight: '700', color: '#111' },
  doneText: { fontSize: 14, color: '#1B7A34', fontWeight: '600' },
  variationLabel: { fontSize: 13, color: '#1B7A34' },
  keptText: { fontSize: 14, color: '#888' },

  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    backgroundColor: '#eef4ff',
    borderWidth: 1,
    borderColor: '#c8e0ff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestChipText: { color: '#0055CC', fontSize: 14, fontWeight: '600' },
  noSuggest: { fontSize: 13, color: '#999', fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10 },

  footer: { padding: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0', backgroundColor: '#fff' },

  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnPrimary: { backgroundColor: '#007AFF' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnSecondary: { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#e0e0e0' },
  btnSecondaryText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: '#888', fontWeight: '600', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingTop: 56,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 12 },
  modalClose: { fontSize: 15, color: '#007AFF' },

  variationContent: { padding: 12, gap: 8 },
  variationRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  variationRowActive: { borderColor: '#007AFF', backgroundColor: '#e8f0fe' },
  variationRowText: { fontSize: 15, color: '#222' },
  variationCustomLabel: {
    fontSize: 12, fontWeight: '600', color: '#888',
    textTransform: 'uppercase', marginTop: 12, marginBottom: 2,
  },
  variationCustomRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  variationInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  variationAddBtn: { paddingHorizontal: 16, paddingVertical: 10 },
});
