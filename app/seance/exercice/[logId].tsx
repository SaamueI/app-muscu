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

import { ExerciseImageCarousel } from '../../../src/components/ExerciseImageCarousel';
import GlobalRestBanner from '../../../src/components/GlobalRestBanner';
import ObjectivesList from '../../../src/components/live/ObjectivesList';
import SetLogList from '../../../src/components/live/SetLogList';
import RestPresetPicker from '../../../src/components/RestPresetPicker';
import SetPerformanceModal from '../../../src/components/SetPerformanceModal';
import TimerDisplay from '../../../src/components/TimerDisplay';
import { db } from '../../../src/db';
import { exerciseLogs, exercises, setLogs } from '../../../src/db/schema';
import {
  deleteSetLog,
  getAlternativeExercises,
  getPreviousPerfs,
  getRestPresets,
  getSessionLive,
  getUserWeightUnit,
  markExerciseDone,
  renumberSetsAfterDelete,
  saveSetLog,
  updateSetLog,
  type ExerciseLogEnriched,
  type PerfGroup,
  type SetLogData,
} from '../../../src/db/session';
import { getFirstSide } from '../../../src/db/settings';
import {
  getActiveSession,
  setActiveSession
} from '../../../src/utils/activeSessionStore';
import {
  computeProgress,
  fixedPlannedSets,
  getEffectiveRest,
  isUnilateralHint,
} from '../../../src/utils/exerciseProgress';

type SetLogRow = typeof setLogs.$inferSelect;

type RestPreset = { id: string; seconds: number; sortOrder: number };

export default function ExerciceDetailLiveScreen() {
  const { logId } = useLocalSearchParams<{ logId: string }>();
  const router = useRouter();

  const [enriched, setEnriched] = useState<ExerciseLogEnriched | null>(null);
  const [alternatives, setAlternatives] = useState<(typeof exercises.$inferSelect)[]>([]);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [history, setHistory] = useState<PerfGroup[]>([]);
  const [presets, setPresets] = useState<RestPreset[]>([]);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [, setTick] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSetLog, setEditingSetLog] = useState<SetLogRow | null>(null);
  const autoFiredRef = useRef(false);
  // Prochaine série à démarrer, lue par le timer auto (l'intervalle ne se recrée pas à
  // chaque rendu : il passe par cette ref pour avoir la valeur à jour).
  const autoStartRef = useRef<{ setNumber: number; side: 'L' | 'R' | null; execSeconds: number | null }>({
    setNumber: 1,
    side: null,
    execSeconds: null,
  });
  // Le pré-réglage « Unilatéral » ne s'applique qu'une fois par ouverture de l'écran,
  // sinon il écraserait le choix manuel de l'utilisateur à chaque retour sur l'écran.
  const hintAppliedRef = useRef(false);

  // Côté de départ des séries unilatérales (réglage Paramètres)
  const [defaultFirstSide, setDefaultFirstSide] = useState<'L' | 'R'>('L');
  // Toggle « Unilatéral » tant que cet exercice n'est pas l'exercice actif du timer
  // global ; quand il l'est, la valeur vit dans le store (activeSessionStore).
  const [localIsUnilateral, setLocalIsUnilateral] = useState(false);

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

    const altIds =
      (found?.mesoExercise?.alternativeExerciseIds as string[] | null) ??
      (found?.programExercise?.alternativeExerciseIds as string[] | null) ??
      null;
    setAlternatives(await getAlternativeExercises(altIds));

    const perfs = await getPreviousPerfs(logRow.log.exerciseId, 5, logRow.log.workoutSessionId);
    setHistory(perfs);

    const ps = await getRestPresets();
    setPresets(ps);

    const userUnit = await getUserWeightUnit();
    const exUnit = logRow.exercise.weightUnit as 'kg' | 'lb' | null;
    setWeightUnit(exUnit ?? userUnit);

    setDefaultFirstSide(await getFirstSide());

    // Pré-réglage du toggle « Unilatéral » (une fois par ouverture) : variante prévue
    // « unilatéral », ou séries G/D déjà vues (cette séance + dernière séance).
    if (!hintAppliedRef.current) {
      hintAppliedRef.current = true;
      if (getActiveSession().activeExerciseLogId !== logId) {
        const variation =
          found?.mesoExercise?.selectedVariation ?? found?.programExercise?.selectedVariation ?? null;
        setLocalIsUnilateral(
          isUnilateralHint({
            variation,
            lastPerf: [...(found?.setLogs ?? []), ...(perfs[0]?.sets ?? [])],
          })
        );
      }
    }
  }, [logId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
          const nextUp = autoStartRef.current;
          setActiveSession({
            timerPhase: 'execution',
            timerStartedAt: Date.now(),
            timerTargetSeconds: nextUp.execSeconds,
            currentSetNumber: nextUp.setNumber,
            currentSide: nextUp.side,
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
  autoStartRef.current = {
    setNumber: effSetNumber,
    side: effCurrentSide,
    execSeconds: getTargetExecutionSeconds(effSetNumber),
  };

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
    autoFiredRef.current = false;
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
      // La série qu'on termine : c'est son repos qui court, jusqu'au prochain « Commencer »
      isUnilateral: effIsUnilateral,
      currentSide: effCurrentSide,
      currentSetNumber: effSetNumber,
    });
    autoFiredRef.current = false;
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
    autoFiredRef.current = false;
    refresh();
  };

  // Chip « Prévu » : on retombe sur l'objectif du plan (qui peut varier d'une série à l'autre).
  const handleSelectPlanned = () => {
    if (!logId) return;
    const st = getActiveSession();
    const next = { ...st.restOverrideByLog };
    delete next[logId];
    setActiveSession({ restOverrideByLog: next, ...retargetRunningRest(null, halveRest) });
    autoFiredRef.current = false;
    refresh();
  };

  const handleToggleUnilateral = (v: boolean) => {
    if (isActive) setActiveSession({ isUnilateral: v });
    else setLocalIsUnilateral(v);
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
    autoFiredRef.current = false;

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

  // ─── Rendu ────────────────────────────────────────────────────────────────

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
    : getPrefillFromCurrentSession(effSetNumber, effCurrentSide, effCurrentSide != null) ??
      getPrefillFromHistory(effSetNumber, effCurrentSide, effCurrentSide != null);
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

  const modalKey = isEditing ? `edit-${editingSetLog!.id}` : `new-${effSetNumber}-${effCurrentSide ?? ''}`;
  const modalPrefillWeightKg = isEditing ? editingSetLog!.weight : prefillWeightKg;
  const modalPrefillReps = isEditing ? editingSetLog!.reps : prefillReps;
  const modalPrefillRir = isEditing ? editingSetLog!.rir : prefillRir;
  const modalPrefillPartialReps = isEditing ? editingSetLog!.partialReps : (histSet?.partialReps ?? null);
  const modalPrefillPdc = isEditing ? (editingSetLog!.pdc ?? false) : (histSet?.pdc ?? false);
  const modalPrefillNote = isEditing ? editingSetLog!.note : null;
  const modalSetNumber = isEditing ? (editingSetLog!.setNumber ?? effSetNumber) : effSetNumber;
  const modalSide = isEditing ? (editingSetLog!.side as 'L' | 'R' | null) : effCurrentSide;
  // Nouvelle série : pendant un repos de cet exercice (modal fermé par « retour »), on réutilise
  // le flux normal, qui laisse le repos courir ; sinon c'est un encodage manuel.
  const handleSaveNew = isActive && phase === 'rest' ? handleSavePerf : handleSaveManual;

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

        {/* ── Infos exercice (repliée par défaut, lecture seule) ── */}
        <Pressable style={styles.infoToggle} onPress={() => setInfoExpanded((v) => !v)}>
          <Text style={styles.infoToggleText}>Infos exercice {infoExpanded ? '▾' : '▸'}</Text>
        </Pressable>
        {infoExpanded && (
          <View style={styles.section}>
            <ExerciseImageCarousel
              exerciseId={enriched.exercise.id}
              customImageUris={enriched.exercise.customImageUris as string[] | null}
            />
            <View style={styles.tagsRow}>
              {enriched.exercise.level && <Text style={styles.tag}>{enriched.exercise.level}</Text>}
              {enriched.exercise.category && <Text style={styles.tag}>{enriched.exercise.category}</Text>}
              {enriched.exercise.equipment && <Text style={styles.tag}>{enriched.exercise.equipment}</Text>}
            </View>

            {enriched.exercise.description ? (
              <>
                <Text style={[styles.sectionTitle, styles.infoSubTitle]}>Instructions</Text>
                {enriched.exercise.description.split('\n\n').map((step, i) => (
                  <View key={i} style={styles.step}>
                    <Text style={styles.stepNumber}>{i + 1}</Text>
                    <Text style={styles.stepText}>{step}</Text>
                  </View>
                ))}
              </>
            ) : null}

            {(enriched.mesoExercise || enriched.programExercise) && (
              <>
                <Text style={[styles.sectionTitle, styles.infoSubTitle]}>Variante</Text>
                <Text style={styles.infoText}>
                  {enriched.mesoExercise?.selectedVariation ?? enriched.programExercise?.selectedVariation ?? 'Aucune variante sélectionnée'}
                </Text>

                <Text style={[styles.sectionTitle, styles.infoSubTitle]}>Exercices alternatifs</Text>
                {alternatives.length === 0 ? (
                  <Text style={styles.infoText}>Aucun exercice alternatif</Text>
                ) : (
                  <View style={styles.altRow}>
                    {alternatives.map((a) => (
                      <Pressable
                        key={a.id}
                        style={styles.altChip}
                        onPress={() => router.push(`/exercices/${a.id}`)}
                      >
                        <Text style={styles.altChipText}>{a.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {enriched.mesoExercise?.note ? (
              <>
                <Text style={[styles.sectionTitle, styles.infoSubTitle]}>Note de la séance planifiée</Text>
                <Text style={styles.infoText}>{enriched.mesoExercise.note}</Text>
              </>
            ) : null}

            {enriched.exercise.notes ? (
              <>
                <Text style={[styles.sectionTitle, styles.infoSubTitle]}>Note de l'exercice</Text>
                <Text style={[styles.infoText, styles.catalogNoteText]}>{enriched.exercise.notes}</Text>
              </>
            ) : null}
          </View>
        )}

        {/* ── Objectifs ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectifs</Text>
          <ObjectivesList
            mesoSets={enriched.mesoSets}
            programExercise={enriched.programExercise}
            weightUnit={weightUnit}
            sets={progress.sets}
            plannedSetCount={plannedSetCount}
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
        {enriched.setLogs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Séries de cette séance</Text>
            <SetLogList
              setLogs={enriched.setLogs}
              weightUnit={weightUnit}
              firstSide={firstSide}
              onEdit={handleEditSetLog}
              onDelete={handleDeleteSetLog}
            />
          </View>
        )}

        {/* ── Historique ── */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {history.map((group) => (
              <View key={group.sessionId} style={styles.histGroup}>
                <Text style={styles.histDate}>{formatDate(group.sessionDate)}</Text>
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
  infoToggle: { paddingHorizontal: 4, paddingVertical: 2 },
  infoToggleText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  infoSubTitle: { marginTop: 12 },
  infoText: { fontSize: 15, color: '#1C1C1E' },
  step: { flexDirection: 'row', marginTop: 8, gap: 10, alignItems: 'flex-start' },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#007AFF',
    color: '#fff', textAlign: 'center', fontSize: 12, fontWeight: '700',
    lineHeight: 22, overflow: 'hidden',
  },
  stepText: { flex: 1, fontSize: 14, color: '#333', lineHeight: 20 },
  catalogNoteText: { color: '#8E8E93' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12, color: '#555', backgroundColor: '#e8e8e8',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
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
