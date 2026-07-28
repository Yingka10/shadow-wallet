// Shadow Wallet · Parent Tablet — 預設任務抽屜
//
// 定位：ParentTaskManagementTablet 上方的 overlay，不是新 route（不動導航結構）。
//
// 為什麼是 Modal + 自幹動畫：
//   RN Modal 的 animationType 只有 slide(由下) / fade / none，沒有右滑，
//   所以用 animationType="none" 讓 Modal 只當 portal，位移交給 reanimated
//   （專案已用於 HomeScreen；moti 未被 jest transformIgnorePatterns 放行，會讓測試套件掛掉）。
//   為了讓「滑出」也看得到，關閉時先播動畫、動畫結束才真的卸載 Modal（見 mounted / shown）。
//
// 四個畫面：
//   pick    選任務家族
//   edit    選執行版本 + 調整草稿（實際表單在 editors/，不寫在這支）
//   review  唯讀預覽 + 真正會送出的回饋決策
//   success 建立完成摘要（不瞬間關掉抽屜，見 CreatedTaskSummary 的說明）
//
// 這支只負責：Drawer 狀態、family/variant 狀態、draft 狀態、step 切換、
// close / discard 流程、提交狀態機，以及把資料交給 TaskDraftEditor。
// 表單邏輯與建立邏輯都不寫在這裡：前者在 editors/，後者在 submitTaskDraft。
//
// 建立 service 由**上層注入**（見 ParentTaskManagementTablet）。
// 抽屜自己 new 一個的話，測試就得連真的 Supabase，而 Supabase client 在
// import 時就要 URL 與金鑰 —— 整個抽屜會變成沒有環境變數就跑不起來的元件。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ParentColors,
  ParentFonts,
  ParentFontSizes,
  ParentFontWeights,
  ParentRadii,
  ParentShadows,
  ParentSpacing,
} from '../../../../constants/parentTheme';
import { calcAgeGroup } from '../../../../lib/onboarding';
import { TaskPresetCard } from './TaskPresetCard';
import { escapeActionFor, panelWidthFor, scrimColorFor } from './drawerChrome';
import {
  DisplayModeProvider,
  DEFAULT_DISPLAY_MODE,
  type PresetTaskDrawerDisplayMode,
} from './displayMode';
import {
  AGE_GROUP_LABEL,
  BROWSE_FILTERS,
  defaultVariantOf,
  selectPresetFamilies,
  variantFormLabel,
  type BrowseFilter,
  type TaskPresetFamily,
  type TaskPresetVariant,
} from './taskCatalog';
import {
  applyRoleSelection,
  createTaskDraft,
  hasErrors,
  isDraftDirty,
  isFamilyRoleDraft,
  PREVIEW_BLOCKED_NOTE,
  responsibilitiesTouched,
  shortSupportCopy,
  validateTaskDraft,
  type TaskDraft,
  type TaskDraftValidationErrors,
} from './taskDraft';
import { TASK_POLICY_VERSION } from './taskCatalog';
import {
  newClientRequestId,
  previewTaskRewardDecision,
  submitTaskDraft,
  tabForCreatedTask,
  type CreatedTaskTab,
  type CreateParentTaskCommand,
  type CreateParentTaskFailureCode,
  type ParentTaskCreationService,
} from './taskPersistence';
import { CreatedTaskSummary, DraftReview, TaskDraftEditor } from './editors';
import {
  ChevronLeftIcon,
  CloseIcon,
  InfoIcon,
  SearchIcon,
} from './drawerIcons';

const ANIM_MS = 260;

type DrawerStep = 'pick' | 'edit' | 'review' | 'success';

/**
 * 提交狀態機。
 *
 * 只有三個狀態，而且 success 刻意**不在這裡** —— 建立成功之後畫面整個換了
 * （step 變成 'success'），把它當成第四個提交狀態會讓「按鈕該長什麼樣」
 * 與「畫面該顯示什麼」兩件事纏在一起。
 */
type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'failed'; code: CreateParentTaskFailureCode; message: string };

/** 列表刷新的結果，與提交結果分開記。任務已經建立、列表沒更新，不是建立失敗。 */
type RefreshStatus = 'pending' | 'done' | 'failed';

/** 建立成功之後要記住的東西。清掉它等於「這次建立結束了」。 */
type CreatedTaskState = {
  command: CreateParentTaskCommand;
  taskId: string;
  relatedIds: string[];
  idempotentReplay: boolean;
  tab: CreatedTaskTab;
};

const SUBMITTING_LABEL = '建立中…';
const SUBMITTING_BLOCK_NOTE = '任務正在建立，請稍候。';
const REFRESH_FAILED_NOTE = '任務已建立，但列表暫時沒有更新。';

/**
 * 四種失敗各自的家長文案。
 *
 * PERSISTENCE_FAILED 與 UNKNOWN 一律用固定句子，**不透傳 service 的 message**：
 * 那些可能是 Postgres 或 Supabase 的原始錯誤字串，家長看了幫不上任何忙，
 * 而且會洩漏欄位與函式名稱。POLICY_REJECTED 相反 —— 那是我們自己寫的中文規則說明，
 * 家長需要知道為什麼這個組合不允許。
 */
function failureCopy(
  code: CreateParentTaskFailureCode,
  message: string,
): string {
  switch (code) {
    case 'VALIDATION_FAILED':
      return '有些設定需要再確認。';
    case 'POLICY_REJECTED':
      return message.trim() || '這個組合目前不允許建立。';
    case 'PERSISTENCE_FAILED':
      return '任務尚未建立，請稍後再試。';
    default:
      return '建立時發生預期外的問題，任務尚未建立。';
  }
}

/** dirty 時被攔下、等家長確認放棄後才執行的動作。 */
type PendingAction =
  | { kind: 'close' }
  | { kind: 'selectFamily'; family: TaskPresetFamily }
  | { kind: 'selectVariant'; variantId: string }
  /** 換家庭角色會重建責任項目 —— 已改過就要先確認，不可無聲覆蓋。 */
  | { kind: 'selectRole'; roleOptionId: string };

export type PresetTaskDrawerChild = {
  /** children.id。建立命令一定要帶它，不可以由抽屜自己去查。 */
  id: string;
  nickname: string;
  birthDate: string;
  familyId: string;
};

/** 依 birth_date 算實足年齡（年）。年齡段一律走既有的 calcAgeGroup，不另立規則。 */
function calcAgeYears(birthDate: string): number | null {
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * 「自訂分鐘」輸入框的初始文字。
 * 三種帶分鐘的草稿欄位名稱不同（成長計畫與固定任務是 minutesPerSession、
 * 單次任務是 estimatedMinutes），集中在這裡轉換，不在 buildDraft 裡分支。
 */
function minuteSeedOf(draft: TaskDraft): string {
  if (draft.editorKind === 'growth_plan' || draft.editorKind === 'recurring') {
    return draft.minutesPerSession !== undefined ? String(draft.minutesPerSession) : '';
  }
  if (draft.editorKind === 'one_time') {
    return draft.estimatedMinutes !== undefined ? String(draft.estimatedMinutes) : '';
  }
  return '';
}

export function PresetTaskDrawer({
  visible,
  onClose,
  child,
  childLoading,
  displayMode = DEFAULT_DISPLAY_MODE,
  taskCreationService,
  onRefreshTaskList,
  onSwitchTab,
}: {
  visible: boolean;
  onClose: () => void;
  /** 來自 useParentTaskList 的 child；尚未載入時為 null。 */
  child: PresetTaskDrawerChild | null;
  childLoading: boolean;
  /** demo（預設）＝乾淨畫面；development ＝顯示尚未串接的實作狀態。 */
  displayMode?: PresetTaskDrawerDisplayMode;
  /**
   * 建立 service。由上層注入，抽屜不自己 new。
   * production 傳 SupabaseParentTaskCreationService，測試傳 fake。
   */
  taskCreationService: ParentTaskCreationService;
  /**
   * 重新抓任務列表。用既有 hook 的 refetch，抽屜不自己查 Supabase ——
   * 那會變成第二套查詢，兩邊的過濾條件遲早不一樣。
   */
  onRefreshTaskList?: () => Promise<void>;
  /** 建立成功後切到正確分頁。 */
  onSwitchTab?: (tab: CreatedTaskTab) => void;
}) {
  const { width } = useWindowDimensions();
  const panelWidth = panelWidthFor(width);
  const showsImplementationNotes = displayMode === 'development';

  // mounted 控制 Modal 是否存在；shown 控制動畫終點。分開才播得到滑出。
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(false);

  const [step, setStep] = useState<DrawerStep>('pick');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BrowseFilter>('recommended');
  const [selectedFamily, setSelectedFamily] = useState<TaskPresetFamily | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState<TaskDraft | null>(null);
  const [minuteCustomText, setMinuteCustomText] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  /**
   * 這份草稿的建立請求識別碼。
   * 草稿建立時產生一次，之後預覽、返回修改、失敗重試都用同一個 ——
   * 它是「網路重送不會建出第二筆任務」的唯一依據（見 clientRequestId.ts）。
   */
  const [clientRequestId, setClientRequestId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubmissionState>({ status: 'idle' });
  const [created, setCreated] = useState<CreatedTaskState | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('pending');
  /** RPC 回來的欄位錯誤。與本地驗證的錯誤合併後餵回 editor。 */
  const [serverFieldErrors, setServerFieldErrors] =
    useState<TaskDraftValidationErrors | null>(null);

  const listRef = useRef<ScrollView>(null);
  /**
   * 連點防線。
   *
   * 光靠 submission.status 擋不住：setState 是非同步的，同一個 tick 內的第二次
   * 點擊看到的仍然是 idle。ref 是同步的，所以它才是真正擋住第二次送出的那一道。
   */
  const submitLockRef = useRef(false);

  // 0 = 收合（面板在右側畫面外、遮罩透明）、1 = 展開。
  const progress = useSharedValue(0);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }), []);
  const panelStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: (1 - progress.value) * panelWidth }] }),
    [panelWidth],
  );

  /**
   * 抽屜完全關閉後的歸零。
   *
   * clientRequestId 一定要在這裡清掉：留著的話，下一次開抽屜建立的
   * 另一個任務會沿用同一個識別碼，RPC 會認為那是重送並回傳上一筆 ——
   * 家長按了建立，卻拿到上次那個任務。
   */
  const reset = useCallback(() => {
    setStep('pick');
    setQuery('');
    setFilter('recommended');
    setSelectedFamily(null);
    setSelectedVariantId(null);
    setDraft(null);
    setInitialDraft(null);
    setMinuteCustomText('');
    setShowErrors(false);
    setPendingAction(null);
    setClientRequestId(null);
    setSubmission({ status: 'idle' });
    setCreated(null);
    setRefreshStatus('pending');
    setServerFieldErrors(null);
    submitLockRef.current = false;
  }, []);

  // 開合動畫的掛載/卸載時序
  useEffect(() => {
    if (visible) {
      setMounted(true);
      const t = setTimeout(() => setShown(true), 16);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => {
      setMounted(false);
      reset(); // 關閉後重置搜尋、分類、家族、版本、草稿與 step
    }, ANIM_MS);
    return () => clearTimeout(t);
  }, [visible, reset]);

  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, {
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [shown, progress]);

  const age = child ? calcAgeYears(child.birthDate) : null;
  const ageGroup = child ? calcAgeGroup(child.birthDate) : null;

  const families = useMemo(
    () => selectPresetFamilies(age, filter, query),
    [age, filter, query],
  );

  const selectedVariant: TaskPresetVariant | null = useMemo(() => {
    if (!selectedFamily) return null;
    return (
      selectedFamily.variants.find(v => v.id === selectedVariantId)
      ?? defaultVariantOf(selectedFamily)
    );
  }, [selectedFamily, selectedVariantId]);

  const errors = useMemo(() => {
    if (!draft || !selectedVariant) return {};
    const local = validateTaskDraft(draft, selectedVariant, ageGroup ?? undefined);
    // 本地驗證在前、RPC 回來的在後：後者是我們沒能在前端擋下的，更晚也更權威。
    return serverFieldErrors ? { ...local, ...serverFieldErrors } : local;
  }, [draft, selectedVariant, ageGroup, serverFieldErrors]);

  const submitting = submission.status === 'submitting';

  /** 命令要的孩子資訊。抽屜不查 DB，三個欄位都由呼叫端給。 */
  const commandChild = useMemo(() => {
    if (!child || !ageGroup) return null;
    return { id: child.id, familyId: child.familyId, ageGroup };
  }, [child, ageGroup]);

  /**
   * 預覽上要顯示的回饋決策。
   *
   * 和送出時走的是同一組函式（見 submitTaskDraft），所以畫面顯示的金額
   * 就是等一下真的會寫進資料庫的那個。各算一份才是兩邊說法不同的來源。
   */
  const previewDecision = useMemo(() => {
    if (!draft || !selectedFamily || !selectedVariant || !commandChild || !clientRequestId) {
      return null;
    }
    return previewTaskRewardDecision({
      draft,
      family: selectedFamily,
      variant: selectedVariant,
      child: commandChild,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId,
    });
  }, [draft, selectedFamily, selectedVariant, commandChild, clientRequestId]);

  // dirty 由 initial snapshot 與 current 深度比較得出，不用手動旗標
  // （手動旗標改回原值也不會歸零，會誤觸放棄確認）。
  const dirty = isDraftDirty(initialDraft, draft);

  const buildDraft = useCallback(
    (family: TaskPresetFamily, variant: TaskPresetVariant) => {
      if (!child) return;
      const next = createTaskDraft(family, variant, child, ageGroup ?? undefined);
      setDraft(next);
      setInitialDraft(next);
      setShowErrors(false);
      setMinuteCustomText(minuteSeedOf(next));
      // 新草稿 = 新的建立請求。舊草稿的識別碼不可以帶到這一份上，
      // 否則家長放棄舊草稿、改建另一個任務時會被 RPC 當成重送。
      setClientRequestId(newClientRequestId());
      setSubmission({ status: 'idle' });
      setServerFieldErrors(null);
    },
    [child, ageGroup],
  );

  // ── 動作（可能被 discard 確認攔下） ──────────────────────────────────

  const runAction = useCallback(
    (action: PendingAction) => {
      if (action.kind === 'close') {
        onClose();
        return;
      }
      if (action.kind === 'selectFamily') {
        const variant = defaultVariantOf(action.family);
        setSelectedFamily(action.family);
        setSelectedVariantId(variant.id);
        setDraft(null);
        setInitialDraft(null);
        setShowErrors(false);
        return;
      }
      if (action.kind === 'selectRole') {
        setDraft(current => {
          if (!current || !isFamilyRoleDraft(current)) return current;
          const roleGroupId = selectedVariant?.optionGroups[0]?.id ?? null;
          return applyRoleSelection(current, action.roleOptionId, roleGroupId);
        });
        return;
      }
      if (!selectedFamily) return;
      const variant = selectedFamily.variants.find(v => v.id === action.variantId);
      if (!variant) return;
      setSelectedVariantId(variant.id);
      buildDraft(selectedFamily, variant);
    },
    [buildDraft, onClose, selectedFamily, selectedVariant],
  );

  /** dirty 就先問，不 dirty 直接做。提交進行中一律不做。 */
  const requestAction = useCallback(
    (action: PendingAction) => {
      // 提交中不接受任何會改變草稿或關閉抽屜的動作。
      // RPC 可能已經成功但 response 還沒回來，這時讓家長離開只會讓
      // 「到底建立了沒有」變成猜謎 —— 而下一次重試又要重新問一次。
      if (submitLockRef.current) return;
      if (!dirty) {
        runAction(action);
        return;
      }
      setPendingAction(action);
    },
    [dirty, runAction],
  );

  // ── 建立 ────────────────────────────────────────────────────────────────

  /** 刷新列表。失敗不代表建立失敗，所以結果記在自己的狀態上。 */
  const runRefresh = useCallback(async () => {
    if (!onRefreshTaskList) {
      // 沒有列表要刷新（例如單獨渲染抽屜的測試）。當作已完成，不要卡在 pending。
      setRefreshStatus('done');
      return;
    }
    try {
      await onRefreshTaskList();
      setRefreshStatus('done');
    } catch {
      setRefreshStatus('failed');
    }
  }, [onRefreshTaskList]);

  const handleConfirmCreate = useCallback(async () => {
    if (!draft || !selectedFamily || !selectedVariant || !commandChild || !clientRequestId) return;
    // 同步鎖，擋住同一個 tick 內的第二次點擊。
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmission({ status: 'submitting' });
    setServerFieldErrors(null);

    try {
      const outcome = await submitTaskDraft({
        draft,
        family: selectedFamily,
        variant: selectedVariant,
        child: commandChild,
        taskPolicyVersion: TASK_POLICY_VERSION,
        // 重試沿用同一個識別碼 —— 這是整套 idempotency 的重點。
        clientRequestId,
        service: taskCreationService,
      });

      if (outcome.ok) {
        setCreated({
          command: outcome.command,
          taskId: outcome.taskId,
          relatedIds: outcome.relatedIds,
          idempotentReplay: outcome.idempotentReplay,
          tab: tabForCreatedTask(outcome.command),
        });
        setSubmission({ status: 'idle' });
        setRefreshStatus('pending');
        setStep('success');
        await runRefresh();
        return;
      }

      setSubmission({ status: 'failed', code: outcome.code, message: outcome.message });

      // 欄位問題才回編輯畫面。政策與寫入問題留在預覽 ——
      // 把家長丟回表單卻沒有任何欄位是紅的，只會讓人以為自己填錯了什麼。
      if (outcome.code === 'VALIDATION_FAILED') {
        if (outcome.fieldErrors) setServerFieldErrors(outcome.fieldErrors);
        setShowErrors(true);
        setStep('edit');
      }
    } finally {
      submitLockRef.current = false;
    }
  }, [
    clientRequestId, commandChild, draft, runRefresh,
    selectedFamily, selectedVariant, taskCreationService,
  ]);

  /** 成功之後才會用到：確保列表至少刷新過一次，但不重複刷。 */
  const ensureRefreshed = useCallback(() => {
    if (refreshStatus === 'done') return;
    void runRefresh();
  }, [refreshStatus, runRefresh]);

  const handleFinishSuccess = useCallback(() => {
    ensureRefreshed();
    onClose();
  }, [ensureRefreshed, onClose]);

  const handleViewCreatedTask = useCallback(() => {
    if (created) onSwitchTab?.(created.tab);
    ensureRefreshed();
    onClose();
  }, [created, ensureRefreshed, onClose, onSwitchTab]);

  const handleClose = useCallback(() => {
    if (submitLockRef.current) return;
    // 成功畫面的 X 等同「完成」：任務已經建立，這時不該再問「要放棄嗎」。
    if (created) {
      handleFinishSuccess();
      return;
    }
    requestAction({ kind: 'close' });
  }, [created, handleFinishSuccess, requestAction]);

  // web 平板：ESC 關閉。RN 沒有鍵盤事件，只在 web 掛 document listener。
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const doc = (globalThis as unknown as { document?: Document }).document;
    if (!doc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // 提交中 ESC 完全沒有作用（與 X、遮罩一致）。
      if (submitLockRef.current) return;
      if (escapeActionFor(!!pendingActionRef.current) === 'dismissConfirmation') {
        setPendingAction(null);
        return;
      }
      handleClose();
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [visible, handleClose]);

  // listener 只掛一次，用 ref 讀最新的 pendingAction，避免每次開合確認框都重掛。
  const pendingActionRef = useRef<PendingAction | null>(null);
  pendingActionRef.current = pendingAction;

  const handleFilterChange = useCallback((next: BrowseFilter) => {
    setFilter(next);
    listRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  /** Step 1 選家族：同一個家族不需確認（草稿保留），換家族且 dirty 才問。 */
  const handleSelectFamily = useCallback(
    (family: TaskPresetFamily) => {
      if (selectedFamily?.id === family.id) return;
      requestAction({ kind: 'selectFamily', family });
    },
    [requestAction, selectedFamily],
  );

  /** Step 2 換執行版本：dirty 時要確認，因為換版本等於重建草稿。 */
  const handleSelectVariant = useCallback(
    (variantId: string) => {
      if (selectedVariantId === variantId) return;
      requestAction({ kind: 'selectVariant', variantId });
    },
    [requestAction, selectedVariantId],
  );

  /**
   * 換家庭角色：只有「責任項目已被家長改過」時才需要確認 ——
   * 沒改過就直接套新角色的建議責任，不用煩家長。
   */
  const handleRequestRoleChange = useCallback(
    (roleOptionId: string) => {
      if (!draft || !isFamilyRoleDraft(draft)) return;
      if (draft.roleOptionId === roleOptionId) return;

      const baseline =
        initialDraft && isFamilyRoleDraft(initialDraft) ? initialDraft : null;
      const touched = responsibilitiesTouched(draft, baseline);

      if (!touched) {
        runAction({ kind: 'selectRole', roleOptionId });
        return;
      }
      setPendingAction({ kind: 'selectRole', roleOptionId });
    },
    [draft, initialDraft, runAction],
  );

  /** Step 1 →Step 2：家族/版本沒換就沿用既有草稿，換了才重建。 */
  const handleNext = useCallback(() => {
    if (!selectedFamily || !selectedVariant || !child) return;
    const stale =
      !draft
      || draft.familyId !== selectedFamily.id
      || draft.variantId !== selectedVariant.id;
    if (stale) buildDraft(selectedFamily, selectedVariant);
    setStep('edit');
  }, [buildDraft, child, draft, selectedFamily, selectedVariant]);

  /** Step 2 → Step 1：不清草稿、不需確認（家長只是回去看看）。 */
  const handleBackToPick = useCallback(() => {
    setStep('pick');
  }, []);

  /** 預覽 → 編輯。順手清掉上一次的失敗說明：家長正要去改，那句話已經過期了。 */
  const handleBackToEdit = useCallback(() => {
    if (submitLockRef.current) return;
    setSubmission({ status: 'idle' });
    setStep('edit');
  }, []);

  const handlePreview = useCallback(() => {
    if (!draft || !selectedVariant) return;
    const result = validateTaskDraft(draft, selectedVariant, ageGroup ?? undefined);
    if (hasErrors(result)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setSubmission({ status: 'idle' });
    setServerFieldErrors(null);
    setStep('review');
  }, [draft, selectedVariant, ageGroup]);

  if (!mounted) return null;

  const ready = !childLoading && child !== null;
  // 草稿存在且沒有驗證錯誤才進得了預覽。按鈕不因此變 disabled（見 footer）。
  const previewBlocked = !draft || hasErrors(errors);
  /** 家長已經按過一次、而且確實還有錯 —— 這時才在 footer 說明為什麼沒往下走。 */
  const blockedByErrors = showErrors && previewBlocked;

  /**
   * blocked 的回饋決策不可以建立。
   *
   * 正常流程走不到（能力閘門讓家長選不到用不了的政策），這道是為了
   * 「預覽開著時草稿被改到能力失效」——那時按鈕必須立刻擋住，不是等 RPC 拒絕。
   */
  const rewardBlocked = previewDecision?.eligibility === 'blocked';
  const canConfirmCreate =
    !!draft && !!previewDecision && !rewardBlocked && !!clientRequestId && !submitting;

  const stepTitle = (() => {
    if (step === 'pick') return ready ? `為 ${child.nickname} 建立新任務` : '建立新任務';
    if (step === 'success') return '任務已建立';
    if (step === 'review') return '預覽最終版本';
    if (draft?.editorKind === 'short_support' && selectedFamily) {
      return shortSupportCopy(selectedFamily.id).headerTitle;
    }
    if (draft?.editorKind === 'growth_plan') return '調整成長計畫';
    if (draft?.editorKind === 'recurring') return '調整固定任務';
    if (draft?.editorKind === 'family_role') return '調整家庭角色';
    if (draft?.editorKind === 'one_time') return '調整單次任務';
    return '調整任務內容';
  })();

  const stepHint = (() => {
    if (step === 'pick') return '先選一個適合的起點，內容仍可再調整';
    if (step === 'success') return `已加入 ${child?.nickname ?? '孩子'}的任務清單`;
    if (step === 'review') {
      return submitting ? SUBMITTING_BLOCK_NOTE : '確認以下內容，還可以回去修改';
    }
    if (draft?.editorKind === 'short_support') return '一次先處理一個具體卡點，穩定後就可以結束';
    if (draft?.editorKind === 'growth_plan') return '先看適齡起點，再改成適合你們家的版本';
    if (draft?.editorKind === 'recurring') {
      return '先說清楚要做什麼、何時出現，以及怎樣算完成';
    }
    if (draft?.editorKind === 'family_role') return '先試行一段時間，再一起決定是否繼續';
    if (draft?.editorKind === 'one_time') {
      return '把這次要完成的內容與標準說清楚，完成後即結束';
    }
    return '選擇這件事要怎麼進行';
  })();

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
     <DisplayModeProvider mode={displayMode}>
      <View style={s.root}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} pointerEvents="auto">
          {/*
            提交中遮罩仍然擋住底下的畫面，但不再是關閉按鈕 ——
            點一下就關掉、而 RPC 其實已經成功，是最難收拾的那種狀態。
          */}
          <Pressable
            style={[s.scrim, { backgroundColor: scrimColorFor(width) }]}
            onPress={handleClose}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitting }}
            accessibilityLabel={submitting ? '建立中，暫時無法關閉' : '關閉新增任務'}
          />
        </Animated.View>

        <Animated.View style={[s.panel, { width: panelWidth }, panelStyle]}>
          <View
            style={s.panelBody}
            pointerEvents={pendingAction ? 'none' : 'auto'}
            accessibilityElementsHidden={!!pendingAction}
            importantForAccessibility={pendingAction ? 'no-hide-descendants' : 'auto'}
          >
          {/* ── Header（固定） ─────────────────────────────────────────── */}
          <View style={s.header}>
            <View style={s.headerTop}>
              <View style={s.headerText}>
                <Text style={s.headerTitle}>{stepTitle}</Text>
                {step === 'pick' ? (
                  <Text style={s.headerSub}>
                    {ready
                      ? `${age !== null ? `${age} 歲｜` : ''}${
                          ageGroup ? `${AGE_GROUP_LABEL[ageGroup]} 建議` : '依年齡建議'
                        }`
                      : '正在載入孩子資料…'}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[s.closeButton, submitting && s.closeButtonDisabled]}
                onPress={handleClose}
                disabled={submitting}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitting }}
                accessibilityLabel={submitting ? '建立中，暫時無法關閉' : '關閉'}
              >
                <CloseIcon />
              </TouchableOpacity>
            </View>
            <Text style={s.headerHint}>{stepHint}</Text>
          </View>

          {/* ── 內容（可滾動） ─────────────────────────────────────────── */}
          {step === 'pick' ? (
            <PickStep
              ready={ready}
              childName={ready ? child.nickname : ''}
              listRef={listRef}
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={handleFilterChange}
              families={families}
              selectedFamily={selectedFamily}
              onSelect={handleSelectFamily}
            />
          ) : (
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {step === 'edit' && selectedFamily && selectedVariant && draft && child ? (
                <>
                  {selectedFamily.variants.length > 1 ? (
                    <View style={s.variantSwitch}>
                      <Text style={s.variantSwitchLabel}>執行方式</Text>
                      <View style={s.variantSwitchRow}>
                        {selectedFamily.variants.map(item => {
                          const active = item.id === selectedVariant.id;
                          return (
                            <Pressable
                              key={item.id}
                              style={({ pressed }) => [
                                s.variantChip,
                                active && s.variantChipOn,
                                pressed && !active && s.variantChipPressed,
                              ]}
                              onPress={() => handleSelectVariant(item.id)}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                            >
                              <Text
                                style={[s.variantChipText, active && s.variantChipTextOn]}
                              >
                                {item.label}
                              </Text>
                              <Text
                                style={[s.variantChipMeta, active && s.variantChipMetaOn]}
                              >
                                {variantFormLabel(item)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  <TaskDraftEditor
                    family={selectedFamily}
                    variant={selectedVariant}
                    draft={draft}
                    childName={child.nickname}
                    ageGroup={ageGroup ?? undefined}
                    errors={errors}
                    showErrors={showErrors}
                    minuteCustomText={minuteCustomText}
                    onMinuteCustomTextChange={setMinuteCustomText}
                    onChange={setDraft}
                    onRequestRoleChange={handleRequestRoleChange}
                  />
                </>
              ) : null}

              {step === 'review' && selectedFamily && selectedVariant && draft ? (
                <DraftReview
                  family={selectedFamily}
                  variant={selectedVariant}
                  draft={draft}
                  decision={previewDecision}
                />
              ) : null}

              {step === 'success' && selectedFamily && selectedVariant && created ? (
                <CreatedTaskSummary
                  family={selectedFamily}
                  variant={selectedVariant}
                  command={created.command}
                />
              ) : null}
            </ScrollView>
          )}

          {/* ── Footer（固定） ─────────────────────────────────────────── */}
          <View style={s.footer}>
            {step === 'pick' ? (
              <>
                <TouchableOpacity
                  style={s.ghostButton}
                  onPress={handleClose}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Text style={s.ghostButtonText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.primaryButton, !selectedFamily && s.primaryButtonDisabled]}
                  onPress={handleNext}
                  disabled={!selectedFamily}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !selectedFamily }}
                  accessibilityHint={selectedFamily ? undefined : '請先選一個任務起點'}
                >
                  <Text
                    style={[
                      s.primaryButtonText,
                      !selectedFamily && s.primaryButtonTextDisabled,
                    ]}
                  >
                    下一步
                  </Text>
                </TouchableOpacity>
              </>
            ) : step === 'edit' ? (
              /*
                預覽鈕刻意保持可按。永遠 disabled 的按鈕不會告訴家長少了什麼，
                只會讓人反覆點一顆沒有反應的東西；按下去才把錯誤標出來。
                真正的閘門在 handlePreview —— 有錯就只設 showErrors，不切 step。
              */
              <View style={s.editFooter}>
                {blockedByErrors ? (
                  <Text style={s.editFooterNote}>{PREVIEW_BLOCKED_NOTE}</Text>
                ) : null}
                <View style={s.editFooterRow}>
                  <TouchableOpacity
                    style={s.ghostButton}
                    onPress={handleBackToPick}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                  >
                    <ChevronLeftIcon />
                    <Text style={s.ghostButtonText}>返回選擇</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.primaryButton}
                    onPress={handlePreview}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="檢查並預覽"
                    accessibilityHint={
                      previewBlocked ? '還有必填欄位沒完成，按下會標出位置' : undefined
                    }
                  >
                    {/*
                      文案固定，不隨 errors 在兩句之間跳動 ——
                      按鈕寬度與語意每次驗證後都變一次，比看不懂更難用。
                      「檢查並預覽」同時說明了兩種結果：有錯就標出來，沒錯就往下走。
                    */}
                    <Text style={s.primaryButtonText}>檢查並預覽</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : step === 'success' ? (
              <SuccessFooter
                refreshStatus={refreshStatus}
                onRetryRefresh={() => void runRefresh()}
                onViewTask={handleViewCreatedTask}
                onFinish={handleFinishSuccess}
              />
            ) : (
              <View style={s.reviewFooter}>
                {submission.status === 'failed' ? (
                  <View
                    style={s.errorPanel}
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                  >
                    <Text style={s.errorPanelText}>
                      {failureCopy(submission.code, submission.message)}
                    </Text>
                    {/*
                      內部 code 只在 development 顯示。demo / production 看到
                      「PERSISTENCE_FAILED」除了嚇人之外沒有任何用處。
                    */}
                    {showsImplementationNotes ? (
                      <Text style={s.errorPanelCode}>
                        {submission.code}｜{submission.message}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {submitting ? (
                  <Text style={s.reviewFooterNote}>{SUBMITTING_BLOCK_NOTE}</Text>
                ) : null}
                <View style={s.reviewFooterRow}>
                  <TouchableOpacity
                    style={[s.ghostButton, submitting && s.ghostButtonDisabled]}
                    onPress={handleBackToEdit}
                    disabled={submitting}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: submitting }}
                  >
                    <ChevronLeftIcon />
                    <Text style={s.ghostButtonText}>返回修改</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.primaryButton, !canConfirmCreate && s.primaryButtonDisabled]}
                    onPress={handleConfirmCreate}
                    disabled={!canConfirmCreate}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canConfirmCreate, busy: submitting }}
                    accessibilityLabel={submitting ? '正在建立任務，請稍候' : '確認建立'}
                    accessibilityHint={
                      rewardBlocked ? '目前的回饋方式不能使用，請先返回修改' : undefined
                    }
                  >
                    {/*
                      loading 不只靠顏色：文案換成「建立中…」，旁邊有 indicator，
                      accessibilityState.busy 也設好 —— 讀螢幕的人同樣知道在等什麼。
                    */}
                    {submitting ? (
                      <View style={s.submittingRow}>
                        <ActivityIndicator size="small" color={ParentColors.fgMuted} />
                        <Text style={[s.primaryButtonText, s.primaryButtonTextDisabled]}>
                          {SUBMITTING_LABEL}
                        </Text>
                      </View>
                    ) : (
                      <Text
                        style={[
                          s.primaryButtonText,
                          !canConfirmCreate && s.primaryButtonTextDisabled,
                        ]}
                      >
                        確認建立
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          </View>

          {/* ── 放棄修改確認（抽屜內，不是第二層 Modal） ───────────────── */}
          {pendingAction ? (
            <View style={s.discardOverlay}>
              <Pressable
                style={s.discardScrim}
                onPress={() => setPendingAction(null)}
                accessibilityRole="button"
                accessibilityLabel="繼續編輯"
              />
              <View style={s.discardCard}>
                <Text style={s.discardTitle}>要放棄這次的調整嗎？</Text>
                <Text style={s.discardBody}>
                  目前修改的內容尚未建立，離開後會清除。
                </Text>
                {/*
                  安全操作（繼續編輯）才是主要按鈕。破壞性操作用淡底＋磚紅字，
                  份量刻意低於主要按鈕 —— 誤觸的代價是家長剛填的內容全沒了。
                */}
                <View style={s.discardActions}>
                  <TouchableOpacity
                    style={s.confirmPrimary}
                    onPress={() => setPendingAction(null)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="繼續編輯，保留目前的調整"
                  >
                    <Text style={s.confirmPrimaryText}>繼續編輯</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.confirmDanger}
                    accessibilityRole="button"
                    accessibilityLabel="放棄並離開，清除目前的調整"
                    accessibilityHint="這個動作會清除尚未建立的內容"
                    onPress={() => {
                      const action = pendingAction;
                      setPendingAction(null);
                      runAction(action);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={s.confirmDangerText}>放棄並離開</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </View>
     </DisplayModeProvider>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// 成功畫面的 footer
// ---------------------------------------------------------------------------

/**
 * 刷新失敗時換一組按鈕。
 *
 * 關鍵是**不提供「再試一次建立」**：任務已經建立好了，重來一次只會讓家長
 * 以為剛才失敗。這裡能重試的只有「更新列表」這件事。
 */
function SuccessFooter({
  refreshStatus,
  onRetryRefresh,
  onViewTask,
  onFinish,
}: {
  refreshStatus: RefreshStatus;
  onRetryRefresh: () => void;
  onViewTask: () => void;
  onFinish: () => void;
}) {
  return (
    <View style={s.reviewFooter}>
      {refreshStatus === 'failed' ? (
        <Text style={s.reviewFooterNote}>{REFRESH_FAILED_NOTE}</Text>
      ) : null}
      <View style={s.reviewFooterRow}>
        {refreshStatus === 'failed' ? (
          <TouchableOpacity
            style={s.ghostButton}
            onPress={onRetryRefresh}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="再次更新任務列表"
          >
            <Text style={s.ghostButtonText}>再次更新</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={s.ghostButton}
            onPress={onFinish}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={s.ghostButtonText}>完成</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={s.primaryButton}
          onPress={refreshStatus === 'failed' ? onFinish : onViewTask}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={s.primaryButtonText}>
            {refreshStatus === 'failed' ? '完成' : '查看任務'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — 選擇任務起點（家族）
// ---------------------------------------------------------------------------

function PickStep({
  ready,
  childName,
  listRef,
  query,
  onQueryChange,
  filter,
  onFilterChange,
  families,
  selectedFamily,
  onSelect,
}: {
  ready: boolean;
  childName: string;
  listRef: React.RefObject<ScrollView | null>;
  query: string;
  onQueryChange: (v: string) => void;
  filter: BrowseFilter;
  onFilterChange: (v: BrowseFilter) => void;
  families: TaskPresetFamily[];
  selectedFamily: TaskPresetFamily | null;
  onSelect: (f: TaskPresetFamily) => void;
}) {
  const isRecommendedView = filter === 'recommended' && query.trim().length === 0;

  return (
    <>
      <View style={s.controls}>
        <View style={s.searchBox}>
          <SearchIcon />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={onQueryChange}
            placeholder="搜尋閱讀、運動、家庭參與……"
            placeholderTextColor={ParentColors.fgMuted}
            returnKeyType="search"
            accessibilityLabel="搜尋預設任務"
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {BROWSE_FILTERS.map(item => {
            const active = filter === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[s.chip, active && s.chipActive]}
                onPress={() => onFilterChange(item.id)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        ref={listRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filter === 'family_participation' ? (
          <View style={s.policyNote}>
            <InfoIcon />
            <Text style={s.policyNoteText}>
              家庭參與會記錄孩子對共同生活的投入，預設不發成長幣。
              若是孩子主動承接、明顯超出原本責任的額外協助，可在下一步重新確認任務性質。
            </Text>
          </View>
        ) : null}

        {filter === 'life_routine' ? (
          <View style={s.policyNote}>
            <InfoIcon />
            <Text style={s.policyNoteText}>
              生活小計畫是遇到實際困難時的短期支援，以進度與肯定回饋、不發成長幣，
              孩子穩定之後就會結束。
            </Text>
          </View>
        ) : null}

        {!ready ? (
          <View style={s.stateBox}>
            <Text style={s.stateText}>正在載入孩子資料，稍後就會顯示適合的起點。</Text>
          </View>
        ) : families.length === 0 ? (
          <View style={s.stateBox}>
            <Text style={s.stateText}>沒有符合的起點。換個關鍵字，或改看其他分類。</Text>
          </View>
        ) : (
          <View style={s.cardList}>
            {/*
              推薦視圖才給標題。搜尋與其他分類的結果不是「推薦」，
              掛上推薦字樣會變成過度承諾。
            */}
            {isRecommendedView ? (
              <View style={s.recommendHead}>
                <Text style={s.recommendTitle}>推薦起點</Text>
                <Text style={s.recommendSub}>
                  依{childName || '孩子'}目前的年齡，先從這些常見方向開始。
                </Text>
              </View>
            ) : null}

            {families.map((family, index) => (
              <TaskPresetCard
                key={family.id}
                family={family}
                selected={selectedFamily?.id === family.id}
                onPress={onSelect}
                // 推薦清單後段用 compact：前三張留完整說明就夠建立判斷。
                density={isRecommendedView && index >= 3 ? 'compact' : 'full'}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  scrim: {
    // 顏色由 scrimColorFor(width) 決定（窄 viewport 用較深的 scrimCompact）。
    flex: 1,
  },
  panel: {
    height: '100%',
    backgroundColor: ParentColors.bgCanvas,
    borderLeftWidth: 1,
    borderLeftColor: ParentColors.borderSoft,
    ...ParentShadows.elev,
  },

  // Header
  header: {
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[6],
    paddingBottom: ParentSpacing[4],
    backgroundColor: ParentColors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
    gap: ParentSpacing[2],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  headerTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h2,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 30,
  },
  headerSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgSecondary,
    lineHeight: 20,
  },
  headerHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    color: ParentColors.fgMuted,
    lineHeight: 20,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ParentColors.bgSurfaceWarm,
    flexShrink: 0,
  },

  // 搜尋 + chips
  controls: {
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[4],
    paddingBottom: ParentSpacing[3],
    gap: ParentSpacing[3],
    backgroundColor: ParentColors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: ParentColors.borderSoft,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    minHeight: 44,
    paddingHorizontal: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgPrimary,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
    paddingRight: ParentSpacing[2],
  },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    borderRadius: ParentRadii.pill,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgCanvas,
  },
  chipActive: {
    backgroundColor: ParentColors.pine500,
    borderColor: ParentColors.pine500,
  },
  chipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.medium,
    color: ParentColors.fgSecondary,
  },
  chipTextActive: {
    color: ParentColors.onSidebar,
    fontWeight: ParentFontWeights.bold,
  },

  // 內容
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ParentSpacing[6],
    paddingTop: ParentSpacing[4],
    paddingBottom: ParentSpacing[8],
    gap: ParentSpacing[3],
  },
  cardList: {
    gap: ParentSpacing[3],
  },
  policyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ParentSpacing[3],
    padding: ParentSpacing[4],
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.tintPine,
  },
  policyNoteText: {
    flex: 1,
    minWidth: 0,
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  stateBox: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[6],
    borderRadius: ParentRadii.lg,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  stateText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    textAlign: 'center',
    color: ParentColors.fgMuted,
  },

  // Step 2 的版本切換
  variantSwitch: {
    gap: ParentSpacing[2],
  },
  variantSwitchLabel: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  variantSwitchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ParentSpacing[2],
  },
  variantChip: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[2],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
    gap: 2,
  },
  variantChipOn: {
    borderColor: ParentColors.pine300,
    backgroundColor: ParentColors.tintPine,
  },
  variantChipPressed: {
    backgroundColor: ParentColors.bgSurfaceWarm,
  },
  variantChipText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.fgPrimary,
  },
  variantChipTextOn: {
    color: ParentColors.pine500,
  },
  variantChipMeta: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    color: ParentColors.fgMuted,
  },
  variantChipMetaOn: {
    color: ParentColors.pine400,
  },

  /** header + 內容 + footer；確認框開啟時整塊設為不可互動。 */
  panelBody: {
    flex: 1,
    minHeight: 0,
  },

  // 推薦區標題
  recommendHead: {
    gap: 3,
    paddingBottom: ParentSpacing[1],
  },
  recommendTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.base,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 23,
  },
  recommendSub: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 20,
    color: ParentColors.fgMuted,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
    paddingHorizontal: ParentSpacing[6],
    // 上下各收 4px；按鈕本身仍 46px，觸控區沒有變小。
    paddingVertical: ParentSpacing[4] - 4,
    backgroundColor: ParentColors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: ParentColors.borderSoft,
  },
  ghostButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ParentSpacing[1],
    minHeight: 46,
    paddingHorizontal: ParentSpacing[5],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
    backgroundColor: ParentColors.bgSurface,
  },
  ghostButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    color: ParentColors.fgSecondary,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
  },
  primaryButtonDisabled: {
    backgroundColor: ParentColors.bgCanvas,
    borderWidth: 1,
    borderColor: ParentColors.borderSoft,
  },
  primaryButtonText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  primaryButtonTextDisabled: {
    color: ParentColors.fgMuted,
  },
  /** 編輯步驟的 footer：錯誤說明一行 + 按鈕列。沒有錯誤時和原本的單列一樣高。 */
  editFooter: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[2],
  },
  editFooterNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.error,
  },
  editFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  reviewFooter: {
    flex: 1,
    minWidth: 0,
    gap: ParentSpacing[3],
  },
  reviewFooterNote: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
  },
  reviewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[3],
  },
  ghostButtonDisabled: {
    opacity: 0.5,
  },
  closeButtonDisabled: {
    opacity: 0.4,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ParentSpacing[2],
  },
  /**
   * 錯誤說明用淡磚紅底，不是整條紅 bar。
   * 建立失敗多半是暫時的（網路、政策組合），把 footer 變成警報只會讓家長
   * 以為自己剛剛弄壞了什麼。
   */
  errorPanel: {
    paddingHorizontal: ParentSpacing[4],
    paddingVertical: ParentSpacing[3],
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.dangerSoftBorder,
    backgroundColor: ParentColors.dangerSoftBg,
    gap: ParentSpacing[1],
  },
  errorPanelText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 21,
    color: ParentColors.dangerSoft,
  },
  errorPanelCode: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 18,
    color: ParentColors.fgMuted,
  },

  // 放棄修改確認
  discardOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: ParentSpacing[6],
  },
  discardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ParentColors.scrim,
  },
  discardCard: {
    width: '100%',
    padding: ParentSpacing[6],
    borderRadius: ParentRadii.lg,
    backgroundColor: ParentColors.bgSurface,
    gap: ParentSpacing[3],
    ...ParentShadows.elev,
  },
  discardTitle: {
    fontFamily: ParentFonts.display,
    fontSize: ParentFontSizes.h3,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.fgPrimary,
    lineHeight: 26,
  },
  discardBody: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.pMeta,
    lineHeight: 22,
    color: ParentColors.fgSecondary,
  },
  discardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: ParentSpacing[3],
    marginTop: ParentSpacing[2],
  },
  /** 安全操作＝主要按鈕（深松綠實心）。 */
  confirmPrimary: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    backgroundColor: ParentColors.pine500,
  },
  confirmPrimaryText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.bold,
    color: ParentColors.onSidebar,
  },
  /**
   * 破壞性操作＝次要按鈕：淡底、磚紅字與邊框。
   * 刻意不用大面積實心橘 —— 那會讓「清掉家長剛填的內容」變成畫面上最醒目的動作。
   */
  confirmDanger: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ParentRadii.md,
    borderWidth: 1,
    borderColor: ParentColors.dangerSoftBorder,
    backgroundColor: ParentColors.dangerSoftBg,
  },
  confirmDangerText: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.sm,
    fontWeight: ParentFontWeights.semi,
    color: ParentColors.dangerSoft,
  },
});
