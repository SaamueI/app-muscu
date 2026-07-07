import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import SetPerformanceModal from '../../../../src/components/SetPerformanceModal';
import { setLogs } from '../../../../src/db/schema';
import {
  deleteSetLog,
  getSessionLive,
  getUserWeightUnit,
  renumberSetsAfterDelete,
  saveSetLog,
  swapSetNumbers,
  updateSetLog,
  type ExerciseLogEnriched,
  type SessionLiveData,
  type SetLogData,
} from '../../../../src/db/session';
import { formatSetLine } from '../../../../src/utils/formatSetLine';

type SetLogRow = typeof setLogs.$inferSelect;

type EditContext = {
  mode: 'single' | 'both';
  primary: SetLogRow;
  partner?: SetLogRow;
  exerciseId: string;
  unit: 'kg' | 'lb';
};

type AddContext = {
  exerciseLogId: string;
  exerciseId: string;
  unit: 'kg' | 'lb';
  setNumber: number;
  side: 'L' | 'R' | null;
  unilateral: boolean;
};

export default function SessionEditScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  const [data, setData] = useState<SessionLiveData | null>(null);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [modalVisible, setModalVisible] = useState(false);
  const [editContext, setEditContext] = useState<EditContext | null>(null);
  const [addContext, setAddContext] = useState<AddContext | null>(null);
  const [addPrefill, setAddPrefill] = useState<SetLogData | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const d = await getSessionLive(sessionId);
    setData(d);
    setWeightUnit(await getUserWeightUnit());
  }, [sessionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const closeModal = () => {
    setModalVisible(false);
    setEditContext(null);
    setAddContext(null);
    setAddPrefill(null);
  };

  // ─── Édition ──────────────────────────────────────────────────────────────

  const handleEditSingle = (sl: SetLogRow, enriched: ExerciseLogEnriched, unit: 'kg' | 'lb') => {
    setAddContext(null);
    setAddPrefill(null);
    setEditContext({ mode: 'single', primary: sl, exerciseId: enriched.exercise.id, unit });
    setModalVisible(true);
  };

  const handleEditBoth = (
    sl: SetLogRow,
    partner: SetLogRow,
    enriched: ExerciseLogEnriched,
    unit: 'kg' | 'lb'
  ) => {
    setAddContext(null);
    setAddPrefill(null);
    setEditContext({ mode: 'both', primary: sl, partner, exerciseId: enriched.exercise.id, unit });
    setModalVisible(true);
  };

  const handleSaveEdit = async (data: SetLogData) => {
    if (!editContext) return;
    await updateSetLog(editContext.primary.id, data);
    if (editContext.mode === 'both' && editContext.partner) {
      await updateSetLog(editContext.partner.id, data);
    }
    closeModal();
    load();
  };

  // ─── Ajout ────────────────────────────────────────────────────────────────

  const startAddSet = (enriched: ExerciseLogEnriched, unit: 'kg' | 'lb', unilateral: boolean) => {
    const maxSetNumber = enriched.setLogs.reduce((max, sl) => Math.max(max, sl.setNumber ?? 0), 0);
    setEditContext(null);
    setAddPrefill(null);
    setAddContext({
      exerciseLogId: enriched.log.id,
      exerciseId: enriched.exercise.id,
      unit,
      setNumber: maxSetNumber + 1,
      side: unilateral ? 'L' : null,
      unilateral,
    });
    setModalVisible(true);
  };

  const handleAddSet = (enriched: ExerciseLogEnriched, unit: 'kg' | 'lb') => {
    Alert.alert(
      'Nouvelle série',
      'Type de série ?',
      [
        { text: 'Bilatérale', onPress: () => startAddSet(enriched, unit, false) },
        { text: 'Unilatérale (G/D)', onPress: () => startAddSet(enriched, unit, true) },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const handleSaveAdd = async (data: SetLogData) => {
    if (!addContext) return;
    await saveSetLog(addContext.exerciseLogId, data, addContext.setNumber, addContext.side ?? undefined);
    if (addContext.unilateral && addContext.side === 'L') {
      setAddPrefill(data);
      setAddContext({ ...addContext, side: 'R' });
      load();
    } else {
      closeModal();
      load();
    }
  };

  const handleModalSave = (data: SetLogData) => {
    if (editContext) return handleSaveEdit(data);
    if (addContext) return handleSaveAdd(data);
  };

  // ─── Suppression ──────────────────────────────────────────────────────────

  const handleDeleteSetLog = (sl: SetLogRow, enriched: ExerciseLogEnriched) => {
    Alert.alert(
      'Supprimer la série',
      `Supprimer la série #${sl.setNumber ?? '?'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            if (sl.side) {
              const partnerSide = sl.side === 'L' ? 'R' : 'L';
              const partner = enriched.setLogs.find(
                (x) => x.setNumber === sl.setNumber && x.side === partnerSide
              );
              if (partner) await deleteSetLog(partner.id);
            }
            await deleteSetLog(sl.id);
            if (sl.setNumber != null) {
              await renumberSetsAfterDelete(enriched.log.id, sl.setNumber);
            }
            load();
          },
        },
      ]
    );
  };

  // ─── Réordonnancement ─────────────────────────────────────────────────────

  const handleMoveSet = async (enriched: ExerciseLogEnriched, setNumber: number, direction: -1 | 1) => {
    const target = setNumber + direction;
    const targetExists = enriched.setLogs.some((sl) => sl.setNumber === target);
    if (!targetExists) return;
    await swapSetNumbers(enriched.log.id, setNumber, target);
    load();
  };

  // ─── Menu d'une série (alertes limitées à 3 boutons, requis par Android) ──

  const openEditSideChoice = (
    sl: SetLogRow,
    otherSide: SetLogRow,
    enriched: ExerciseLogEnriched,
    unit: 'kg' | 'lb'
  ) => {
    Alert.alert(
      'Modifier la série',
      undefined,
      [
        { text: 'Ce côté seulement', onPress: () => handleEditSingle(sl, enriched, unit) },
        { text: 'Les deux côtés (identique)', onPress: () => handleEditBoth(sl, otherSide, enriched, unit) },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  const openSetMenu = (
    sl: SetLogRow,
    otherSide: SetLogRow | undefined,
    enriched: ExerciseLogEnriched,
    unit: 'kg' | 'lb'
  ) => {
    const sideLabel = sl.side === 'L' ? ' (Gauche)' : sl.side === 'R' ? ' (Droite)' : '';
    Alert.alert(
      `Série #${sl.setNumber ?? '?'}${sideLabel}`,
      undefined,
      [
        {
          text: 'Modifier',
          onPress: () => {
            if (sl.side && otherSide) {
              openEditSideChoice(sl, otherSide, enriched, unit);
            } else {
              handleEditSingle(sl, enriched, unit);
            }
          },
        },
        { text: 'Supprimer', style: 'destructive', onPress: () => handleDeleteSetLog(sl, enriched) },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  };

  if (!data) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Chargement…</Text>
      </View>
    );
  }

  const modalKey = editContext
    ? `edit-${editContext.mode}-${editContext.primary.id}`
    : addContext
    ? `add-${addContext.exerciseLogId}-${addContext.setNumber}-${addContext.side}`
    : 'none';

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {data.exerciseLogs.map((enriched) => {
          const unit = (enriched.exercise.weightUnit as 'kg' | 'lb' | null) ?? weightUnit;
          const setNumbers = Array.from(
            new Set(enriched.setLogs.map((sl) => sl.setNumber).filter((n): n is number => n != null))
          ).sort((a, b) => a - b);

          return (
            <View key={enriched.log.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{enriched.exercise.name}</Text>
              {enriched.setLogs.length === 0 ? (
                <Text style={styles.emptyText}>Aucune série enregistrée</Text>
              ) : (
                enriched.setLogs.map((sl, i) => {
                  if (sl.side === 'R') return null;
                  const partner = enriched.setLogs.find(
                    (x) => x.setNumber === sl.setNumber && x.side === 'R'
                  );
                  const setNum = sl.setNumber ?? i + 1;
                  const posIndex = setNumbers.indexOf(setNum);
                  const canMoveUp = posIndex > 0;
                  const canMoveDown = posIndex >= 0 && posIndex < setNumbers.length - 1;
                  return (
                    <View key={sl.id}>
                      <Pressable
                        style={styles.setRow}
                        onPress={() => openSetMenu(sl, partner, enriched, unit)}
                      >
                        <View style={styles.arrowCol}>
                          <Pressable
                            onPress={() => handleMoveSet(enriched, setNum, -1)}
                            disabled={!canMoveUp}
                            style={[styles.arrowBtn, !canMoveUp && styles.arrowBtnDisabled]}
                            hitSlop={6}
                          >
                            <Text style={styles.arrowText}>▲</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleMoveSet(enriched, setNum, 1)}
                            disabled={!canMoveDown}
                            style={[styles.arrowBtn, !canMoveDown && styles.arrowBtnDisabled]}
                            hitSlop={6}
                          >
                            <Text style={styles.arrowText}>▼</Text>
                          </Pressable>
                        </View>
                        <Text style={styles.setNum}>#{setNum}</Text>
                        <Text style={styles.setLine}>
                          {sl.side ? 'G : ' : ''}{formatSetLine(sl, unit)}
                        </Text>
                        <Text style={styles.editHint}>⋮</Text>
                      </Pressable>
                      {partner && (
                        <Pressable
                          style={[styles.setRow, styles.setRowSub]}
                          onPress={() => openSetMenu(partner, sl, enriched, unit)}
                        >
                          <View style={styles.arrowCol} />
                          <Text style={styles.setNum} />
                          <Text style={[styles.setLine, styles.setLineSub]}>
                            D : {formatSetLine(partner, unit)}
                          </Text>
                          <Text style={styles.editHint}>⋮</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })
              )}
              <Pressable style={styles.addBtn} onPress={() => handleAddSet(enriched, unit)}>
                <Text style={styles.addBtnText}>+ Ajouter une série</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <SetPerformanceModal
        key={modalKey}
        visible={modalVisible}
        onClose={closeModal}
        onSave={handleModalSave}
        weightUnit={editContext?.unit ?? addContext?.unit ?? weightUnit}
        exerciseId={editContext?.exerciseId ?? addContext?.exerciseId ?? ''}
        setNumber={editContext?.primary.setNumber ?? addContext?.setNumber ?? 1}
        side={editContext ? (editContext.mode === 'both' ? null : (editContext.primary.side as 'L' | 'R' | null)) : addContext?.side ?? null}
        prefillWeightKg={editContext?.primary.weight ?? addPrefill?.weight ?? null}
        prefillReps={editContext?.primary.reps ?? addPrefill?.reps ?? null}
        prefillRir={editContext?.primary.rir ?? addPrefill?.rir ?? null}
        prefillPartialReps={editContext?.primary.partialReps ?? addPrefill?.partialReps ?? null}
        prefillPdc={editContext ? (editContext.primary.pdc ?? false) : (addPrefill?.pdc ?? false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7' },
  loading: { color: '#8E8E93' },

  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: { fontSize: 14, color: '#8E8E93', fontStyle: 'italic' },

  setRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 },
  setRowSub: { paddingTop: 0 },
  arrowCol: { flexDirection: 'column', gap: 2, width: 18 },
  arrowBtn: { padding: 2 },
  arrowBtnDisabled: { opacity: 0.2 },
  arrowText: { fontSize: 11, color: '#555' },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93', minWidth: 28 },
  setLine: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  setLineSub: { fontSize: 13, color: '#8E8E93' },
  editHint: { fontSize: 16, color: '#C7C7CC', paddingHorizontal: 4 },

  addBtn: {
    marginTop: 4, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', backgroundColor: '#f0f7ff',
    borderWidth: 1, borderColor: '#c8e0ff', borderStyle: 'dashed',
  },
  addBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 14 },
});
