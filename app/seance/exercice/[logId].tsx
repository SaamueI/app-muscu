import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import ExercisePicker from '../../../src/components/ExercisePicker';
import GlobalRestBanner from '../../../src/components/GlobalRestBanner';
import ExerciseInfoPanel from '../../../src/components/live/ExerciseInfoPanel';
import ObjectivesList from '../../../src/components/live/ObjectivesList';
import SetLogList from '../../../src/components/live/SetLogList';
import VariationPickerModal from '../../../src/components/live/VariationPickerModal';
import RestPresetPicker from '../../../src/components/RestPresetPicker';
import SetPerformanceModal from '../../../src/components/SetPerformanceModal';
import TimerDisplay from '../../../src/components/TimerDisplay';
import { exercises, setLogs } from '../../../src/db/schema';
import {
  addVariationToExercise,
  deleteSetLog,
  markExerciseDone,
  renumberSetsAfterDelete,
  saveSetLog,
  setExerciseLogVariation,
  swapExerciseLog,
  updateSetLog,
  type SetLogData,
} from '../../../src/db/session';
import {
  getActiveSession,
  moveActiveExerciseLog,
  setActiveSession
} from '../../../src/utils/activeSessionStore';
import {
  computeProgress,
  fixedPlannedSets,
  getEffectiveRest,
  isUnilateralHint,
} from '../../../src/utils/exerciseProgress';
import { getEffectiveVariation } from '../../../src/utils/exerciseSwap';
import {
  computePrefill,
  getTargetExecutionSeconds as targetExecutionSeconds,
  getTargetRestSeconds as targetRestSeconds,
} from '../../../src/utils/setPrefill';
import { useExerciseLiveData } from '../../../src/utils/useExerciseLiveData';
import { useSuspendAutoStart } from '../../../src/utils/useSessionTimer';

type SetLogRow = typeof setLogs.$inferSelect;

export default function ExerciceDetailLiveScreen() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const router = useRouter();

  // Chargement partagé avec l'écran superset (src/utils/useExerciseLiveData.ts)
  const { enriched, alternatives, history, presets, weightUnit, chain, defaultFirstSide, reload } =
    useExerciseLiveData(logId);
  const [, setTick] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSetLog, setEditingSetLog] = useState<SetLogRow | null>(null);
  // Remplacement d'exercice / variante (amélioration 14)
  const [showSwapPicker, setShowSwapPicker] = useState(false);
  const [showVariationPicker, setShowVariationPicker] = useState(false);
  // Le pré-réglage « Unilatéral » ne s'applique qu'une fois par ouverture de l'écran,
  // sinon il écraserait le choix manuel de l'utilisateur à chaque retour sur l'écran.
  const hintAppliedRef = useRef(false);

  // Toggle « Unilatéral » tant que cet exercice n'est pas l'exercice actif du timer
  // global ; quand il l'est, la valeur vit dans le store (activeSessionStore).
  const [localIsUnilateral, setLocalIsUnilateral] = useState(false);

  // ─── Chargement initial ───────────────────────────────────────────────────

  const load = useCallback(async () => {
    const loaded = await reload();
    if (!loaded || !logId) return;

    // Pré-réglage du toggle « Unilatéral » (une fois par ouverture) : choix déjà fait sur
    // un autre écran (superset), sinon variante prévue « unilatéral », ou séries G/D déjà
    // vues (cette séance + dernière séance).
    if (!hintAppliedRef.current) {
      hintAppliedRef.current = true;
      if (getActiveSession().activeExerciseLogId !== logId) {
        const found = loaded.enriched;
        const variation = found ? getEffectiveVariation(found) : null;
        setLocalIsUnilateral(
          getActiveSession().unilateralByLog[logId] ??
            isUnilateralHint({
              variation,
              lastPerf: [...(found?.setLogs ?? []), ...(loaded.history[0]?.sets ?? [])],
            })
        );
      }
    }
  }, [reload, logId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Timer tick ───────────────────────────────────────────────────────────
  // Le démarrage auto en fin de repos est fait par le minuteur GLOBAL (useAutoStartTicker,
  // app/_layout.tsx) : ici on ne fait que rafraîchir l'affichage chaque seconde.

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useSuspendAutoStart(modalVisible || showSwapPicker || showVariationPicker);

  // ─── Helpers d'objectifs ──────────────────────────────────────────────────

  const getTargetRestSeconds = (setNumber: number): number | null =>
    enriched ? targetRestSeconds(enriched, setNumber) : null;

  const getTargetExecutionSeconds = (setNumber: number): number | null =>
    enriched ? targetExecutionSeconds(enriched, setNumber) : null;

  // ─── Avancement : dérivé des séries enregistrées, aucun compteur à la main ─

  const s = getActiveSession();
  const isActive = s.activeExerciseLogId === logId;
  const phase = isActive ? s.timerPhase : 'idle';
  const toggleUnilateral = isActive ? s.isUnilateral : localIsUnilateral;
  const loggedSets = enriched?.setLogs ?? [];
  // Séries prévues : méso = une ligne par série ; programme = seulement si N fixe
  const plannedSetCount = enriched
    ? enriched.mesoSets.length > 0
      ? enriched.mesoSets.length
      : fixedPlannedSets(enriched.programExercise?.targetSetsMin, enriched.programExercise?.targetSetsMax)
    : 0;
  // Côté de départ : choix fait sur cet écran, sinon réglage Paramètres
  const firstSide = s.startSideByLog[logId ?? ''] ?? defaultFirstSide;
  const progress = computeProgress({
    setLogs: loggedSets,
    plannedSetCount,
    isUnilateral: toggleUnilateral,
    firstSide,
    startSetNumber: chain.startSetNumber,
  });
  const effSetNumber = progress.next.setNumber;
  const effCurrentSide = progress.next.side;
  // Série à moitié faite (un côté enregistré) : on ne change pas de mode en cours de route.
  const halfDone = loggedSets.some((l) => l.setNumber === effSetNumber);
  const effIsUnilateral = toggleUnilateral || halfDone;
  const halveRest = effIsUnilateral && (s.halveRestByLog[logId ?? ''] ?? false);
  const restOverride = s.restOverrideByLog[logId ?? ''] ?? null;
  // Le repos qui s'applique est celui de la série qu'on vient de finir, pas de la suivante.
  const restSetNumber = phase === 'rest' ? s.currentSetNumber : effSetNumber;
  // Prochaine série publiée pour le minuteur global — seulement par l'écran qui possède le
  // chrono, et seulement si la série qu'on vient de terminer est enregistrée : sinon
  // (modal fermé sans valider) « la prochaine » serait cette même série, et on la relancerait.
  if (isActive && logId) {
    const finishedSaved =
      phase !== 'rest' ||
      loggedSets.some((l) => l.setNumber === s.currentSetNumber && (l.side ?? null) === (s.currentSide ?? null));
    const next = finishedSaved
      ? {
          logId,
          setNumber: effSetNumber,
          side: effCurrentSide,
          execSeconds: getTargetExecutionSeconds(effSetNumber),
          superset: false,
        }
      : null;
    const prev = s.autoNext;
    const changed =
      (prev == null) !== (next == null) ||
      (prev && next && (prev.logId !== next.logId || prev.setNumber !== next.setNumber || prev.side !== next.side || prev.execSeconds !== next.execSeconds));
    if (changed) setActiveSession({ autoNext: next });
  }

  const refresh = () => setTick((t) => t + 1);

  // Repos en cours : quand le choix de repos change, le compte à rebours s'ajuste
  // (même timerStartedAt). Hors repos, rien à recalculer.
  const retargetRunningRest = (override: number | null, halve: boolean) => {
    if (!isActive || getActiveSession().timerPhase !== 'rest') return {};
    return {
      timerTargetSeconds: getEffectiveRest({
        override,
        target: getTargetRestSeconds(restSetNumber),
        halve,
      }),
      restForExerciseName: enriched?.exercise.name ?? null,
    };
  };

  // ─── Actions timer ────────────────────────────────────────────────────────

  const handleCommencer = () => {
    setActiveSession({
      activeExerciseLogId: logId,
      timerPhase: 'execution',
      timerStartedAt: Date.now(),
      timerTargetSeconds: getTargetExecutionSeconds(effSetNumber),
      isUnilateral: effIsUnilateral,
      currentSide: effCurrentSide,
      currentSetNumber: effSetNumber,
    });
    refresh();
  };

  const handleTerminer = () => {
    const st = getActiveSession();
    const executionSeconds = Math.floor((Date.now() - st.timerStartedAt) / 1000);

    setActiveSession({
      timerPhase: 'rest',
      timerStartedAt: Date.now(),
      timerTargetSeconds: getEffectiveRest({
        override: restOverride,
        target: getTargetRestSeconds(effSetNumber),
        halve: halveRest,
      }),
      lastExecutionSeconds: executionSeconds,
      restForExerciseName: enriched?.exercise.name ?? null,
      // La prochaine série sera republiée une fois celle-ci enregistrée
      autoNext: null,
      // La série qu'on termine : c'est son repos qui court, jusqu'au prochain « Commencer »
      isUnilateral: effIsUnilateral,
      currentSide: effCurrentSide,
      currentSetNumber: effSetNumber,
    });
    setModalVisible(true);
  };

  // Le repos choisi devient celui de l'exercice pour la suite de la séance (store éphémère).
  const handleSelectPreset = (seconds: number) => {
    if (!logId) return;
    const st = getActiveSession();
    setActiveSession({
      restOverrideByLog: { ...st.restOverrideByLog, [logId]: seconds },
      ...retargetRunningRest(seconds, halveRest),
    });
    refresh();
  };

  // Chip « Prévu » : on retombe sur l'objectif du plan (qui peut varier d'une série à l'autre).
  const handleSelectPlanned = () => {
    if (!logId) return;
    const st = getActiveSession();
    const next = { ...st.restOverrideByLog };
    delete next[logId];
    setActiveSession({ restOverrideByLog: next, ...retargetRunningRest(null, halveRest) });
    refresh();
  };

  const handleToggleUnilateral = (v: boolean) => {
    if (isActive) setActiveSession({ isUnilateral: v });
    else setLocalIsUnilateral(v);
    // Mémorisé pour la séance : l'écran superset reprend ce choix au lieu de le redétecter
    if (logId) {
      setActiveSession({ unilateralByLog: { ...getActiveSession().unilateralByLog, [logId]: v } });
    }
    // Le ÷ 2 ne s'applique qu'en unilatéral : le décompte en cours doit suivre.
    const halve = v && (getActiveSession().halveRestByLog[logId ?? ''] ?? false);
    setActiveSession(retargetRunningRest(restOverride, halve));
    refresh();
  };

  const handleSelectStartSide = (side: 'L' | 'R') => {
    if (!logId) return;
    const st = getActiveSession();
    setActiveSession({ startSideByLog: { ...st.startSideByLog, [logId]: side } });
    refresh();
  };

  const handleToggleHalveRest = (v: boolean) => {
    if (!logId) return;
    const st = getActiveSession();
    setActiveSession({
      halveRestByLog: { ...st.halveRestByLog, [logId]: v },
      ...retargetRunningRest(restOverride, v && effIsUnilateral),
    });
    refresh();
  };

  const handleSavePerf = async (data: SetLogData) => {
    if (!logId) return;
    const st = getActiveSession();

    await saveSetLog(
      logId,
      { ...data, executionSeconds: st.lastExecutionSeconds },
      effSetNumber,
      effCurrentSide ?? undefined
    );

    setModalVisible(false);
    setEditingSetLog(null);

    // Le repos déjà lancé par « Terminer série » continue ; la série/le côté suivants
    // sont recalculés par load() depuis les séries enregistrées.
    setActiveSession({ lastExecutionSeconds: null, restForExerciseName: enriched?.exercise.name ?? null });

    load();
  };

  // Encodage « à la main » : ouvre le modal pour la série/le côté courant sans toucher au
  // chrono. Sert quand le modal a été fermé sans enregistrer (retour Android, tap sur le
  // fond) ou quand on encode sans avoir chronométré.
  const handleManualEntry = () => {
    setEditingSetLog(null);
    setModalVisible(true);
  };

  // Enregistrement d'une série encodée à la main, hors repos en cours : pas de chrono
  // (executionSeconds reste null). La suite est recalculée par load().
  const handleSaveManual = async (data: SetLogData) => {
    if (!logId) return;
    await saveSetLog(
      logId,
      { ...data, executionSeconds: null },
      effSetNumber,
      effCurrentSide ?? undefined
    );
    setModalVisible(false);
    load();
  };

  const handleEditSetLog = (sl: SetLogRow) => {
    setEditingSetLog(sl);
    setModalVisible(true);
  };

  const handleSaveEdit = async (data: SetLogData) => {
    if (!editingSetLog) return;
    // Le modal ne connaît pas les temps chronométrés : sans ça, modifier une série
    // écraserait sa durée d'exécution par null.
    await updateSetLog(editingSetLog.id, {
      ...data,
      executionSeconds: editingSetLog.executionSeconds,
      durationSeconds: editingSetLog.durationSeconds,
      restSeconds: editingSetLog.restSeconds,
    });
    setModalVisible(false);
    setEditingSetLog(null);
    load();
  };

  // Supprime la série entière (G+D en unilatéral) puis comble le trou : sans renumérotation,
  // la prochaine série enregistrée porterait un numéro déjà utilisé.
  const handleDeleteSetLog = (group: SetLogRow[], setNumber: number) => {
    Alert.alert('Supprimer la série', `Supprimer la série #${setNumber} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          for (const row of group) await deleteSetLog(row.id);
          await renumberSetsAfterDelete(logId!, setNumber);
          load();
        },
      },
    ]);
  };

  // ─── Remplacer l'exercice / changer de variante (amélioration 14) ─────────

  const doSwap = async (newExercise: typeof exercises.$inferSelect) => {
    if (!logId || !enriched) return;
    if (newExercise.id === enriched.exercise.id) {
      Alert.alert('Déjà en cours', `${newExercise.name} est déjà l'exercice de cet écran.`);
      return;
    }
    const newLogId = await swapExerciseLog(logId, newExercise.id);
    // Si l'exercice était actif (chrono en cours), le chrono et ses réglages suivent le nouveau log
    moveActiveExerciseLog(logId, newLogId, newExercise.name);
    if (newLogId !== logId) {
      router.replace(`/seance/exercice/${newLogId}` as any);
    } else {
      // Même log, autre exercice : le pré-réglage « Unilatéral » se recalcule pour le nouvel exercice
      hintAppliedRef.current = false;
      load();
    }
  };

  const askSwapToAlternative = (alt: typeof exercises.$inferSelect) => {
    Alert.alert(alt.name, undefined, [
      { text: 'Faire cet exercice', onPress: () => doSwap(alt) },
      { text: 'Voir la fiche', onPress: () => router.push(`/exercices/${alt.id}`) },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const handleSelectVariation = async (variation: string | null) => {
    if (!logId) return;
    await setExerciseLogVariation(logId, variation);
    setShowVariationPicker(false);
    // Une variante « unilatéral » pré-règle le toggle ; une autre ne le décoche pas
    // (la déduction depuis l'historique peut le justifier). Jamais en cours de série.
    if (!halfDone && isUnilateralHint({ variation, lastPerf: null })) {
      if (isActive) setActiveSession({ isUnilateral: true });
      else setLocalIsUnilateral(true);
    }
    load();
  };

  const handleCreateVariation = async (value: string) => {
    if (!enriched) return;
    await addVariationToExercise(enriched.exercise.id, value);
    await handleSelectVariation(value.trim());
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────

  if (!enriched) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const isEditing = editingSetLog != null;
  // Série « à encoder » (terminée dans un superset, amélioration 01b) : elle n'a pas encore
  // de perfs, on la préremplit comme une nouvelle série de même numéro/côté. L'enregistrer
  // passe par handleSaveEdit (updateSetLog → la ligne cesse d'être « à encoder »).
  const completing = isEditing && editingSetLog!.isPending;
  const prefill = completing
    ? computePrefill(enriched, history, editingSetLog!.setNumber ?? effSetNumber, (editingSetLog!.side as 'L' | 'R' | null) ?? null)
    : computePrefill(enriched, history, effSetNumber, effCurrentSide);
  const fromRow = isEditing && !completing;

  const modalKey = isEditing ? `edit-${editingSetLog!.id}` : `new-${effSetNumber}-${effCurrentSide ?? ''}`;
  const modalPrefillWeightKg = fromRow ? editingSetLog!.weight : prefill.weightKg;
  const modalPrefillReps = fromRow ? editingSetLog!.reps : prefill.reps;
  const modalPrefillRir = fromRow ? editingSetLog!.rir : prefill.rir;
  const modalPrefillPartialReps = fromRow ? editingSetLog!.partialReps : prefill.partialReps;
  const modalPrefillPdc = fromRow ? (editingSetLog!.pdc ?? false) : prefill.pdc;
  const modalPrefillNote = fromRow ? editingSetLog!.note : null;
  const modalSetNumber = isEditing ? (editingSetLog!.setNumber ?? effSetNumber) : effSetNumber;
  const modalSide = isEditing ? (editingSetLog!.side as 'L' | 'R' | null) : effCurrentSide;
  // Nouvelle série : pendant un repos de cet exercice (modal fermé par « retour »), on réutilise
  // le flux normal, qui laisse le repos courir ; sinon c'est un encodage manuel.
  const handleSaveNew = isActive && phase === 'rest' ? handleSavePerf : handleSaveManual;

  const effectiveVariation = getEffectiveVariation(enriched);
  // Exercices proposables dans le bloc Infos : alternatives du plan + exercice prévu (pour y
  // revenir), sans l'exercice déjà en cours.
  const swapChoices = [
    ...(enriched.plannedExercise ? [enriched.plannedExercise] : []),
    ...alternatives,
  ].filter((a, i, all) => a.id !== enriched.exercise.id && all.findIndex((b) => b.id === a.id) === i);

  const sideLabel = (side: 'L' | 'R' | null) =>
    side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '';

  return (
    <SafeAreaView style={styles.container}>
      <GlobalRestBanner excludeLogId={logId} />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Nom de l'exercice ── */}
        <View style={styles.exerciseNameRow}>
          <Text style={styles.exerciseName}>
            {enriched.exercise.name}
            <Text style={styles.variationInline} onPress={() => setShowVariationPicker(true)}>
              {` - ${effectiveVariation ?? 'aucune variante'} ✎`}
            </Text>
          </Text>
          {enriched.plannedExercise && (
            <Text style={styles.replacesText}>remplace {enriched.plannedExercise.name}</Text>
          )}
        </View>

        {/* ── Infos exercice (repliée par défaut, lecture seule) ── */}
        <ExerciseInfoPanel enriched={enriched} />

        {/* ── Remplacer l'exercice ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remplacer l'exercice</Text>
          <View style={styles.altRow}>
            {swapChoices.map((a) => (
              <Pressable key={a.id} style={styles.altChip} onPress={() => askSwapToAlternative(a)}>
                <Text style={styles.altChipText}>
                  {a.id === enriched.plannedExercise?.id ? `${a.name} (prévu)` : a.name}
                </Text>
              </Pressable>
            ))}
            <Pressable style={[styles.altChip, styles.otherChip]} onPress={() => setShowSwapPicker(true)}>
              <Text style={styles.altChipText}>Autre…</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Objectifs ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectifs</Text>
          <ObjectivesList
            mesoSets={enriched.mesoSets}
            programExercise={enriched.programExercise}
            weightUnit={weightUnit}
            sets={progress.sets}
            plannedSetCount={plannedSetCount}
            previousSets={chain.previousSets}
            onPressPending={(n) => {
              const row = enriched.setLogs.find((l) => l.setNumber === n && l.isPending);
              if (row) handleEditSetLog(row);
            }}
          />
        </View>

        {/* ── Timer ── */}
        <View style={styles.section}>
          <View style={styles.timerHeader}>
            <Text style={styles.sectionTitle}>
              {phase === 'execution'
                ? `Série ${effSetNumber}${sideLabel(effCurrentSide)} en cours`
                : phase === 'rest'
                ? `Repos · série ${effSetNumber}${sideLabel(effCurrentSide)} à venir`
                : `Série ${effSetNumber}${sideLabel(effCurrentSide)}`}
            </Text>
            <View style={styles.unilateralRow}>
              <Text style={styles.smallLabel}>Unilatéral</Text>
              <Switch
                value={effIsUnilateral}
                disabled={halfDone}
                onValueChange={handleToggleUnilateral}
                trackColor={{ true: '#007AFF' }}
              />
            </View>
          </View>

          {/* Côté de départ + repos ÷ 2 : seulement en unilatéral */}
          {effIsUnilateral && (
            <View style={styles.halveRow}>
              <Text style={styles.smallLabel}>Commencer par</Text>
              {(['L', 'R'] as const).map((side) => {
                // Série à moitié faite : le côté de départ est celui déjà enregistré
                const active = halfDone ? effCurrentSide !== side : firstSide === side;
                return (
                  <Pressable
                    key={side}
                    disabled={halfDone}
                    style={[styles.modeChip, active && styles.modeChipActive, halfDone && styles.chipDisabled]}
                    onPress={() => handleSelectStartSide(side)}
                  >
                    <Text style={[styles.modeText, active && styles.modeTextActive]}>
                      {side === 'L' ? 'Gauche' : 'Droite'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {effIsUnilateral && (
            <View style={styles.halveRow}>
              <Text style={styles.smallLabel}>Repos ÷ 2 (par côté)</Text>
              <Switch
                value={halveRest}
                onValueChange={handleToggleHalveRest}
                trackColor={{ true: '#007AFF' }}
              />
            </View>
          )}

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

          {/* Repos : toujours modifiable ; l'objectif du plan = chip « Prévu » présélectionnée */}
          {(phase === 'rest' || phase === 'idle') && (
            <RestPresetPicker
              presets={presets}
              overrideSeconds={restOverride}
              plannedSeconds={getTargetRestSeconds(restSetNumber)}
              onSelect={handleSelectPreset}
              onSelectPlanned={handleSelectPlanned}
              onEditPresets={() => router.push('/seance/presets-repos' as any)}
            />
          )}

          {/* Boutons principaux */}
          <View style={styles.buttonRow}>
            {phase === 'idle' && (
              <Pressable style={styles.primaryBtn} onPress={handleCommencer}>
                <Text style={styles.primaryBtnText}>
                  Commencer série{sideLabel(effCurrentSide)}
                </Text>
              </Pressable>
            )}
            {(phase === 'idle' || phase === 'rest') && (
              <Pressable style={[styles.primaryBtn, styles.manualBtn]} onPress={handleManualEntry}>
                <Text style={styles.manualBtnText}>
                  + Encoder la série {effSetNumber}{sideLabel(effCurrentSide)}
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
                    Commencer{sideLabel(effCurrentSide)} maintenant
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
        {(enriched.setLogs.length > 0 || chain.previousLogs.some((p) => p.setLogs.length > 0)) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Séries de cette séance</Text>
            {/* Exercices remplacés : lecture seule (à modifier depuis Détails de la séance) */}
            {chain.previousLogs
              .filter((p) => p.setLogs.length > 0)
              .map((p) => (
                <View key={p.log.id} style={styles.prevSets}>
                  <Text style={styles.prevSetsName}>{p.exercise.name}</Text>
                  <SetLogList
                    setLogs={p.setLogs}
                    weightUnit={(p.exercise.weightUnit as 'kg' | 'lb' | null) ?? weightUnit}
                    firstSide={firstSide}
                  />
                </View>
              ))}
            {chain.previousLogs.some((p) => p.setLogs.length > 0) && enriched.setLogs.length > 0 && (
              <Text style={styles.prevSetsName}>{enriched.exercise.name}</Text>
            )}
            <SetLogList
              setLogs={enriched.setLogs}
              weightUnit={weightUnit}
              firstSide={firstSide}
              onEdit={handleEditSetLog}
              onDelete={handleDeleteSetLog}
              onEncode={handleEditSetLog}
            />
          </View>
        )}

        {/* ── Historique ── */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {history.map((group) => (
              <View key={group.sessionId} style={styles.histGroup}>
                <Text style={styles.histDate}>
                  {formatDate(group.sessionDate)}
                  {group.variation ? ` · ${group.variation}` : ''}
                </Text>
                <SetLogList setLogs={group.sets} weightUnit={weightUnit} firstSide={firstSide} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <SetPerformanceModal
        key={modalKey}
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingSetLog(null); }}
        onSave={isEditing ? handleSaveEdit : handleSaveNew}
        weightUnit={weightUnit}
        exerciseId={enriched.exercise.id}
        setNumber={modalSetNumber}
        side={modalSide}
        prefillWeightKg={modalPrefillWeightKg}
        prefillReps={modalPrefillReps}
        prefillRir={modalPrefillRir}
        prefillPartialReps={modalPrefillPartialReps}
        prefillPdc={modalPrefillPdc}
        prefillNote={modalPrefillNote}
      />

      <VariationPickerModal
        visible={showVariationPicker}
        variations={(enriched.exercise.variations as string[] | null) ?? []}
        current={effectiveVariation}
        onSelect={handleSelectVariation}
        onCreate={handleCreateVariation}
        onClose={() => setShowVariationPicker(false)}
      />

      <Modal visible={showSwapPicker} animationType="slide" onRequestClose={() => setShowSwapPicker(false)}>
        <SafeAreaView style={styles.pickerScreen}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Changer d'exercice</Text>
            <Pressable onPress={() => setShowSwapPicker(false)}>
              <Text style={styles.pickerClose}>Annuler</Text>
            </Pressable>
          </View>
          <ExercisePicker
            cardIndicator="plus"
            onSelect={(exercise) => {
              setShowSwapPicker(false);
              doSwap(exercise);
            }}
            onCreateNew={() => {
              setShowSwapPicker(false);
              router.push('/exercices/nouveau' as any);
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Helpers affichage ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  exerciseNameRow: { paddingHorizontal: 4 },
  exerciseName: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
  replacesText: { fontSize: 13, color: '#8E8E93', fontStyle: 'italic' },
  prevSets: { gap: 2 },
  prevSetsName: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  variationInline: { fontSize: 14, fontWeight: '500', color: '#007AFF' },
  otherChip: { backgroundColor: '#F2F2F7' },
  pickerScreen: { flex: 1, backgroundColor: '#f2f2f7' },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  pickerTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  pickerClose: { fontSize: 16, color: '#007AFF' },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  altChip: {
    backgroundColor: '#e8f0fe', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  altChipText: { color: '#007AFF', fontSize: 13, fontWeight: '500' },
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
  chipDisabled: { opacity: 0.5 },
  halveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
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
  manualBtn: { backgroundColor: '#F0F7FF', borderWidth: 1, borderColor: '#C8E0FF' },
  manualBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
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
