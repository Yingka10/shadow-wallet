// Shadow Wallet · Parent Tablet — 統一建立任務抽屜
//
// 定位：ParentTaskManagementTablet 上方的 overlay，不是新 route（不動導航結構）。
//
// 這一支原本叫 PresetTaskDrawer，只有一個入口。第九階段 C 加上「自己建立任務」
// 之後，它的職責變成**兩個入口共用一套建立流程**：
//
//   起點 ─┬─ 從常用任務開始 → 選家族／版本 ─┐
//         │                                  ├→ 五種 editor → 預覽 → 建立 → 完成
//         └─ 自己建立任務 → 想做什麼         │
//                        → 為了什麼          │
//                        → 怎麼進行 ─────────┘
//
// **分岔只在最前面。** 之後的 editor、驗證、規則檢查、回饋決策、建立命令與
// RPC 全部是同一套 —— 沒有第六種 editor，也沒有第二支 RPC。
//
// 為什麼是 Modal + 自幹動畫：
//   RN Modal 的 animationType 只有 slide(由下) / fade / none，沒有右滑，
//   所以用 animationType="none" 讓 Modal 只當 portal，位移交給 reanimated
//   （專案已用於 HomeScreen；moti 未被 jest transformIgnorePatterns 放行，會讓測試套件掛掉）。
//   為了讓「滑出」也看得到，關閉時先播動畫、動畫結束才真的卸載 Modal（見 mounted / shown）。
//
// 畫面由 taskCreationRoute 的 discriminated union 決定，不是模糊的數字 step ——
// 「上一步是哪裡」在兩個入口下的答案不同，用數字表達不了。
//
// 這支只負責：Drawer 狀態、路由、preset 選擇、自訂基本設定、草稿狀態、
// close / discard 流程、提交狀態機，以及把資料交給 TaskDraftEditor。
// 表單邏輯在 editors/，建立邏輯在 submitTaskDraft，路由與 dirty 規則在
// taskCreationRoute / taskCreationState —— 這裡不重寫任何一份。
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
import {
  backRouteFor,
  ENTRY_ROUTE,
  type TaskCreationDrawerRoute,
  type TaskCreationPath,
} from './taskCreationRoute';
import {
  customBasicsSignature,
  customTitleError,
  EMPTY_CUSTOM_INTAKE,
  isCustomIntakeDirty,
  pathSwitchEffect,
  type CustomIntakeState,
} from './taskCreationState';
import {
  applyTaskAiSuggestion,
  buildTaskAiInput,
  canApplyItem,
  canUndoItem,
  collectTaskRuleFindings,
  createTaskAiInputSignature,
  initialItems,
  markItemApplied,
  markItemKept,
  markItemUndone,
  refreshItemStates,
  TASK_AI_COPY,
  undoTaskAiSuggestion,
  userFacingUnavailable,
  validateTaskAiRecommendationResult,
  type TaskAiRecommendationClient,
  type TaskAiReviewState,
  type TaskAiSuggestionItem,
} from './taskAi';
import { resolveTaskAiAvailability } from './customTask';
import {
  confirmCustomTaskEditor,
  createCustomTaskDraft,
  purposeCategoryOf,
  resolveCustomTaskEditor,
  CustomTaskBasicsDuration,
  CustomTaskBasicsPurpose,
  CustomTaskBasicsTitle,
  CustomTaskStart,
  CustomTaskSummaryCard,
  CUSTOM_EDITOR_STAGE_LABEL,
  CUSTOM_HEADER_TITLE,
  DURATION_OPTIONS,
  ENTRY_COPY,
  PURPOSE_DISPLAY_LABEL,
  STEP1_COPY,
  STEP2_COPY,
  STEP3_COPY,
  customSuccessSubtitle,
  type CustomTaskDurationChoice,
  type CustomTaskPurposeChoice,
} from './customTask';

const ANIM_MS = 260;

/**
 * 提交狀態機。
 *
 * 只有三個狀態，而且 success 刻意**不在這裡** —— 建立成功之後畫面整個換了
 * （route 變成 success），把它當成第四個提交狀態會讓「按鈕該長什麼樣」
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

export type TaskCreationDrawerChild = {
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

/** 執行安排的生活化名稱，用於摘要卡。畫面上不出現 durationChoice 的內部值。 */
function durationLabelOf(choice: CustomTaskDurationChoice | null): string | undefined {
  return DURATION_OPTIONS.find(option => option.choice === choice)?.label;
}

export function TaskCreationDrawer({
  visible,
  onClose,
  child,
  childLoading,
  displayMode = DEFAULT_DISPLAY_MODE,
  taskCreationService,
  taskAiClient = null,
  taskAiDeveloperNote,
  onRefreshTaskList,
  onSwitchTab,
}: {
  visible: boolean;
  onClose: () => void;
  /** 來自 useParentTaskList 的 child；尚未載入時為 null。 */
  child: TaskCreationDrawerChild | null;
  childLoading: boolean;
  /** demo（預設）＝乾淨畫面；development ＝顯示尚未串接的實作狀態。 */
  displayMode?: PresetTaskDrawerDisplayMode;
  /**
   * 建立 service。由上層注入，抽屜不自己 new。
   * production 傳 SupabaseParentTaskCreationService，測試傳 fake。
   */
  taskCreationService: ParentTaskCreationService;
  /**
   * AI 建議 client。由上層注入，抽屜不自己建。
   *
   * **null = 這個環境不提供 AI 建議**，AI 區塊整個不顯示。
   * 不是「按了會失敗的 client」—— 那會讓家長對著一顆永遠不會成功的按鈕重試。
   */
  taskAiClient?: TaskAiRecommendationClient | null;
  /** development 才顯示的一行（服務模式）。**不含任何設定值。** */
  taskAiDeveloperNote?: string;
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

  const [route, setRoute] = useState<TaskCreationDrawerRoute>(ENTRY_ROUTE);
  /** 家長這一次走的是哪個入口。null = 還在起點頁。 */
  const [path, setPath] = useState<TaskCreationPath | null>(null);
  /** 起點頁上選中的卡片（還沒按下一步）。 */
  const [entrySelection, setEntrySelection] = useState<TaskCreationPath | null>(null);

  // ── preset 入口的狀態 ────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BrowseFilter>('recommended');
  const [selectedFamily, setSelectedFamily] = useState<TaskPresetFamily | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  // ── 自訂入口的狀態 ──────────────────────────────────────────────────
  const [intake, setIntake] = useState<CustomIntakeState>(EMPTY_CUSTOM_INTAKE);
  const [showBasicsErrors, setShowBasicsErrors] = useState(false);
  /**
   * 目前這份自訂草稿是照哪一份基本設定建的。
   *
   * 用途只有一個：家長從 editor 返回 Step 3、什麼都沒改又按下一步時**不重建草稿**。
   * 重建會清掉他在 editor 填的所有東西，而且換掉 clientRequestId。
   */
  const [customDraftSignature, setCustomDraftSignature] = useState<string | null>(null);

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

  // ── AI 建議 ─────────────────────────────────────────────────────────
  const [aiState, setAiState] = useState<TaskAiReviewState>({ kind: 'idle' });
  /** 上一次套用被擋下來的原因。套用成功或重新請求就清掉。 */
  const [aiApplyError, setAiApplyError] = useState<string | undefined>(undefined);
  /** 有建議被採用而且動到了幣值的輸入 —— 只是用來顯示一句說明。 */
  const [aiRewardRecalculated, setAiRewardRecalculated] = useState(false);
  /**
   * 目前這一次 AI 請求。
   *
   * token 與 AbortController 兩道都要：
   *   AbortController 讓請求真的停下來（不再耗配額、不再等）
   *   token           讓「已經送出但來不及取消」的回應對不上號而被丟掉
   * 只靠元件卸載是不夠的 —— 抽屜不會因為離開預覽就卸載。
   */
  const aiRequestTokenRef = useRef(0);
  const aiAbortRef = useRef<AbortController | null>(null);

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
   * 停掉進行中的 AI 請求。
   *
   * **不顯示任何東西。** 家長是自己離開的 —— 為此跳一則「取得建議失敗」
   * 等於因為他做了正常的事而責備他。
   */
  const abortAiRequest = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    // token 前進一格：已經送出、來不及取消的那一次回來時會對不上號。
    aiRequestTokenRef.current += 1;
    setAiState(current => (current.kind === 'loading' ? { kind: 'idle' } : current));
  }, []);

  /**
   * 抽屜完全關閉後的歸零。
   *
   * clientRequestId 一定要在這裡清掉：留著的話，下一次開抽屜建立的
   * 另一個任務會沿用同一個識別碼，RPC 會認為那是重送並回傳上一筆 ——
   * 家長按了建立，卻拿到上次那個任務。
   */
  const reset = useCallback(() => {
    setRoute(ENTRY_ROUTE);
    setPath(null);
    setEntrySelection(null);
    setQuery('');
    setFilter('recommended');
    setSelectedFamily(null);
    setSelectedVariantId(null);
    setIntake(EMPTY_CUSTOM_INTAKE);
    setShowBasicsErrors(false);
    setCustomDraftSignature(null);
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
    abortAiRequest();
    setAiState({ kind: 'idle' });
    setAiApplyError(undefined);
    setAiRewardRecalculated(false);
  }, [abortAiRequest]);

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
      reset(); // 關閉後重置路由、入口、選擇與草稿
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

  /**
   * 目前這份草稿的 preset 來源。
   *
   * **自訂入口一律是 null。** 這一組是「要不要把 family / variant 傳下去」
   * 的唯一判準 —— 用 selectedFamily 有沒有值去判斷的話，家長先看過 preset
   * 再切到自訂時，那份殘留的選擇會被當成這份自訂任務的來源。
   */
  const activeFamily = path === 'preset' ? selectedFamily : null;
  const activeVariant = path === 'preset' ? selectedVariant : null;

  const errors = useMemo(() => {
    if (!draft) return {};
    const local = validateTaskDraft(draft, activeVariant ?? undefined, ageGroup ?? undefined);
    // 本地驗證在前、RPC 回來的在後：後者是我們沒能在前端擋下的，更晚也更權威。
    return serverFieldErrors ? { ...local, ...serverFieldErrors } : local;
  }, [draft, activeVariant, ageGroup, serverFieldErrors]);

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
    if (!draft || !commandChild || !clientRequestId) return null;
    return previewTaskRewardDecision({
      draft,
      ...(activeFamily ? { family: activeFamily } : null),
      ...(activeVariant ? { variant: activeVariant } : null),
      child: commandChild,
      taskPolicyVersion: TASK_POLICY_VERSION,
      clientRequestId,
    });
  }, [draft, activeFamily, activeVariant, commandChild, clientRequestId]);

  // ── AI 建議：輸入、資格與指紋 ────────────────────────────────────────

  /**
   * 送給 AI 的輸入。
   *
   * 走既有的白名單 builder，**不是**在這裡另外組一份 —— 那一支的整個
   * 用途就是把孩子的暱稱、child id、family id、錢包、任務歷史全部拿掉。
   * 這裡繞過它的話，最小化就只剩註解。
   */
  const aiInput = useMemo(() => {
    if (!draft || !ageGroup || !child) return null;
    return buildTaskAiInput({
      draft,
      ...(activeVariant ? { variant: activeVariant } : null),
      ageGroup,
      // 傳暱稱是為了**把它從標題與期待裡拿掉**，不是為了送出去。
      childNickname: child.nickname,
    });
  }, [activeVariant, ageGroup, child, draft]);

  const aiSignature = useMemo(
    () => (aiInput ? createTaskAiInputSignature(aiInput) : null),
    [aiInput],
  );

  /**
   * 這則任務現在能不能取得建議。
   *
   * 順序有意義：先問「有沒有 client」（環境層），再問「這種任務開不開放」
   * （B2A.5 的第一版範圍）。A／B 類任務即使服務完全正常也不該出現按鈕。
   */
  const aiAvailability = draft
    ? resolveTaskAiAvailability({
        purposeCategory: draft.purposeCategory,
        serviceHealthy: true,
      })
    : null;
  const aiEligible =
    taskAiClient !== null && aiAvailability?.state === 'available' && aiInput !== null;

  /** 拿到建議之後，家長又動過草稿嗎。 */
  const aiDraftChanged =
    (aiState.kind === 'suggestions' || aiState.kind === 'no_change')
    && aiSignature !== null
    && aiSignature !== aiState.inputSignature;

  const ruleFindings = useMemo(
    () => (draft ? collectTaskRuleFindings(draft) : []),
    [draft],
  );

  /**
   * 草稿一變就重算每一項還套不套得上去。
   *
   * 算而不是記：會改到草稿的地方有七、八處（editor 欄位、採用建議、復原、
   * 換版本……），每一處都要記得更新一個旗標的話，漏掉的那一處
   * 就是「套用了一個對不上的建議」。
   */
  useEffect(() => {
    if (!draft) return;
    setAiState(current =>
      current.kind === 'suggestions'
        ? { ...current, items: refreshItemStates(current.items, draft) }
        : current,
    );
  }, [draft]);

  /** 換孩子一定要停掉請求 —— 那批建議是對著上一個孩子的年齡段寫的。 */
  const childId = child?.id ?? null;
  useEffect(() => {
    abortAiRequest();
    setAiState({ kind: 'idle' });
  }, [abortAiRequest, childId]);

  // 元件卸載時收尾。這是最後一道，不是唯一一道（見 abortAiRequest 的說明）。
  useEffect(() => () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
  }, []);

  const handleAiRequest = useCallback(async () => {
    const requestedDraft = draft;
    if (!taskAiClient || !aiInput || !aiSignature || !aiEligible || !requestedDraft) return;
    // 同一時間只允許一個請求。重複按不會產生第二次付費呼叫。
    if (aiState.kind === 'loading') return;

    abortAiRequest();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const token = aiRequestTokenRef.current;

    setAiApplyError(undefined);
    setAiState({ kind: 'loading', requestToken: token, inputSignature: aiSignature });

    const outcome = await taskAiClient.recommend(aiInput, controller.signal);

    // 對不上號＝這中間家長已經離開或重新請求過。**這一份直接丟掉。**
    // 少了這一道，三秒前那份對著舊草稿寫的建議會蓋在新草稿上，
    // 而畫面上完全看不出異狀。
    if (token !== aiRequestTokenRef.current) return;
    aiAbortRef.current = null;

    switch (outcome.kind) {
      case 'aborted':
        setAiState({ kind: 'idle' });
        return;
      case 'auth_required':
        setAiState({ kind: 'auth_required' });
        return;
      case 'rate_limited':
        setAiState(
          outcome.retryAfterSeconds === undefined
            ? { kind: 'rate_limited' }
            : { kind: 'rate_limited', retryAfterSeconds: outcome.retryAfterSeconds },
        );
        return;
      case 'request_invalid':
        // 家長改不了任何東西，所以文案與一般不可用相同；
        // 代號留給 development，那是我們要修的 bug。
        setAiState({ kind: 'unavailable', reason: 'temporary', developerCode: 'REQUEST_INVALID' });
        return;
      case 'server_unavailable':
        setAiState({ kind: 'unavailable', reason: 'temporary', developerCode: 'SERVICE_ERROR' });
        return;
      case 'result': {
        const result = outcome.result;
        if (result.status === 'unavailable') {
          const { reason, developerCode } = userFacingUnavailable(result.reason);
          setAiState({ kind: 'unavailable', reason, developerCode });
          return;
        }
        if (result.status === 'no_change') {
          setAiState({
            kind: 'no_change',
            inputSignature: aiSignature,
            summary: result.summary,
          });
          return;
        }
        setAiState({
          kind: 'suggestions',
          inputSignature: aiSignature,
          summary: result.summary,
          // 拿到就先算一次狀態：草稿在等待期間可能已經被改過。
          items: initialItems(result.suggestions, requestedDraft),
        });
      }
    }
  }, [abortAiRequest, aiEligible, aiInput, aiSignature, aiState.kind, draft, taskAiClient]);

  /**
   * 採用一項建議。
   *
   * 按下去之後**再驗一次**，不信任畫面上的狀態：
   *   1. 這則建議仍然通過 client validator（欄位、型別、長度、禁止路徑）
   *   2. 這一項現在仍是可套用的（currentValue 對得上）
   *   3. 套用之後草稿仍然合法
   *
   * 第 3 點是最容易被忽略的：一則「把期間改成 200 天」的建議本身完全合法，
   * 套下去卻會讓草稿超出上限，然後家長在預覽上看到一個他沒辦法建立的東西。
   */
  const handleAiApply = useCallback(
    (item: TaskAiSuggestionItem) => {
      if (!draft || aiState.kind !== 'suggestions') return;
      if (!canApplyItem(item)) return;

      // 重新走一次驗證。summary 沿用已驗過的那一份，只為了組出合法的形狀。
      const revalidated = validateTaskAiRecommendationResult({
        status: 'suggestions',
        schemaVersion: 1,
        summary: aiState.summary,
        suggestions: [item.suggestion],
      });
      if (revalidated.status !== 'suggestions') {
        setAiApplyError(TASK_AI_COPY.applyIncompatible);
        return;
      }

      const outcome = applyTaskAiSuggestion({ draft, suggestion: revalidated.suggestions[0] });
      if (!outcome.applied) {
        setAiApplyError(TASK_AI_COPY.applyIncompatible);
        return;
      }

      // 不可變欄位的最後一道。apply 的 exhaustive switch 本來就碰不到它們，
      // 但這一行的成本是零，而它擋的是「有人之後加了一個新分支」。
      const immutableIntact =
        outcome.draft.purposeCategory === draft.purposeCategory
        && outcome.draft.rewardPolicy === draft.rewardPolicy
        && outcome.draft.durationType === draft.durationType
        && outcome.draft.source === draft.source
        && outcome.draft.editorKind === draft.editorKind;

      const stillValid =
        immutableIntact
        && !hasErrors(validateTaskDraft(outcome.draft, activeVariant ?? undefined, ageGroup ?? undefined));

      if (!stillValid) {
        // **不套用，保留原草稿。** 半套的結果比沒套糟糕得多。
        setAiApplyError(TASK_AI_COPY.applyIncompatible);
        return;
      }

      setAiApplyError(undefined);
      setDraft(outcome.draft);
      setAiState(current =>
        current.kind === 'suggestions'
          ? {
              ...current,
              items: markItemApplied(current.items, item.suggestion.id, outcome.record),
            }
          : current,
      );
      if (outcome.affectsRewardDecision) setAiRewardRecalculated(true);
    },
    [activeVariant, ageGroup, aiState, draft],
  );

  const handleAiKeep = useCallback((item: TaskAiSuggestionItem) => {
    setAiState(current =>
      current.kind === 'suggestions'
        ? { ...current, items: markItemKept(current.items, item.suggestion.id) }
        : current,
    );
  }, []);

  /**
   * 復原一項。
   *
   * 只還原**那一個欄位**，不是整份草稿的快照 —— 家長採用三項之後想收回
   * 中間那一項時，另外兩項不該跟著消失，他自己在 editor 改過的東西也是。
   *
   * `canUndoItem` 在家長於採用後又動過同一欄位時回 false：那時候復原會
   * 蓋掉他剛打的字。寧可少一個按鈕。
   */
  const handleAiUndo = useCallback(
    (item: TaskAiSuggestionItem) => {
      if (!draft || !canUndoItem(item) || !item.record) return;
      const next = undoTaskAiSuggestion({ draft, record: item.record });
      setDraft(next);
      setAiApplyError(undefined);
      setAiState(current =>
        current.kind === 'suggestions'
          ? { ...current, items: markItemUndone(current.items, item.suggestion.id) }
          : current,
      );
    },
    [draft],
  );

  // dirty 由 initial snapshot 與 current 深度比較得出，不用手動旗標
  // （手動旗標改回原值也不會歸零，會誤觸放棄確認）。
  //
  // 自訂入口多算一件事：三個基本設定步驟填過的內容也是家長輸入的東西，
  // 那時候還沒有草稿，但關掉一樣會全部消失。
  const dirty =
    isDraftDirty(initialDraft, draft)
    || (path === 'parent_custom' && isCustomIntakeDirty(intake));

  /** 建立 preset 草稿並回傳它 —— 呼叫端常常需要它的 editorKind 來決定路由。 */
  const buildDraft = useCallback(
    (family: TaskPresetFamily, variant: TaskPresetVariant): TaskDraft | null => {
      if (!child) return null;
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
      setCustomDraftSignature(null);
      return next;
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
      const next = buildDraft(selectedFamily, variant);
      // 換版本可能換掉 editor（同一家族的「固定練習」與「成長計畫」不同支），
      // 路由要跟著更新，否則 review 的返回會指向上一支 editor。
      if (next) {
        setRoute(current =>
          current.kind === 'editor' ? { kind: 'editor', editorKind: next.editorKind } : current,
        );
      }
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
    if (!draft || !commandChild || !clientRequestId) return;
    // 同步鎖，擋住同一個 tick 內的第二次點擊。
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmission({ status: 'submitting' });
    setServerFieldErrors(null);

    try {
      const outcome = await submitTaskDraft({
        draft,
        // 自訂任務兩者都不傳。傳了會被 mapTaskDraftToCommand 直接擋下 ——
        // 那是刻意的，來源記錯的任務在資料庫裡看起來完全正常。
        ...(activeFamily ? { family: activeFamily } : null),
        ...(activeVariant ? { variant: activeVariant } : null),
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
        setRoute({ kind: 'success' });
        await runRefresh();
        return;
      }

      setSubmission({ status: 'failed', code: outcome.code, message: outcome.message });

      // 欄位問題才回編輯畫面。政策與寫入問題留在預覽 ——
      // 把家長丟回表單卻沒有任何欄位是紅的，只會讓人以為自己填錯了什麼。
      if (outcome.code === 'VALIDATION_FAILED') {
        if (outcome.fieldErrors) setServerFieldErrors(outcome.fieldErrors);
        setShowErrors(true);
        setRoute({ kind: 'editor', editorKind: draft.editorKind });
      }
    } finally {
      submitLockRef.current = false;
    }
  }, [
    activeFamily, activeVariant, clientRequestId, commandChild, draft,
    runRefresh, taskCreationService,
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
    // 這裡就 abort，不等 reset —— reset 要等關閉動畫播完（260ms），
    // 那段時間裡請求還活著，而家長已經走了。
    abortAiRequest();
    // 成功畫面的 X 等同「完成」：任務已經建立，這時不該再問「要放棄嗎」。
    if (created) {
      handleFinishSuccess();
      return;
    }
    requestAction({ kind: 'close' });
  }, [abortAiRequest, created, handleFinishSuccess, requestAction]);

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

  /** 選家族：同一個家族不需確認（草稿保留），換家族且 dirty 才問。 */
  const handleSelectFamily = useCallback(
    (family: TaskPresetFamily) => {
      if (selectedFamily?.id === family.id) return;
      requestAction({ kind: 'selectFamily', family });
    },
    [requestAction, selectedFamily],
  );

  /** 換執行版本：dirty 時要確認，因為換版本等於重建草稿。 */
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

  // ── 起點頁 ──────────────────────────────────────────────────────────────

  /**
   * 進入某一個入口。
   *
   * 換入口時哪些東西留著由 pathSwitchEffect 決定，不是在這裡臨機判斷：
   * 兩份草稿共用同一個 clientRequestId 是最糟的組合（重送會回放另一份），
   * 而選擇與輸入則相反，兩邊都留著。
   */
  const enterPath = useCallback(
    (next: TaskCreationPath) => {
      const effect = pathSwitchEffect(path, next);
      // 換入口一定丟掉草稿，那批建議因此不再對應任何東西。
      abortAiRequest();
      setAiState({ kind: 'idle' });
      setAiApplyError(undefined);
      setAiRewardRecalculated(false);
      if (effect.resetDraft) {
        setDraft(null);
        setInitialDraft(null);
        setMinuteCustomText('');
        setShowErrors(false);
        setClientRequestId(null);
        setSubmission({ status: 'idle' });
        setServerFieldErrors(null);
        setCustomDraftSignature(null);
      }
      setPath(next);
      setRoute(next === 'preset' ? { kind: 'preset_catalog' } : { kind: 'custom_basics_title' });
    },
    [abortAiRequest, path],
  );

  // ── 自訂基本設定 ────────────────────────────────────────────────────────

  const titleError = customTitleError(intake);

  /**
   * 目前這組「目的 × 期間」的路由結果。
   * 兩者都選好才算得出來，所以 null 代表家長還沒填完，不是「沒有對應」。
   */
  const customResolution = useMemo(() => {
    if (!intake.purposeChoice || !intake.durationChoice) return null;
    return resolveCustomTaskEditor({
      purposeCategory: purposeCategoryOf(intake.purposeChoice),
      durationChoice: intake.durationChoice,
    });
  }, [intake.purposeChoice, intake.durationChoice]);

  const needsRoutingConfirmation =
    customResolution?.status === 'needs_confirmation' && intake.confirmedEditorKind === null;

  const handleSelectPurpose = useCallback((choice: CustomTaskPurposeChoice) => {
    // 換了目的，先前對確認的回答就不再對應任何東西 —— 一併清掉。
    setIntake(current => ({ ...current, purposeChoice: choice, confirmedEditorKind: null }));
  }, []);

  const handleSelectDuration = useCallback((choice: CustomTaskDurationChoice) => {
    setIntake(current => ({ ...current, durationChoice: choice, confirmedEditorKind: null }));
  }, []);

  /** 採納建議：期間換成建議值，路由自然收斂，不需要再記一個覆寫。 */
  const handleAcceptRoutingSuggestion = useCallback(() => {
    setIntake(current => {
      if (!current.purposeChoice || !current.durationChoice) return current;
      const confirmed = confirmCustomTaskEditor(
        {
          purposeCategory: purposeCategoryOf(current.purposeChoice),
          durationChoice: current.durationChoice,
        },
        'accept_suggestion',
      );
      return {
        ...current,
        durationChoice: confirmed.durationChoice,
        confirmedEditorKind: null,
      };
    });
  }, []);

  /** 維持原本的期間：把家長決定的 editor 記下來，不在 handler 裡硬寫 editorKind。 */
  const handleKeepRoutingChoice = useCallback(() => {
    setIntake(current => {
      if (!current.purposeChoice || !current.durationChoice) return current;
      const confirmed = confirmCustomTaskEditor(
        {
          purposeCategory: purposeCategoryOf(current.purposeChoice),
          durationChoice: current.durationChoice,
        },
        'keep_choice',
      );
      return { ...current, confirmedEditorKind: confirmed.editorKind };
    });
  }, []);

  /** Step 3 →五種既有 editor。路由只有一個來源：resolveCustomTaskEditor。 */
  const enterCustomEditor = useCallback(() => {
    if (!child || !intake.purposeChoice || !intake.durationChoice) return;

    const signature = customBasicsSignature(intake);
    // 基本設定一個字都沒改 → 沿用同一份草稿與同一個 clientRequestId。
    if (draft && customDraftSignature === signature) {
      setRoute({ kind: 'editor', editorKind: draft.editorKind });
      return;
    }

    const result = createCustomTaskDraft({
      intake: {
        title: intake.title,
        originalExpectation: intake.originalExpectation,
        purposeChoice: intake.purposeChoice,
        durationChoice: intake.durationChoice,
      },
      child,
      ...(ageGroup ? { ageGroup } : null),
      ...(intake.confirmedEditorKind
        ? { confirmedEditorKind: intake.confirmedEditorKind }
        : null),
    });

    // needs_confirmation 在畫面上已經先處理掉了（下一步會是 disabled），
    // unsupported 目前沒有任何組合會發生 —— 兩者都不該再往前走。
    if (result.status !== 'created') return;

    setDraft(result.draft);
    setInitialDraft(result.draft);
    setShowErrors(false);
    setMinuteCustomText(minuteSeedOf(result.draft));
    setClientRequestId(newClientRequestId());
    setSubmission({ status: 'idle' });
    setServerFieldErrors(null);
    setCustomDraftSignature(signature);
    setRoute({ kind: 'editor', editorKind: result.draft.editorKind });
  }, [ageGroup, child, customDraftSignature, draft, intake]);

  // ── 導覽 ────────────────────────────────────────────────────────────────

  /**
   * 上一步。
   *
   * **一律保留內容。** 返回不是放棄 —— 家長按上一步是為了改一個欄位，
   * 不是為了把剛剛填的十分鐘丟掉。所以這裡不清草稿、不換 clientRequestId、
   * 也不重新呼叫任何服務。
   */
  const handleBack = useCallback(() => {
    if (submitLockRef.current) return;
    // 離開預覽就停掉請求。已經拿到的建議留著 —— 家長改完回來還用得上。
    abortAiRequest();
    if (route.kind === 'review') {
      setSubmission({ status: 'idle' });
      setRoute({ kind: 'editor', editorKind: draft?.editorKind ?? 'one_time' });
      return;
    }
    const back = backRouteFor(route, path);
    if (!back) return;
    if (back.kind === 'entry') setEntrySelection(path);
    setRoute(back);
  }, [abortAiRequest, draft, path, route]);

  /** preset：選好家族與版本後進 editor。家族/版本沒換就沿用既有草稿。 */
  const handlePresetNext = useCallback(() => {
    if (!selectedFamily || !selectedVariant || !child) return;
    const stale =
      !draft
      || draft.familyId !== selectedFamily.id
      || draft.variantId !== selectedVariant.id;
    if (stale) {
      const next = buildDraft(selectedFamily, selectedVariant);
      if (next) setRoute({ kind: 'editor', editorKind: next.editorKind });
      return;
    }
    setRoute({ kind: 'editor', editorKind: draft.editorKind });
  }, [buildDraft, child, draft, selectedFamily, selectedVariant]);

  const handlePreview = useCallback(() => {
    if (!draft) return;
    const result = validateTaskDraft(draft, activeVariant ?? undefined, ageGroup ?? undefined);
    if (hasErrors(result)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setSubmission({ status: 'idle' });
    setServerFieldErrors(null);
    setRoute({ kind: 'review' });
  }, [activeVariant, ageGroup, draft]);

  /** 主要動作（footer 右側）。每個畫面各一個，集中在這裡不散在 JSX 裡。 */
  const handlePrimary = useCallback(() => {
    switch (route.kind) {
      case 'entry':
        if (entrySelection) enterPath(entrySelection);
        return;
      case 'preset_catalog':
        handlePresetNext();
        return;
      case 'custom_basics_title':
        if (titleError) {
          setShowBasicsErrors(true);
          return;
        }
        setShowBasicsErrors(false);
        setRoute({ kind: 'custom_basics_purpose' });
        return;
      case 'custom_basics_purpose':
        if (!intake.purposeChoice) return;
        setRoute({ kind: 'custom_basics_duration' });
        return;
      case 'custom_basics_duration':
        enterCustomEditor();
        return;
      case 'editor':
        handlePreview();
        return;
      default:
        return;
    }
  }, [
    enterCustomEditor, enterPath, entrySelection, handlePresetNext, handlePreview,
    intake.purposeChoice, route.kind, titleError,
  ]);

  if (!mounted) return null;

  const ready = !childLoading && child !== null;
  // 草稿存在且沒有驗證錯誤才進得了預覽。按鈕不因此變 disabled（見 footer）。
  const previewBlocked = !draft || hasErrors(errors);
  /** 家長已經按過一次、而且確實還有錯 —— 這時才在 footer 說明為什麼沒往下走。 */
  const blockedByErrors = showErrors && previewBlocked;
  const isCustom = path === 'parent_custom';

  /**
   * blocked 的回饋決策不可以建立。
   *
   * 正常流程走不到（能力閘門讓家長選不到用不了的政策），這道是為了
   * 「預覽開著時草稿被改到能力失效」——那時按鈕必須立刻擋住，不是等 RPC 拒絕。
   */
  const rewardBlocked = previewDecision?.eligibility === 'blocked';
  const canConfirmCreate =
    !!draft && !!previewDecision && !rewardBlocked && !!clientRequestId && !submitting;

  const headerTitle = (() => {
    if (route.kind === 'entry') return ENTRY_COPY.title;
    if (route.kind === 'preset_catalog') {
      return ready ? `為 ${child.nickname} 建立新任務` : '建立新任務';
    }
    if (route.kind === 'success') return '任務已建立';
    if (route.kind === 'review') return '預覽最終版本';
    if (isCustom) return CUSTOM_HEADER_TITLE;
    if (draft?.editorKind === 'short_support' && selectedFamily) {
      return shortSupportCopy(selectedFamily.id).headerTitle;
    }
    if (draft?.editorKind === 'growth_plan') return '調整成長計畫';
    if (draft?.editorKind === 'recurring') return '調整固定任務';
    if (draft?.editorKind === 'family_role') return '調整家庭角色';
    if (draft?.editorKind === 'one_time') return '調整單次任務';
    return '調整任務內容';
  })();

  /** 第二行：preset catalog 顯示年齡；自訂三步顯示副標；其餘不顯示。 */
  const headerSub = (() => {
    if (route.kind === 'preset_catalog') {
      return ready
        ? `${age !== null ? `${age} 歲｜` : ''}${
            ageGroup ? `${AGE_GROUP_LABEL[ageGroup]} 建議` : '依年齡建議'
          }`
        : '正在載入孩子資料…';
    }
    if (route.kind === 'custom_basics_title') return STEP1_COPY.subtitle;
    if (route.kind === 'custom_basics_purpose') return STEP2_COPY.subtitle;
    if (route.kind === 'custom_basics_duration') return STEP3_COPY.subtitle;
    return null;
  })();

  /**
   * 第三行：進度或說明。
   *
   * 自訂的三個基本設定步驟用「基本設定 n／3」，進 editor 之後改成
   * 「詳細設定」—— 刻意**不接續成「步驟 4／7」**：五種 editor 的欄位數量
   * 不一樣，一個假的總步數只會讓家長以為自己還有六頁要填。
   */
  const headerHint = (() => {
    if (route.kind === 'entry') return ENTRY_COPY.subtitle;
    if (route.kind === 'preset_catalog') return '先選一個適合的起點，內容仍可再調整';
    if (route.kind === 'custom_basics_title') return STEP1_COPY.progress;
    if (route.kind === 'custom_basics_purpose') return STEP2_COPY.progress;
    if (route.kind === 'custom_basics_duration') return STEP3_COPY.progress;
    if (route.kind === 'success') {
      return isCustom && child
        ? customSuccessSubtitle(child.nickname)
        : `已加入 ${child?.nickname ?? '孩子'}的任務清單`;
    }
    if (route.kind === 'review') {
      return submitting ? SUBMITTING_BLOCK_NOTE : '確認以下內容，還可以回去修改';
    }
    if (isCustom) return CUSTOM_EDITOR_STAGE_LABEL;
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

  /** 主要按鈕現在能不能按。 */
  const primaryDisabled = (() => {
    switch (route.kind) {
      case 'entry':
        return entrySelection === null;
      case 'preset_catalog':
        return !selectedFamily;
      case 'custom_basics_purpose':
        return intake.purposeChoice === null;
      case 'custom_basics_duration':
        // 還沒選期間，或路由有意見而家長還沒回答 —— 兩種都不該往前走。
        return intake.durationChoice === null || needsRoutingConfirmation;
      default:
        return false;
    }
  })();

  const primaryHint = (() => {
    if (route.kind === 'entry' && primaryDisabled) return '請先選一個開始方式';
    if (route.kind === 'preset_catalog' && primaryDisabled) return '請先選一個任務起點';
    if (route.kind === 'custom_basics_purpose' && primaryDisabled) {
      return STEP2_COPY.unselectedHint;
    }
    if (route.kind === 'custom_basics_duration' && primaryDisabled) {
      return STEP3_COPY.unselectedHint;
    }
    return undefined;
  })();

  const backLabel = route.kind === 'editor' && !isCustom ? '返回選擇' : '上一步';
  const showsBack = backRouteFor(route, path) !== null;

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
                <Text style={s.headerTitle}>{headerTitle}</Text>
                {headerSub ? <Text style={s.headerSub}>{headerSub}</Text> : null}
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
            <Text style={s.headerHint}>{headerHint}</Text>
          </View>

          {/* ── 內容（獨立滾動；header 與 footer 不跟著走） ───────────── */}
          {route.kind === 'entry' ? (
            <CustomTaskStart selected={entrySelection} onSelect={setEntrySelection} />
          ) : route.kind === 'preset_catalog' ? (
            <PresetCatalogStep
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
          ) : route.kind === 'custom_basics_title' ? (
            <CustomTaskBasicsTitle
              title={intake.title}
              expectation={intake.originalExpectation}
              {...(titleError ? { titleError } : null)}
              showErrors={showBasicsErrors}
              onChangeTitle={value => setIntake(current => ({ ...current, title: value }))}
              onChangeExpectation={value =>
                setIntake(current => ({ ...current, originalExpectation: value }))
              }
            />
          ) : route.kind === 'custom_basics_purpose' ? (
            <CustomTaskBasicsPurpose
              title={intake.title}
              expectation={intake.originalExpectation}
              selected={intake.purposeChoice}
              onSelect={handleSelectPurpose}
            />
          ) : route.kind === 'custom_basics_duration' && intake.purposeChoice ? (
            <CustomTaskBasicsDuration
              title={intake.title}
              purposeChoice={intake.purposeChoice}
              durationChoice={intake.durationChoice}
              confirmationAnswered={intake.confirmedEditorKind !== null}
              onSelectDuration={handleSelectDuration}
              onAcceptSuggestion={handleAcceptRoutingSuggestion}
              onKeepChoice={handleKeepRoutingChoice}
            />
          ) : (
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {route.kind === 'editor' && draft && child ? (
                <>
                  {/*
                    自訂任務用摘要卡取代版本切換列：它沒有版本可以切，
                    但家長仍然需要看到「我剛才選的是什麼」。
                  */}
                  {isCustom ? (
                    <CustomTaskSummaryCard
                      title={draft.title}
                      expectation={draft.originalExpectation}
                      purposeCategory={draft.purposeCategory}
                      purposeLabel={PURPOSE_DISPLAY_LABEL[draft.purposeCategory]}
                      {...(durationLabelOf(intake.durationChoice)
                        ? { arrangementLabel: durationLabelOf(intake.durationChoice) }
                        : null)}
                    />
                  ) : null}

                  {activeFamily && activeVariant && activeFamily.variants.length > 1 ? (
                    <View style={s.variantSwitch}>
                      <Text style={s.variantSwitchLabel}>執行方式</Text>
                      <View style={s.variantSwitchRow}>
                        {activeFamily.variants.map(item => {
                          const active = item.id === activeVariant.id;
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
                    {...(activeFamily ? { family: activeFamily } : null)}
                    {...(activeVariant ? { variant: activeVariant } : null)}
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

              {route.kind === 'review' && draft ? (
                <DraftReview
                  {...(activeFamily ? { family: activeFamily } : null)}
                  {...(activeVariant ? { variant: activeVariant } : null)}
                  draft={draft}
                  decision={previewDecision}
                  ruleFindings={ruleFindings}
                  {...(taskAiClient
                    ? {
                        ai: {
                          state: aiState,
                          eligible: aiEligible,
                          draftChanged: aiDraftChanged,
                          ...(aiApplyError !== undefined ? { applyError: aiApplyError } : null),
                          rewardRecalculated: aiRewardRecalculated,
                          ...(taskAiDeveloperNote !== undefined
                            ? { developerNote: taskAiDeveloperNote }
                            : null),
                          onRequest: () => void handleAiRequest(),
                          onApply: handleAiApply,
                          onKeep: handleAiKeep,
                          onUndo: handleAiUndo,
                        },
                      }
                    : null)}
                />
              ) : null}

              {route.kind === 'success' && created ? (
                <CreatedTaskSummary
                  {...(activeFamily ? { family: activeFamily } : null)}
                  {...(activeVariant ? { variant: activeVariant } : null)}
                  command={created.command}
                />
              ) : null}
            </ScrollView>
          )}

          {/* ── Footer（固定） ─────────────────────────────────────────── */}
          <View style={s.footer}>
            {route.kind === 'success' ? (
              <SuccessFooter
                refreshStatus={refreshStatus}
                onRetryRefresh={() => void runRefresh()}
                onViewTask={handleViewCreatedTask}
                onFinish={handleFinishSuccess}
              />
            ) : route.kind === 'review' ? (
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
                    onPress={handleBack}
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
            ) : (
              /*
                其餘五個畫面共用同一組 footer：左邊上一步（起點頁是取消）、
                右邊主要動作。編輯畫面的預覽鈕刻意保持可按 ——
                永遠 disabled 的按鈕不會告訴家長少了什麼，只會讓人反覆點一顆
                沒有反應的東西；按下去才把錯誤標出來（閘門在 handlePreview）。
              */
              <View style={s.editFooter}>
                {route.kind === 'editor' && blockedByErrors ? (
                  <Text style={s.editFooterNote}>{PREVIEW_BLOCKED_NOTE}</Text>
                ) : null}
                {route.kind !== 'editor' && primaryHint ? (
                  <Text style={s.editFooterHint}>{primaryHint}</Text>
                ) : null}
                <View style={s.editFooterRow}>
                  {showsBack ? (
                    <TouchableOpacity
                      style={s.ghostButton}
                      onPress={handleBack}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <ChevronLeftIcon />
                      <Text style={s.ghostButtonText}>{backLabel}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={s.ghostButton}
                      onPress={handleClose}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Text style={s.ghostButtonText}>取消</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[s.primaryButton, primaryDisabled && s.primaryButtonDisabled]}
                    onPress={handlePrimary}
                    disabled={primaryDisabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: primaryDisabled }}
                    accessibilityLabel={route.kind === 'editor' ? '檢查並預覽' : '下一步'}
                    accessibilityHint={
                      route.kind === 'editor'
                        ? (previewBlocked ? '還有必填欄位沒完成，按下會標出位置' : undefined)
                        : primaryHint
                    }
                  >
                    {/*
                      編輯畫面的文案固定，不隨 errors 在兩句之間跳動 ——
                      按鈕寬度與語意每次驗證後都變一次，比看不懂更難用。
                      「檢查並預覽」同時說明了兩種結果：有錯就標出來，沒錯就往下走。
                    */}
                    <Text
                      style={[
                        s.primaryButtonText,
                        primaryDisabled && s.primaryButtonTextDisabled,
                      ]}
                    >
                      {route.kind === 'editor' ? '檢查並預覽' : '下一步'}
                    </Text>
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
// preset 入口 — 選擇任務起點（家族）
// ---------------------------------------------------------------------------

function PresetCatalogStep({
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

  // 編輯畫面的版本切換
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
  /** 共用 footer：說明一行 + 按鈕列。沒有說明時和原本的單列一樣高。 */
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
  /** 「還沒選」不是錯誤，用一般說明色，不用紅字。 */
  editFooterHint: {
    fontFamily: ParentFonts.body,
    fontSize: ParentFontSizes.xs,
    lineHeight: 19,
    color: ParentColors.fgMuted,
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
