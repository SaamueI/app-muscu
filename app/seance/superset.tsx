import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import GlobalRestBanner from '../../src/components/GlobalRestBanner';
import ExerciseInfoPanel from '../../src/components/live/ExerciseInfoPanel';
import { getSetTargetText, ObjectiveRow } from '../../src/components/live/ObjectivesList';
import PendingSetsModal, { type PendingItem } from '../../src/components/live/PendingSetsModal';
import SetLogList from '../../src/components/live/SetLogList';
import SupersetSettings from '../../src/components/live/SupersetSettings';
import RestPresetPicker from '../../src/components/RestPresetPicker';
import SetPerformanceModal from '../../src/components/SetPerformanceModal';
import TimerDisplay from '../../src/components/TimerDisplay';
import type { setLogs } from '../../src/db/schema';
import {
  completeSetLog,
  createPendingSetLog,
  deleteSetLog,
  getSupersetHistory,
  markExerciseDone,
  renumberSetsAfterDelete,
  saveSetLog,
  updateSetLog,
  type SetLogData,
  type SupersetPerfGroup,
} from '../../src/db/session';
import { enterSuperset, getActiveSession, leaveSuperset, setActiveSession } from '../../src/utils/activeSessionStore';
import { fixedPlannedSets, isUnilateralHint } from '../../src/utils/exerciseProgress';
import { getEffectiveVariation } from '../../src/utils/exerciseSwap';
import { computePrefill, getTargetExecutionSeconds, getTargetRestSeconds } from '../../src/utils/setPrefill';
import {
  getNextStep,
  getObjectiveRows,
  hasHalfDoneSet,
  peekStepAfter,
  restAfterStep,
  type ExKey,
  type RestMode,
  type SupersetExercise,
  type SupersetStep,
} from '../../src/utils/supersetSequence';
import { useExerciseLiveData, type ExerciseLiveData } from '../../src/utils/useExerciseLiveData';
import { useSuspendAutoStart } from '../../src/utils/useSessionTimer';

type SetLogRow = typeof setLogs.$inferSelect;

const shortName = (name: string, max = 20) => (name.length > max ? `${name.slice(0, max - 1)}…` : name);
const sideLabel = (side: 'L' | 'R' | null) => (side === 'L' ? ' (Gauche)' : side === 'R' ? ' (Droite)' : '');
const sideWord = (side: string | null) => (side === 'L' ? 'Gauche' : side === 'R' ? 'Droite' : '');
const formatMMSS = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// Modal à onglets ouvert : ids figés à l'ouverture (une série encodée garde son onglet, ✓).
// autoStartOnClose : toggle « encoder à la pause » désactivé, étape sans repos → la suite
// démarre à la fermeture (mode Auto). finishOnClose : garde-fou « Terminer le superset ».
type PendingModalState = {
  ids: string[];
  initialId: string | null;
  key: number;
  autoStartOnClose?: boolean;
  finishOnClose?: boolean;
};

export default function SupersetScreen() {
  const { a, b } = useLocalSearchParams<{ a: string; b: string }>();
  const router = useRouter();

  const dataA = useExerciseLiveData(a);
  const dataB = useExerciseLiveData(b);
  const { reload: reloadA } = dataA;
  const { reload: reloadB } = dataB;
  const [history, setHistory] = useState<SupersetPerfGroup[]>([]);
  const [, setTick] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<{ key: ExKey; row: SetLogRow } | null>(null);
  const [pendingModal, setPendingModal] = useState<PendingModalState | null>(null);
  const pendingOpen = pendingModal != null;
  // La détection « unilatéral » ne s'applique qu'une fois, sinon elle écraserait le choix de l'utilisateur
  const hintAppliedRef = useRef(false);

  const logIdOf = (key: ExKey) => (key === 'a' ? a : b);
  const dataOf = (key: ExKey) => (key === 'a' ? dataA : dataB);
  const refresh = () => setTick((t) => t + 1);

  // ─── Chargement ───────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!a || !b) return;
    // Le superset est « en cours » dès qu'on l'ouvre : l'écran séance y renvoie directement
    // et affiche le bandeau, même si aucune série n'a encore été commencée.
    enterSuperset(a, b);
    const [la, lb] = await Promise.all([reloadA(), reloadB()]);
    if (!la?.enriched || !lb?.enriched) return;

    setHistory(
      await getSupersetHistory(la.enriched.exercise.id, lb.enriched.exercise.id, 5, la.enriched.log.workoutSessionId)
    );

    // Unilatéral : détection du plan 13 pour chaque exercice, sauf choix déjà fait
    // (toggle de l'écran exercice, ou superset précédemment ouvert sur cette séance).
    if (!hintAppliedRef.current) {
      hintAppliedRef.current = true;
      const byLog = { ...getActiveSession().unilateralByLog };
      for (const [id, d] of [[a, la], [b, lb]] as const) {
        if (byLog[id] === undefined && d.enriched) {
          byLog[id] = isUnilateralHint({
            variation: getEffectiveVariation(d.enriched),
            lastPerf: [...d.enriched.setLogs, ...(d.history[0]?.sets ?? [])],
          });
        }
      }
      setActiveSession({ unilateralByLog: byLog });
    }
  }, [a, b, reloadA, reloadB]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ─── Séquence : dérivée des séries enregistrées et des réglages ───────────

  // `overrides` : repos choisis au picker, par exercice (paramètre pour pouvoir simuler « Prévu »)
  function buildSpec(
    id: string,
    d: ExerciseLiveData,
    overrides: Record<string, number>
  ): SupersetExercise | null {
    const e = d.enriched;
    if (!e) return null;
    const st = getActiveSession();
    return {
      setLogs: e.setLogs,
      plannedSetCount:
        e.mesoSets.length > 0
          ? e.mesoSets.length
          : fixedPlannedSets(e.programExercise?.targetSetsMin, e.programExercise?.targetSetsMax),
      startSetNumber: d.chain.startSetNumber,
      unilateral: st.unilateralByLog[id] ?? false,
      firstSide: st.startSideByLog[id] ?? d.defaultFirstSide,
      restBetweenSides: st.restBetweenSidesByLog[id] ?? true,
      halveRest: st.halveRestByLog[id] ?? false,
      baseRest: (n) => overrides[id] ?? getTargetRestSeconds(e, n),
    };
  }

  function buildSpecs(dA: ExerciseLiveData, dB: ExerciseLiveData, overrides = getActiveSession().restOverrideByLog) {
    if (!a || !b) return null;
    const specA = buildSpec(a, dA, overrides);
    const specB = buildSpec(b, dB, overrides);
    return specA && specB ? { specA, specB } : null;
  }

  const computeStep = (dA: ExerciseLiveData, dB: ExerciseLiveData): SupersetStep | null => {
    const specs = buildSpecs(dA, dB);
    return specs ? getNextStep(specs.specA, specs.specB, getActiveSession().supersetRestMode) : null;
  };

  // ─── Démarrer une étape ───────────────────────────────────────────────────

  // Repos réel avant la série qu'on commence : temps écoulé depuis le dernier « Terminer »
  // de CE superset (null pour la 1ʳᵉ étape, ou si l'info a été perdue — app tuée).
  const restBeforeNow = (): number | null => {
    const st = getActiveSession();
    const sup = st.activeSuperset;
    const samePair = sup != null && ((sup.a === a && sup.b === b) || (sup.a === b && sup.b === a));
    if (!samePair || st.lastStepEndedAt == null) return null;
    return Math.max(0, Math.round((Date.now() - st.lastStepEndedAt) / 1000));
  };

  // Une série est unilatérale si le toggle de son exercice l'est QUAND on la commence :
  // le côté de l'étape (null = bilatéral) est figé ici dans le store.
  const startStep = (st: SupersetStep, dA: ExerciseLiveData, dB: ExerciseLiveData) => {
    const e = (st.exercise === 'a' ? dA : dB).enriched;
    if (!a || !b || !e) return;
    const restBeforeSeconds = restBeforeNow();
    setActiveSession({
      restBeforeSeconds,
      activeSuperset: { a, b },
      activeExerciseLogId: logIdOf(st.exercise),
      timerPhase: 'execution',
      timerStartedAt: Date.now(),
      timerTargetSeconds: getTargetExecutionSeconds(e, st.setNumber),
      isUnilateral: st.side != null,
      currentSide: st.side,
      currentSetNumber: st.setNumber,
      restForExerciseName: 'Superset',
    });
    refresh();
  };

  // ─── Timer tick ───────────────────────────────────────────────────────────
  // Le démarrage auto en fin de repos est fait par le minuteur GLOBAL (useAutoStartTicker,
  // app/_layout.tsx), qui tourne même quand on a quitté cet écran.

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useSuspendAutoStart(modalVisible || pendingOpen);

  // ─── Rendu : état dérivé ──────────────────────────────────────────────────

  const eA = dataA.enriched;
  const eB = dataB.enriched;
  if (!a || !b || !eA || !eB) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Chargement…</Text>
      </SafeAreaView>
    );
  }

  const s = getActiveSession();
  const restMode = s.supersetRestMode;
  const specs = buildSpecs(dataA, dataB)!;
  const step = getNextStep(specs.specA, specs.specB, restMode);
  const stepData = dataOf(step.exercise);
  const stepEnriched = stepData.enriched!;
  const stepName = shortName(stepEnriched.exercise.name);

  const isActive =
    s.activeSuperset != null &&
    ((s.activeSuperset.a === a && s.activeSuperset.b === b) || (s.activeSuperset.a === b && s.activeSuperset.b === a)) &&
    (s.activeExerciseLogId === a || s.activeExerciseLogId === b);
  const phase = isActive ? s.timerPhase : 'idle';

  // Prochaine étape publiée pour le minuteur global, par le superset qui possède le chrono.
  // Pendant un repos, seulement si l'étape terminée est bien enregistrée (sa ligne est créée
  // juste après « Terminer ») : sinon la « prochaine » serait encore cette même étape.
  if (isActive) {
    const finishedLogId = s.activeExerciseLogId;
    const finishedSaved =
      phase !== 'rest' ||
      [eA, eB].some(
        (e) =>
          e.log.id === finishedLogId &&
          e.setLogs.some((l) => l.setNumber === s.currentSetNumber && (l.side ?? null) === (s.currentSide ?? null))
      );
    const next = finishedSaved
      ? {
          logId: logIdOf(step.exercise),
          setNumber: step.setNumber,
          side: step.side,
          execSeconds: getTargetExecutionSeconds(stepEnriched, step.setNumber),
          superset: true,
        }
      : null;
    const prev = s.autoNext;
    const changed =
      (prev == null) !== (next == null) ||
      (prev && next && (prev.logId !== next.logId || prev.setNumber !== next.setNumber || prev.side !== next.side || prev.execSeconds !== next.execSeconds));
    if (changed) setActiveSession({ autoNext: next });
  }

  // ─── Actions timer ────────────────────────────────────────────────────────

  const handleCommencer = () => startStep(step, dataA, dataB);

  // « Terminer série » crée TOUT DE SUITE la ligne set_logs (temps d'exécution + repos réel,
  // perfs à encoder) : le moteur de séquence la compte comme faite, et rien n'est perdu si
  // l'app est tuée. Ensuite (amélioration 01b) :
  //  - toggle « encoder à la pause » activé + pas de repos : pas de modal, la suite démarre
  //    (Auto) ou attend « Commencer » (Manuel) ;
  //  - toggle activé + repos : le repos démarre et le modal à onglets s'ouvre avec TOUTES
  //    les séries à encoder du superset ;
  //  - toggle désactivé : modal aussitôt sur cette seule série (comportement d'avant).
  const handleTerminer = async () => {
    const st = getActiveSession();
    const now = Date.now();
    const executionSeconds = Math.floor((now - st.timerStartedAt) / 1000);
    // L'étape qu'on termine est celle figée au « Commencer » (store), pas la prochaine.
    // Le repos se calcule AVANT d'enregistrer la ligne (restAfterStep raisonne sur les
    // séries déjà faites, sans l'étape courante).
    const current = {
      exercise: (st.activeExerciseLogId === a ? 'a' : 'b') as ExKey,
      setNumber: st.currentSetNumber,
      side: st.currentSide,
    };
    const rest = restAfterStep(specs.specA, specs.specB, restMode, current);
    setActiveSession({
      timerPhase: rest ? 'rest' : 'idle',
      timerStartedAt: now,
      timerTargetSeconds: rest?.seconds ?? null,
      restForExerciseName: 'Superset',
      lastStepEndedAt: now,
      restBeforeSeconds: null,
      autoNext: null,
    });
    refresh();

    const rowId = await createPendingSetLog(
      logIdOf(current.exercise),
      current.setNumber,
      current.side,
      executionSeconds,
      st.restBeforeSeconds
    );
    const fresh = await reloadOne(current.exercise);
    const dA = current.exercise === 'a' && fresh ? fresh : dataA;
    const dB = current.exercise === 'b' && fresh ? fresh : dataB;

    if (!st.deferEncodingInSuperset) {
      openPending([rowId], rowId, { autoStartOnClose: !rest });
    } else if (rest) {
      openPending(orderedPendingIds(dA, dB), null);
    } else if (getActiveSession().timerMode === 'auto') {
      const next = computeStep(dA, dB);
      if (next) startStep(next, dA, dB);
    }
  };

  // Le repos choisi devient celui de l'exercice auquel il appartient. Pendant un repos, c'est
  // l'exercice qu'on vient de finir ; sinon celui de l'étape à venir.
  const pickerKey: ExKey = phase === 'rest' ? (s.activeExerciseLogId === a ? 'a' : 'b') : step.exercise;
  const pickerId = logIdOf(pickerKey);
  const pickerEnriched = dataOf(pickerKey).enriched!;
  const pickerSetNumber = phase === 'rest' ? s.currentSetNumber : step.setNumber;

  const handleSelectPreset = (seconds: number) => {
    const st = getActiveSession();
    // ÷ 2 : seulement si la série qui vient de finir était unilatérale AVEC repos entre côtés
    const halve = st.currentSide != null && (st.restBetweenSidesByLog[pickerId] ?? true) && (st.halveRestByLog[pickerId] ?? false);
    setActiveSession({
      restOverrideByLog: { ...st.restOverrideByLog, [pickerId]: seconds },
      ...(phase === 'rest' ? { timerTargetSeconds: halve ? Math.round(seconds / 2) : seconds } : {}),
    });
    refresh();
  };

  // Chip « Prévu » : retour à l'objectif du plan, le décompte en cours suit la règle normale
  const handleSelectPlanned = () => {
    const st = getActiveSession();
    const next = { ...st.restOverrideByLog };
    delete next[pickerId];
    let retarget = {};
    if (phase === 'rest') {
      const sp = buildSpecs(dataA, dataB, next);
      const rest = sp
        ? restAfterStep(sp.specA, sp.specB, restMode, {
            exercise: pickerKey,
            setNumber: st.currentSetNumber,
            side: st.currentSide,
          })
        : null;
      retarget = { timerTargetSeconds: rest?.seconds ?? null };
    }
    setActiveSession({ restOverrideByLog: next, ...retarget });
    refresh();
  };

  // ─── Réglages du superset (appliqués à partir de la prochaine étape) ──────

  const patchByLog = (
    field: 'unilateralByLog' | 'restBetweenSidesByLog' | 'halveRestByLog',
    key: ExKey,
    value: boolean
  ) => {
    setActiveSession({ [field]: { ...getActiveSession()[field], [logIdOf(key)]: value } });
    refresh();
  };

  // ─── Saisie des séries ────────────────────────────────────────────────────

  const reloadOne = (key: ExKey) => (key === 'a' ? reloadA() : reloadB());

  // « + Encoder … » : saisie à la main d'une série non chronométrée (déjà complète).
  const handleSaveManual = async (data: SetLogData) => {
    await saveSetLog(logIdOf(step.exercise), data, step.setNumber, step.side ?? undefined);
    setModalVisible(false);
    reloadOne(step.exercise);
  };

  // ─── Séries « à encoder » (amélioration 01b) ──────────────────────────────

  // Ids des lignes à encoder, dans l'ordre d'exécution (A·S1, B·S1…, côté de départ d'abord).
  function orderedPendingIds(dA: ExerciseLiveData, dB: ExerciseLiveData): string[] {
    const sp = buildSpecs(dA, dB);
    if (!sp) return [];
    const mode = getActiveSession().supersetRestMode;
    const order = getObjectiveRows(sp.specA, sp.specB, getNextStep(sp.specA, sp.specB, mode));
    return order.flatMap((r) => {
      const d = r.exercise === 'a' ? dA : dB;
      const firstSide = (r.exercise === 'a' ? sp.specA : sp.specB).firstSide;
      const rank = (side: string | null) => (side == null ? 0 : side === firstSide ? 1 : 2);
      return (d.enriched?.setLogs ?? [])
        .filter((l) => l.isPending && l.setNumber === r.setNumber)
        .sort((x, y) => rank(x.side) - rank(y.side))
        .map((l) => l.id);
    });
  }

  function openPending(
    ids: string[],
    initialId: string | null,
    opts: Omit<PendingModalState, 'ids' | 'initialId' | 'key'> = {}
  ) {
    if (ids.length === 0) return;
    setPendingModal({ ids, initialId, key: Date.now(), ...opts });
  }

  // Tap sur une série orange : toutes les séries à encoder, onglet de celle-ci sélectionné
  const openPendingAt = (rowId: string) => openPending(orderedPendingIds(dataA, dataB), rowId);

  const handlePendingComplete = async (rowId: string, data: SetLogData) => {
    await completeSetLog(rowId, data);
    const key: ExKey = eA.setLogs.some((l) => l.id === rowId) ? 'a' : 'b';
    await reloadOne(key);
  };

  const handlePendingClose = async () => {
    const state = pendingModal;
    setPendingModal(null);
    if (!state) return;
    if (state.finishOnClose) {
      // Garde-fou « Terminer le superset » : on ne termine que si tout a été encodé
      const [la, lb] = await Promise.all([reloadA(), reloadB()]);
      const left = [...(la?.enriched?.setLogs ?? []), ...(lb?.enriched?.setLogs ?? [])].some((l) => l.isPending);
      if (!left) finishSuperset();
      return;
    }
    const st = getActiveSession();
    if (state.autoStartOnClose && st.timerMode === 'auto' && st.timerPhase === 'idle') {
      const [la, lb] = await Promise.all([reloadA(), reloadB()]);
      const dA = la ?? dataA;
      const dB = lb ?? dataB;
      const next = computeStep(dA, dB);
      if (next) startStep(next, dA, dB);
    }
  };

  const handleSaveEdit = async (data: SetLogData) => {
    if (!editing) return;
    // Le modal ne connaît pas les temps chronométrés : on les conserve
    await updateSetLog(editing.row.id, {
      ...data,
      executionSeconds: editing.row.executionSeconds,
      durationSeconds: editing.row.durationSeconds,
      restSeconds: editing.row.restSeconds,
    });
    const key = editing.key;
    setModalVisible(false);
    setEditing(null);
    reloadOne(key);
  };

  const handleDeleteSetLog = (key: ExKey, group: SetLogRow[], setNumber: number) => {
    Alert.alert('Supprimer la série', `Supprimer la série #${setNumber} de ${dataOf(key).enriched!.exercise.name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          for (const row of group) await deleteSetLog(row.id);
          await renumberSetsAfterDelete(logIdOf(key), setNumber);
          reloadOne(key);
        },
      },
    ]);
  };

  const finishSuperset = async () => {
    await markExerciseDone(a, true);
    await markExerciseDone(b, true);
    const st = getActiveSession();
    leaveSuperset();
    if (isActive && st.timerPhase === 'execution') setActiveSession({ timerPhase: 'idle' });
    router.back();
  };

  // Garde-fou : séries terminées mais pas encore encodées (3 boutons = limite Android)
  const confirmPendingThenFinish = () => {
    const ids = orderedPendingIds(dataA, dataB);
    if (ids.length === 0) {
      finishSuperset();
      return;
    }
    const n = ids.length;
    Alert.alert(
      'Séries à encoder',
      `${n} série${n > 1 ? 's' : ''} terminée${n > 1 ? 's' : ''} sans perfs encodées.`,
      [
        { text: 'Encoder maintenant', onPress: () => openPending(ids, null, { finishOnClose: true }) },
        { text: 'Garder sans perfs', onPress: finishSuperset },
        { text: 'Retour', style: 'cancel' },
      ]
    );
  };

  const handleFinishSuperset = () => {
    if (phase === 'execution') {
      Alert.alert('Terminer le superset', 'Une série est en cours : elle ne sera pas enregistrée.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Terminer', style: 'destructive', onPress: confirmPendingThenFinish },
      ]);
    } else {
      confirmPendingThenFinish();
    }
  };

  // ─── Données du modal ─────────────────────────────────────────────────────

  const isEditing = editing != null;
  const modalKeyEx: ExKey = isEditing ? editing!.key : step.exercise;
  const modalData = dataOf(modalKeyEx);
  const modalEnriched = modalData.enriched!;
  const prefill = computePrefill(modalEnriched, modalData.history, step.setNumber, step.side);
  const modalSetNumber = isEditing ? (editing!.row.setNumber ?? step.setNumber) : step.setNumber;
  const modalSide = isEditing ? (editing!.row.side as 'L' | 'R' | null) : step.side;
  const modalKey = isEditing
    ? `edit-${editing!.row.id}`
    : `new-${modalKeyEx}-${step.setNumber}-${step.side ?? ''}`;

  // ─── Objectifs et séries, dans l'ordre d'exécution ────────────────────────

  const rows = getObjectiveRows(specs.specA, specs.specB, step);
  const enrichedOf = (key: ExKey) => dataOf(key).enriched!;
  const firstSideOf = (key: ExKey) => (key === 'a' ? specs.specA : specs.specB).firstSide;
  const plannedOf = (key: ExKey) => (key === 'a' ? specs.specA : specs.specB).plannedSetCount;

  const loggedChunks = rows
    .map((r) => ({
      ...r,
      logged: enrichedOf(r.exercise).setLogs.filter((l) => l.setNumber === r.setNumber),
    }))
    .filter((r) => r.logged.length > 0);

  // ─── « À suivre » (au-dessus de « Terminer série ») ──────────────────────
  // Fin de plan d'abord (plus rien de prévu après), sinon le repos, sinon l'étape suivante.
  let upNext: string | null = null;
  if (phase === 'execution') {
    const current = {
      exercise: (s.activeExerciseLogId === a ? 'a' : 'b') as ExKey,
      setNumber: s.currentSetNumber,
      side: s.currentSide,
    };
    const after = peekStepAfter(specs.specA, specs.specB, restMode, current);
    const restNext = restAfterStep(specs.specA, specs.specB, restMode, current);
    if (after == null) upNext = 'À suivre : fin du plan';
    else if (restNext) upNext = restNext.seconds != null ? `À suivre : repos ${formatMMSS(restNext.seconds)}` : 'À suivre : repos';
    else {
      const name = shortName(enrichedOf(after.exercise).exercise.name, 28);
      upNext = `À suivre : ${name}${after.side ? ` — ${sideWord(after.side)}` : ''} (sans repos)`;
    }
  }

  // ─── Modal à onglets : items reconstruits depuis les ids figés ────────────
  const pendingItems: PendingItem[] = (pendingModal?.ids ?? []).flatMap((id) => {
    const key: ExKey | null = eA.setLogs.some((l) => l.id === id) ? 'a' : eB.setLogs.some((l) => l.id === id) ? 'b' : null;
    if (!key) return []; // ligne supprimée entre-temps
    const d = dataOf(key);
    const e = d.enriched!;
    const row = e.setLogs.find((l) => l.id === id)!;
    const n = row.setNumber ?? 1;
    const side = (row.side as 'L' | 'R' | null) ?? null;
    return [{
      row,
      tabLabel: `${shortName(e.exercise.name, 14)} · S${n}${side ? ` ${side === 'L' ? 'G' : 'D'}` : ''}`,
      title: `${e.exercise.name} — Série ${n}${sideLabel(side)}`,
      exerciseId: e.exercise.id,
      weightUnit: d.weightUnit,
      prefill: computePrefill(e, d.history, n, side),
    }];
  });

  // Tap sur une ligne d'objectif orange : 1ʳᵉ ligne à encoder de cette série
  const pendingRowOf = (key: ExKey, setNumber: number) =>
    enrichedOf(key).setLogs.find((l) => l.setNumber === setNumber && l.isPending) ?? null;

  const settingsFor = (key: ExKey) => {
    const spec = key === 'a' ? specs.specA : specs.specB;
    const half = hasHalfDoneSet(spec);
    return {
      name: shortName(enrichedOf(key).exercise.name),
      unilateral: spec.unilateral || half,
      unilateralDisabled: half,
      restBetweenSides: spec.restBetweenSides,
      halveRest: spec.halveRest,
    };
  };

  return (
    <SafeAreaView style={styles.container}>
      <GlobalRestBanner excludeLogId={[a, b]} />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Titre + infos des deux exercices ── */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>
            Superset {eA.exercise.name} × {eB.exercise.name}
          </Text>
        </View>
        <ExerciseInfoPanel enriched={eA} label={`Infos ${eA.exercise.name}`} />
        <ExerciseInfoPanel enriched={eB} label={`Infos ${eB.exercise.name}`} />

        {/* ── Objectifs dans l'ordre d'exécution ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Objectifs</Text>
          <View style={styles.list}>
            {rows.map((r) => {
              const e = enrichedOf(r.exercise);
              return (
                <ObjectiveRow
                  key={`${r.exercise}-${r.setNumber}`}
                  label={`S${r.setNumber}`}
                  prefix={shortName(e.exercise.name)}
                  text={getSetTargetText({
                    mesoSets: e.mesoSets,
                    programExercise: e.programExercise,
                    weightUnit: dataOf(r.exercise).weightUnit,
                    plannedSetCount: plannedOf(r.exercise),
                    setNumber: r.setNumber,
                  })}
                  status={r.status}
                  onPress={() => {
                    const row = pendingRowOf(r.exercise, r.setNumber);
                    if (row) openPendingAt(row.id);
                  }}
                  halfDone={
                    r.status === 'current' && r.sidesDone.length === 1
                      ? `${r.sidesDone[0] === 'L' ? 'G' : 'D'} ✓`
                      : null
                  }
                />
              );
            })}
          </View>
        </View>

        {/* ── Réglages du superset (repliés) ── */}
        <SupersetSettings
          restMode={restMode}
          onRestModeChange={(m: RestMode) => { setActiveSession({ supersetRestMode: m }); refresh(); }}
          a={settingsFor('a')}
          b={settingsFor('b')}
          onUnilateralChange={(k, v) => patchByLog('unilateralByLog', k, v)}
          onRestBetweenSidesChange={(k, v) => patchByLog('restBetweenSidesByLog', k, v)}
          onHalveRestChange={(k, v) => patchByLog('halveRestByLog', k, v)}
          deferEncoding={s.deferEncodingInSuperset}
          onDeferEncodingChange={(v) => { setActiveSession({ deferEncodingInSuperset: v }); refresh(); }}
        />

        {/* ── Série en cours ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {phase === 'execution'
              ? `${stepName} · Série ${step.setNumber}${sideLabel(step.side)} en cours`
              : phase === 'rest'
              ? `Repos · ${stepName} série ${step.setNumber}${sideLabel(step.side)} à venir`
              : `${stepName} · Série ${step.setNumber}${sideLabel(step.side)}`}
          </Text>

          {phase !== 'idle' && (
            <TimerDisplay startedAt={s.timerStartedAt} targetSeconds={s.timerTargetSeconds} isRunning />
          )}

          {/* Toggle auto/manuel — toujours visible */}
          <View style={styles.modeRow}>
            <Text style={styles.smallLabel}>Mode :</Text>
            {(['auto', 'manual'] as const).map((m) => (
              <Pressable
                key={m}
                style={[styles.modeChip, s.timerMode === m && styles.modeChipActive]}
                onPress={() => { setActiveSession({ timerMode: m }); refresh(); }}
              >
                <Text style={[styles.modeText, s.timerMode === m && styles.modeTextActive]}>
                  {m === 'auto' ? 'Auto' : 'Manuel'}
                </Text>
              </Pressable>
            ))}
            <Pressable
              hitSlop={8}
              onPress={() =>
                Alert.alert(
                  'Modes de repos',
                  'Auto : quand le décompte atteint 0, l\'étape suivante démarre automatiquement.\n\nManuel : le chrono continue en négatif, tu démarres l\'étape quand tu es prêt en appuyant sur "Commencer maintenant".'
                )
              }
            >
              <Text style={styles.infoIcon}>ⓘ</Text>
            </Pressable>
          </View>

          {/* Repos : l'objectif du plan = chip « Prévu » présélectionnée */}
          {(phase === 'rest' || phase === 'idle') && (
            <RestPresetPicker
              presets={dataA.presets}
              overrideSeconds={s.restOverrideByLog[pickerId] ?? null}
              plannedSeconds={getTargetRestSeconds(pickerEnriched, pickerSetNumber)}
              onSelect={handleSelectPreset}
              onSelectPlanned={handleSelectPlanned}
              onEditPresets={() => router.push('/seance/presets-repos' as any)}
            />
          )}

          <View style={styles.buttonRow}>
            {phase === 'idle' && (
              <Pressable style={styles.primaryBtn} onPress={handleCommencer}>
                <Text style={styles.primaryBtnText}>
                  Commencer {stepName}{sideLabel(step.side)}
                </Text>
              </Pressable>
            )}
            {(phase === 'idle' || phase === 'rest') && (
              <Pressable
                style={[styles.primaryBtn, styles.manualBtn]}
                onPress={() => { setEditing(null); setModalVisible(true); }}
              >
                <Text style={styles.manualBtnText}>
                  + Encoder {stepName} · série {step.setNumber}{sideLabel(step.side)}
                </Text>
              </Pressable>
            )}
            {phase === 'execution' && upNext && <Text style={styles.upNext}>{upNext}</Text>}
            {phase === 'execution' && (
              <Pressable style={[styles.primaryBtn, styles.stopBtn]} onPress={handleTerminer}>
                <Text style={styles.primaryBtnText}>Terminer série</Text>
              </Pressable>
            )}
            {phase === 'rest' && (
              <Pressable style={[styles.primaryBtn, styles.startEarlyBtn]} onPress={handleCommencer}>
                <Text style={styles.primaryBtnText}>
                  Commencer {stepName}{sideLabel(step.side)} maintenant
                </Text>
              </Pressable>
            )}
            <Pressable style={[styles.primaryBtn, styles.doneBtn]} onPress={handleFinishSuperset}>
              <Text style={styles.primaryBtnText}>Terminer le superset ✓</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Séries de cette séance, entrelacées ── */}
        {loggedChunks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Séries de cette séance</Text>
            {loggedChunks.map((c) => (
              <View key={`${c.exercise}-${c.setNumber}`} style={styles.chunk}>
                <Text style={styles.chunkName}>{shortName(enrichedOf(c.exercise).exercise.name)}</Text>
                <SetLogList
                  setLogs={c.logged}
                  weightUnit={dataOf(c.exercise).weightUnit}
                  firstSide={firstSideOf(c.exercise)}
                  onEdit={(row) => { setEditing({ key: c.exercise, row }); setModalVisible(true); }}
                  onDelete={(group, n) => handleDeleteSetLog(c.exercise, group, n)}
                  onEncode={(row) => openPendingAt(row.id)}
                />
              </View>
            ))}
          </View>
        )}

        {/* ── Historique : séances où A ou B a été fait ── */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historique</Text>
            {history.map((group) => (
              <View key={group.sessionId} style={styles.histGroup}>
                <Text style={styles.histDate}>{formatDate(group.sessionDate)}</Text>
                {(['a', 'b'] as const).map((key) => {
                  const g = group[key];
                  if (!g || g.sets.length === 0) return null;
                  return (
                    <View key={key} style={styles.chunk}>
                      <Text style={styles.chunkName}>
                        {shortName(enrichedOf(key).exercise.name)}
                        {g.variation ? ` · ${g.variation}` : ''}
                      </Text>
                      <SetLogList
                        setLogs={g.sets}
                        weightUnit={dataOf(key).weightUnit}
                        firstSide={firstSideOf(key)}
                      />
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
        onClose={() => { setModalVisible(false); setEditing(null); }}
        onSave={isEditing ? handleSaveEdit : handleSaveManual}
        weightUnit={modalData.weightUnit}
        exerciseId={modalEnriched.exercise.id}
        exerciseName={modalEnriched.exercise.name}
        setNumber={modalSetNumber}
        side={modalSide}
        prefillWeightKg={isEditing ? editing!.row.weight : prefill.weightKg}
        prefillReps={isEditing ? editing!.row.reps : prefill.reps}
        prefillRir={isEditing ? editing!.row.rir : prefill.rir}
        prefillPartialReps={isEditing ? editing!.row.partialReps : prefill.partialReps}
        prefillPdc={isEditing ? (editing!.row.pdc ?? false) : prefill.pdc}
        prefillNote={isEditing ? editing!.row.note : null}
      />

      {pendingModal && (
        <PendingSetsModal
          key={pendingModal.key}
          visible
          items={pendingItems}
          initialRowId={pendingModal.initialId}
          onComplete={handlePendingComplete}
          onClose={handlePendingClose}
        />
      )}
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  loading: { textAlign: 'center', marginTop: 40, color: '#8E8E93' },
  scroll: { padding: 16, gap: 16, paddingBottom: 40 },
  titleBlock: { paddingHorizontal: 4 },
  title: { fontSize: 20, fontWeight: '700', color: '#1C1C1E' },
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
  list: { gap: 6 },
  smallLabel: { fontSize: 13, color: '#8E8E93' },
  modeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  modeChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F2F2F7' },
  modeChipActive: { backgroundColor: '#007AFF' },
  modeText: { fontSize: 14, fontWeight: '500', color: '#1C1C1E' },
  modeTextActive: { color: '#FFFFFF' },
  infoIcon: { fontSize: 18, color: '#8E8E93', marginLeft: 2 },
  buttonRow: { marginTop: 4, gap: 8 },
  primaryBtn: { backgroundColor: '#007AFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  stopBtn: { backgroundColor: '#FF3B30' },
  startEarlyBtn: { backgroundColor: '#34C759' },
  doneBtn: { backgroundColor: '#8E8E93' },
  upNext: { fontSize: 14, fontWeight: '600', color: '#3A3A3C', textAlign: 'center' },
  manualBtn: { backgroundColor: '#F0F7FF', borderWidth: 1, borderColor: '#C8E0FF' },
  manualBtnText: { color: '#007AFF', fontSize: 16, fontWeight: '600' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  chunk: { gap: 2 },
  chunkName: { fontSize: 13, fontWeight: '600', color: '#007AFF' },
  histGroup: { gap: 4 },
  histDate: { fontSize: 13, fontWeight: '600', color: '#007AFF', marginBottom: 2 },
});
