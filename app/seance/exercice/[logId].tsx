import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import GlobalRestBanner from '../../../src/components/GlobalRestBanner';
import RestPresetPicker from '../../../src/components/RestPresetPicker';
import SetPerformanceModal from '../../../src/components/SetPerformanceModal';
import TimerDisplay from '../../../src/components/TimerDisplay';
import { db } from '../../../src/db';
import { exerciseLogs, exercises, setLogs } from '../../../src/db/schema';
import {
  deleteSetLog,
  getPreviousPerfs,
  getRestPresets,
  getSessionLive,
  getUserWeightUnit,
  markExerciseDone,
  saveSetLog,
  updateSetLog,
  type ExerciseLogEnriched,
  type PerfGroup,
  type SetLogData,
} from '../../../src/db/session';
import {
  getActiveSession,
  setActiveSession
} from '../../../src/utils/activeSessionStore';
import { formatTargets } from '../../../src/utils/formatTargets';
import { formatWeight } from '../../../src/utils/weightUtils';

type SetLogRow = typeof setLogs.$inferSelect;

type RestPreset = { id: string; seconds: number; sortOrder: number };

export default function ExerciceDetailLiveScreen() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const router = useRouter();

  const [enriched, setEnriched] = useState<ExerciseLogEnriched | null>(null);
  const [history, setHistory] = useState<PerfGroup[]>([]);
  const [presets, setPresets] = useState<RestPreset[]>([]);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [, setTick] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSetLog, setEditingSetLog] = useState<SetLogRow | null>(null);
  const autoFiredRef = useRef(false);

  // État local : ce que propose cet écran tant qu'il ne possède pas le timer
  // global (utilisé seulement quand cet exercice n'est pas l'exercice actif).
  const [localNextSetNumber, setLocalNextSetNumber] = useState(1);
  const [localIsUnilateral, setLocalIsUnilateral] = useState(false);
  const [localCurrentSide, setLocalCurrentSide] = useState<'L' | 'R' | null>(null);

  // ─── Chargement initial ───────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!logId) return;
    const [logRow] = await db
      .select({ log: exerciseLogs, exercise: exercises })
      .from(exerciseLogs)
      .innerJoin(exercises, eq(exerciseLogs.exerciseId, exercises.id))
      .where(eq(exerciseLogs.id, logId));
    if (!logRow) return;

    const liveData = await getSessionLive(logRow.log.workoutSessionId);
    const found = liveData?.exerciseLogs.find((el) => el.log.id === logId) ?? null;
    setEnriched(found);

    const perfs = await getPreviousPerfs(logRow.log.exerciseId, 5, logRow.log.workoutSessionId);
    setHistory(perfs);

    const ps = await getRestPresets();
    setPresets(ps);

    const userUnit = await getUserWeightUnit();
    const exUnit = logRow.exercise.weightUnit as 'kg' | 'lb' | null;
    setWeightUnit(exUnit ?? userUnit);

    setLocalNextSetNumber((found?.setLogs.length ?? 0) + 1);
  }, [logId]);

  // ─── Timer tick + auto-mode ───────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);

      const s = getActiveSession();
      if (
        s.activeExerciseLogId === logId &&
        s.timerPhase === 'rest' &&
        s.timerTargetSeconds != null &&
        s.timerMode === 'auto' &&
        !modalVisible
      ) {
        const elapsed = Math.floor((Date.now() - s.timerStartedAt) / 1000);
        if (elapsed >= s.timerTargetSeconds) {
          if (autoFiredRef.current) return;
          autoFiredRef.current = true;
          // Démarrer automatiquement la prochaine exécution
          setActiveSession({
            timerPhase: 'execution',
            timerStartedAt: Date.now(),
            timerTargetSeconds: getTargetExecutionSeconds(s.currentSetNumber),
          });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [logId, modalVisible]);

  // ─── Helpers d'objectifs ──────────────────────────────────────────────────

  function getTargetRestSeconds(setNumber: number): number | null {
    if (!enriched) return null;
    const setIdx = setNumber - 1;
    if (enriched.mesoSets.length > 0) {
      const ms = enriched.mesoSets[setIdx] ?? enriched.mesoSets[enriched.mesoSets.length - 1];
      return ms.targetRestSeconds ?? null;
    }
    return enriched.programExercise?.targetRestSeconds ?? null;
  }

  function getTargetExecutionSeconds(setNumber: number): number | null {
    if (!enriched) return null;
    const setIdx = setNumber - 1;
    if (enriched.mesoSets.length > 0) {
      const ms = enriched.mesoSets[setIdx] ?? enriched.mesoSets[enriched.mesoSets.length - 1];
      return ms.targetDurationSeconds ?? null;
    }
    return enriched.programExercise?.targetDurationSeconds ?? null;
  }

  function getCurrentMesoSet(setNumber: number) {
    if (!enriched) return null;
    const idx = setNumber - 1;
    if (enriched.mesoSets.length > 0) {
      return enriched.mesoSets[idx] ?? enriched.mesoSets[enriched.mesoSets.length - 1];
    }
    return null;
  }

  function getPrefillFromHistory(
    setNumber: number,
    side: 'L' | 'R' | null,
    isUnilateral: boolean
  ): SetLogRow | null {
    const last = history[0];
    if (!last || last.sets.length === 0) return null;
    const sideFilter = (sl: SetLogRow) =>
      isUnilateral ? sl.side === side : sl.side == null || sl.side === side;
    const candidates = last.sets.filter(sideFilter);
    if (candidates.length === 0) return null;
    const sameSetNumber = candidates.find((sl) => sl.setNumber === setNumber);
    if (sameSetNumber) return sameSetNumber;
    return candidates[candidates.length - 1];
  }

  // Série précédente de LA SÉANCE EN COURS (priorité sur l'historique des
  // séances passées, pour les séries après la première).
  function getPrefillFromCurrentSession(
    setNumber: number,
    side: 'L' | 'R' | null,
    isUnilateral: boolean
  ): SetLogRow | null {
    if (!enriched || setNumber <= 1) return null;
    const sideFilter = (sl: SetLogRow) =>
      isUnilateral ? sl.side === side : sl.side == null || sl.side === side;
    return enriched.setLogs.find((sl) => sl.setNumber === setNumber - 1 && sideFilter(sl)) ?? null;
  }

  // ─── Actions timer ────────────────────────────────────────────────────────

  const handleCommencer = () => {
    const s = getActiveSession();
    const wasActive = s.activeExerciseLogId === logId;
    const unilateral = wasActive ? s.isUnilateral : localIsUnilateral;
    const side = unilateral ? (wasActive ? (s.currentSide ?? 'L') : (localCurrentSide ?? 'L')) : null;
    const setNumber = wasActive ? s.currentSetNumber : localNextSetNumber;

    setActiveSession({
      activeExerciseLogId: logId,
      timerPhase: 'execution',
      timerStartedAt: Date.now(),
      timerTargetSeconds: getTargetExecutionSeconds(setNumber),
      isUnilateral: unilateral,
      currentSide: side,
      currentSetNumber: setNumber,
    });
    autoFiredRef.current = false;
  };

  const handleTerminer = () => {
    const s = getActiveSession();
    const executionSeconds = Math.floor((Date.now() - s.timerStartedAt) / 1000);
    const targetRest = getTargetRestSeconds(s.currentSetNumber);
    const lastPreset = s.lastRestPresets[logId] ?? null;
    const restTarget = targetRest ?? lastPreset;

    setActiveSession({
      timerPhase: 'rest',
      timerStartedAt: Date.now(),
      timerTargetSeconds: restTarget,
      lastExecutionSeconds: executionSeconds,
      restForExerciseName: enriched?.exercise.name ?? null,
    });
    autoFiredRef.current = false;
    setModalVisible(true);
  };

  const handleSelectPreset = (seconds: number) => {
    if (!logId) return;
    const s = getActiveSession();
    const wasActive = s.activeExerciseLogId === logId;
    const unilateral = wasActive ? s.isUnilateral : localIsUnilateral;
    const side = unilateral ? (wasActive ? (s.currentSide ?? 'L') : (localCurrentSide ?? 'L')) : null;
    const setNumber = wasActive ? s.currentSetNumber : localNextSetNumber;

    setActiveSession({
      activeExerciseLogId: logId,
      timerPhase: 'rest',
      timerStartedAt: wasActive && s.timerPhase === 'rest' ? s.timerStartedAt : Date.now(),
      timerTargetSeconds: seconds,
      lastRestPresets: { ...s.lastRestPresets, [logId]: seconds },
      restForExerciseName: enriched?.exercise.name ?? null,
      isUnilateral: unilateral,
      currentSide: side,
      currentSetNumber: setNumber,
    });
    autoFiredRef.current = false;
  };

  const handleSavePerf = async (data: SetLogData) => {
    if (!logId) return;
    const s = getActiveSession();

    await saveSetLog(
      logId,
      { ...data, executionSeconds: s.lastExecutionSeconds },
      s.currentSetNumber,
      s.currentSide ?? undefined
    );

    setModalVisible(false);
    setEditingSetLog(null);

    if (s.isUnilateral) {
      if (s.currentSide === 'L') {
        // L sauvé → changer le côté en R, continuer le repos
        setActiveSession({
          timerPhase: 'rest',
          timerStartedAt: s.timerStartedAt,
          timerTargetSeconds: s.timerTargetSeconds,
          currentSide: 'R',
          restForExerciseName: enriched?.exercise.name ?? null,
        });
        autoFiredRef.current = false;
      } else {
        // R sauvé → nouvelle série, retour à L, démarrer un nouveau repos
        const newRestTarget = getTargetRestSeconds(s.currentSetNumber) ?? (s.lastRestPresets[logId] ?? null);
        setActiveSession({
          timerPhase: 'rest',
          timerStartedAt: Date.now(),
          timerTargetSeconds: newRestTarget,
          currentSetNumber: s.currentSetNumber + 1,
          currentSide: 'L',
          lastExecutionSeconds: null,
          restForExerciseName: enriched?.exercise.name ?? null,
        });
        autoFiredRef.current = false;
      }
    } else {
      // Bilatéral : incrémenter, continuer le repos déjà en cours
      setActiveSession({
        timerPhase: 'rest',
        timerStartedAt: s.timerStartedAt,
        timerTargetSeconds: s.timerTargetSeconds,
        currentSetNumber: s.currentSetNumber + 1,
        lastExecutionSeconds: null,
        restForExerciseName: enriched?.exercise.name ?? null,
      });
      autoFiredRef.current = false;
    }

    load();
  };

  const handleEditSetLog = (sl: SetLogRow) => {
    setEditingSetLog(sl);
    setModalVisible(true);
  };

  const handleSaveEdit = async (data: SetLogData) => {
    if (!editingSetLog) return;
    await updateSetLog(editingSetLog.id, data);
    setModalVisible(false);
    setEditingSetLog(null);
    load();
  };

  const handleDeleteSetLog = (sl: SetLogRow) => {
    Alert.alert(
      'Supprimer la série',
      `Supprimer la série #${sl.setNumber ?? '?'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            // Pour unilatéral : supprimer aussi le partenaire L/R
            if (sl.side && enriched) {
              const partnerSide = sl.side === 'L' ? 'R' : 'L';
              const partner = enriched.setLogs.find(
                (x) => x.setNumber === sl.setNumber && x.side === partnerSide
              );
              if (partner) await deleteSetLog(partner.id);
            }
            await deleteSetLog(sl.id);
            const s = getActiveSession();
            if (s.activeExerciseLogId === logId) {
              setActiveSession({ currentSetNumber: Math.max(1, s.currentSetNumber - 1) });
            } else {
              setLocalNextSetNumber((n) => Math.max(1, n - 1));
            }
            load();
          },
        },
      ]
    );
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const s = getActiveSession();
  const isActive = s.activeExerciseLogId === logId;
  const phase = isActive ? s.timerPhase : 'idle';
  const effIsUnilateral = isActive ? s.isUnilateral : localIsUnilateral;
  const effCurrentSide = effIsUnilateral ? (isActive ? s.currentSide : localCurrentSide) : null;
  const effSetNumber = isActive ? s.currentSetNumber : localNextSetNumber;
  const targetRestSec = getTargetRestSeconds(effSetNumber);
  const hasRestTarget = targetRestSec != null;
  const lastUsedPreset = s.lastRestPresets[logId] ?? null;

  if (!enriched) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const isEditing = editingSetLog != null;
  const mesoSet = getCurrentMesoSet(effSetNumber);
  const histSet = isEditing
    ? null
    : getPrefillFromCurrentSession(effSetNumber, effCurrentSide, effIsUnilateral) ??
      getPrefillFromHistory(effSetNumber, effCurrentSide, effIsUnilateral);
  const prefillWeightKg =
    histSet?.weight ??
    mesoSet?.targetWeightMin ?? mesoSet?.targetWeightMax ??
    enriched.programExercise?.targetWeightMin ?? enriched.programExercise?.targetWeightMax ?? null;
  const prefillReps =
    histSet?.reps ??
    mesoSet?.targetRepsMin ?? mesoSet?.targetRepsMax ??
    enriched.programExercise?.targetRepsMin ?? enriched.programExercise?.targetRepsMax ?? null;
  const prefillRir =
    histSet?.rir ??
    mesoSet?.targetRirMin ?? mesoSet?.targetRirMax ??
    enriched.programExercise?.targetRirMin ?? enriched.programExercise?.targetRirMax ?? null;

  const modalKey = isEditing ? `edit-${editingSetLog!.id}` : `new-${s.currentSetNumber}-${s.currentSide ?? ''}`;
  const modalPrefillWeightKg = isEditing ? editingSetLog!.weight : prefillWeightKg;
  const modalPrefillReps = isEditing ? editingSetLog!.reps : prefillReps;
  const modalPrefillRir = isEditing ? editingSetLog!.rir : prefillRir;
  const modalPrefillPartialReps = isEditing ? editingSetLog!.partialReps : (histSet?.partialReps ?? null);
  const modalPrefillPdc = isEditing ? (editingSetLog!.pdc ?? false) : (histSet?.pdc ?? false);
  const modalSetNumber = isEditing ? (editingSetLog!.setNumber ?? s.currentSetNumber) : s.currentSetNumber;
  const modalSide = isEditing ? (editingSetLog!.side as 'L' | 'R' | null) : s.currentSide;

  const sideLabel = (side: 'L' | 'R' | null) =>
    side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '';

  return (
    <SafeAreaView style={styles.container}>
      <GlobalRestBanner excludeLogId={logId} />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Nom de l'exercice ── */}
        <View style={styles.exerciseNameRow}>
          <Text style={styles.exerciseName}>{enriched.exercise.name}</Text>
        </View>

        {/* ── Objectifs ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectifs</Text>
          {enriched.mesoSets.length > 0 ? (
            enriched.mesoSets.map((ms) => (
              <View key={ms.id} style={styles.objectifRow}>
                <Text style={styles.setNum}>Série {ms.setNumber}</Text>
                <Text style={styles.objectifText}>
                  {formatTargets({
                    targetRepsMin: ms.targetRepsMin,
                    targetRepsMax: ms.targetRepsMax,
                    targetWeightMin: ms.targetWeightMin,
                    targetWeightMax: ms.targetWeightMax,
                    targetRirMin: ms.targetRirMin,
                    targetRirMax: ms.targetRirMax,
                    targetRestSeconds: ms.targetRestSeconds,
                    targetDurationSeconds: ms.targetDurationSeconds,
                  }, { weightUnit })}
                </Text>
              </View>
            ))
          ) : enriched.programExercise ? (
            <Text style={styles.objectifText}>
              {formatTargets(enriched.programExercise, { weightUnit })}
            </Text>
          ) : (
            <Text style={styles.emptyText}>Aucun objectif</Text>
          )}
        </View>

        {/* ── Timer ── */}
        <View style={styles.section}>
          <View style={styles.timerHeader}>
            <Text style={styles.sectionTitle}>
              {phase === 'execution'
                ? `Série ${s.currentSetNumber}${sideLabel(s.currentSide)} en cours`
                : phase === 'rest'
                ? `Repos · série ${s.currentSetNumber}${sideLabel(s.currentSide)} à venir`
                : `Série ${effSetNumber}${sideLabel(effIsUnilateral ? effCurrentSide : null)}`}
            </Text>
            <View style={styles.unilateralRow}>
              <Text style={styles.smallLabel}>Unilatéral</Text>
              <Switch
                value={effIsUnilateral}
                onValueChange={(v) => {
                  if (isActive) {
                    setActiveSession({ isUnilateral: v, currentSide: v ? 'L' : null });
                  } else {
                    setLocalIsUnilateral(v);
                    setLocalCurrentSide(v ? 'L' : null);
                  }
                }}
                trackColor={{ true: '#007AFF' }}
              />
            </View>
          </View>

          {/* Chrono (visible en exécution et en repos) */}
          {phase !== 'idle' && (
            <TimerDisplay
              startedAt={s.timerStartedAt}
              targetSeconds={s.timerTargetSeconds}
              isRunning
            />
          )}

          {/* Toggle auto/manuel — toujours visible */}
          <View style={styles.modeRow}>
            <Text style={styles.smallLabel}>Mode :</Text>
            <Pressable
              style={[styles.modeChip, s.timerMode === 'auto' && styles.modeChipActive]}
              onPress={() => setActiveSession({ timerMode: 'auto' })}
            >
              <Text style={[styles.modeText, s.timerMode === 'auto' && styles.modeTextActive]}>Auto</Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, s.timerMode === 'manual' && styles.modeChipActive]}
              onPress={() => setActiveSession({ timerMode: 'manual' })}
            >
              <Text style={[styles.modeText, s.timerMode === 'manual' && styles.modeTextActive]}>Manuel</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() =>
                Alert.alert(
                  'Modes de repos',
                  'Auto : quand le décompte atteint 0, la prochaine série démarre automatiquement.\n\nManuel : le chrono continue en négatif, tu démarres la série quand tu es prêt en appuyant sur "Commencer maintenant".'
                )
              }
            >
              <Text style={styles.infoIcon}>ⓘ</Text>
            </Pressable>
          </View>

          {/* Preset repos (visible si pas de targetRestSeconds, en repos ou idle) */}
          {!hasRestTarget && (phase === 'rest' || phase === 'idle') && (
            <RestPresetPicker
              presets={presets}
              lastUsedSeconds={lastUsedPreset}
              onSelect={handleSelectPreset}
              onEditPresets={() => router.push('/seance/presets-repos' as any)}
            />
          )}

          {/* Boutons principaux */}
          <View style={styles.buttonRow}>
            {phase === 'idle' && (
              <Pressable style={styles.primaryBtn} onPress={handleCommencer}>
                <Text style={styles.primaryBtnText}>
                  Commencer série{sideLabel(effIsUnilateral ? effCurrentSide : null)}
                </Text>
              </Pressable>
            )}
            {phase === 'execution' && (
              <Pressable style={[styles.primaryBtn, styles.stopBtn]} onPress={handleTerminer}>
                <Text style={styles.primaryBtnText}>Terminer série</Text>
              </Pressable>
            )}
            {phase === 'rest' && (
              <>
                <Pressable
                  style={[styles.primaryBtn, styles.startEarlyBtn]}
                  onPress={handleCommencer}
                >
                  <Text style={styles.primaryBtnText}>
                    Commencer{sideLabel(s.isUnilateral ? s.currentSide : null)} maintenant
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, styles.doneBtn]}
                  onPress={async () => {
                    await markExerciseDone(logId!, true);
                    router.back();
                  }}
                >
                  <Text style={styles.primaryBtnText}>Terminer l'exercice ✓</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* ── Séries en cours ── */}
        {enriched.setLogs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Séries de cette séance</Text>
            {enriched.setLogs.map((sl, i) => {
              if (sl.side === 'R') return null; // affiché avec le L
              const partner = enriched.setLogs.find(
                (x) => x.setNumber === sl.setNumber && x.side === 'R'
              );
              const setNum = sl.setNumber ?? i + 1;
              return (
                <Pressable
                  key={sl.id}
                  style={styles.setRow}
                  onPress={() =>
                    Alert.alert(
                      `Série #${setNum}`,
                      undefined,
                      [
                        { text: 'Modifier', onPress: () => handleEditSetLog(sl) },
                        { text: 'Supprimer', style: 'destructive', onPress: () => handleDeleteSetLog(sl) },
                        { text: 'Annuler', style: 'cancel' },
                      ]
                    )
                  }
                >
                  <Text style={styles.setNum}>#{setNum}</Text>
                  <View style={styles.setDetails}>
                    <Text style={styles.setLine}>
                      {sl.side ? 'G : ' : ''}{formatSetLine(sl, weightUnit)}
                    </Text>
                    {partner && (
                      <Text style={[styles.setLine, styles.setLineSub]}>
                        D : {formatSetLine(partner, weightUnit)}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.editHint}>⋮</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Historique ── */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {history.map((group) => (
              <View key={group.sessionId} style={styles.histGroup}>
                <Text style={styles.histDate}>{formatDate(group.sessionDate)}</Text>
                {group.sets
                  .filter((sl) => sl.side !== 'R')
                  .map((sl, i) => {
                    const partner = group.sets.find(
                      (x) => x.setNumber === sl.setNumber && x.side === 'R'
                    );
                    const setNum = sl.setNumber ?? i + 1;
                    return (
                      <View key={sl.id} style={styles.setRow}>
                        <Text style={styles.setNum}>#{setNum}</Text>
                        <View style={styles.setDetails}>
                          <Text style={styles.setLine}>
                            {sl.side ? 'G : ' : ''}{formatSetLine(sl, weightUnit)}
                          </Text>
                          {partner && (
                            <Text style={[styles.setLine, styles.setLineSub]}>
                              D : {formatSetLine(partner, weightUnit)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SetPerformanceModal
        key={modalKey}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingSetLog(null); }}
        onSave={isEditing ? handleSaveEdit : handleSavePerf}
        weightUnit={weightUnit}
        exerciseId={enriched.exercise.id}
        setNumber={modalSetNumber}
        side={modalSide}
        prefillWeightKg={modalPrefillWeightKg}
        prefillReps={modalPrefillReps}
        prefillRir={modalPrefillRir}
        prefillPartialReps={modalPrefillPartialReps}
        prefillPdc={modalPrefillPdc}
      />
    </SafeAreaView>
  );
}

// ─── Helpers affichage ────────────────────────────────────────────────────────

function formatSetLine(sl: SetLogRow, unit: 'kg' | 'lb'): string {
  const parts: string[] = [];
  if (sl.weight != null) parts.push(formatWeight(sl.weight, unit));
  if (sl.reps != null) parts.push(`× ${sl.reps} reps`);
  if (sl.rir != null) parts.push(`RIR ${sl.rir}`);
  if (sl.pdc) parts.push('PDC');
  return parts.join(' · ') || '—';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  exerciseNameRow: { paddingHorizontal: 4 },
  exerciseName: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  loading: { textAlign: 'center', marginTop: 40, color: '#8E8E93' },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
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
  objectifRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  objectifText: { fontSize: 15, color: '#1C1C1E', flex: 1 },
  emptyText: { fontSize: 15, color: '#8E8E93' },
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unilateralRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smallLabel: { fontSize: 13, color: '#8E8E93' },
  modeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modeChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
  },
  modeChipActive: { backgroundColor: '#007AFF' },
  modeText: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  modeTextActive: { color: '#FFFFFF' },
  buttonRow: { marginTop: 4, gap: 8 },
  primaryBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  stopBtn: { backgroundColor: '#FF3B30' },
  startEarlyBtn: { backgroundColor: '#34C759' },
  doneBtn: { backgroundColor: '#8E8E93' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  infoIcon: { fontSize: 18, color: '#8E8E93', marginLeft: 2 },
  setRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  setNum: { fontSize: 14, fontWeight: '600', color: '#8E8E93', minWidth: 28 },
  setDetails: { flex: 1, gap: 2 },
  setLine: { fontSize: 15, color: '#1C1C1E' },
  setLineSub: { fontSize: 13, color: '#8E8E93' },
  editHint: { fontSize: 16, color: '#C7C7CC', paddingHorizontal: 4 },
  histGroup: { gap: 4 },
  histDate: { fontSize: 13, fontWeight: '600', color: '#007AFF', marginBottom: 2 },
});
