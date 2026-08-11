// Shadow Wallet — Proposal → AI 輸入，以及這一次請求的指紋（P0-3）
//
// ─────────────────────────────────────────────────────────────────────────
// 兩件事在同一個檔案，因為它們是同一件事的兩面：
//
//   buildPlanDraftInput   模型看得到什麼
//   planDraftRequestKey   同樣的東西看第二次，就不該再問一次
//
// 指紋只由「會改變草稿內容」的欄位算出來，不含時間、隨機值或 proposal 的
// 狀態。所以：
//
//   · 網路重試、退出重進、app refresh → 同一把 key → 查得到已存在的版本 → 不重跑
//   · 家長改了節奏、孩子改了目標      → 不同的 key → 可以重新整理一份
//
// 這是**不動 schema** 的 idempotency：P0-1 的 ai_request_id 欄位本來就在，
// 只是沒有 unique index。與其加一條 migration，不如讓 key 本身是決定性的，
// 再用一次 select 擋在呼叫模型之前 —— 省下來的不只是一列資料，是一次配額。
//
// ⚠️ 已知限制：兩個同時發出的請求都可能查不到、於是都寫入。實務上這條路徑
//    是孩子送出後的單一背景工作，不會併發；真的要根治需要 unique index，
//    那要動 schema，留給有需要的時候再做。
// ─────────────────────────────────────────────────────────────────────────

import type { ChildProposal } from '../types';
import {
  CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
  type ChildProposalPlanDraftInput,
  type PlanDraftAgeGroup,
  type PlanDraftCadence,
  type PlanDraftCadenceMode,
} from './types';

const PLAN_DRAFT_CADENCE_MODES: readonly PlanDraftCadenceMode[] = [
  'one_time',
  'fixed_days',
  'weekly_frequency',
];

/**
 * proposal 的節奏欄位 → 模型看得懂的形狀。
 *
 * 對不起來就回 null，而 null 的意思是「孩子沒有決定」——
 * 那正是 AI 唯一可以提節奏建議的情況。硬湊一個 mode 出來會讓
 * 「孩子還沒想好」變成「孩子說了某件事」。
 */
export function toPlanDraftCadence(proposal: {
  cadence_mode: ChildProposal['cadence_mode'];
  cadence_weekly_frequency: ChildProposal['cadence_weekly_frequency'];
  cadence_days: ChildProposal['cadence_days'];
}): PlanDraftCadence | null {
  const mode = proposal.cadence_mode;
  if (mode === null || !PLAN_DRAFT_CADENCE_MODES.includes(mode as PlanDraftCadenceMode)) {
    return null;
  }

  if (mode === 'weekly_frequency') {
    const times = proposal.cadence_weekly_frequency;
    if (typeof times !== 'number' || times < 1 || times > 7) return null;
    return { mode: 'weekly_frequency', weeklyFrequency: times };
  }

  if (mode === 'fixed_days') {
    const days = proposal.cadence_days;
    if (!Array.isArray(days) || days.length === 0) return null;
    return { mode: 'fixed_days', days: [...days].sort((a, b) => a - b) };
  }

  return { mode: 'one_time' };
}

/**
 * 真實的 Proposal 列 → AI 輸入。
 *
 * 來源刻意是**資料庫那一列**，不是畫面上的草稿：這一包的產品前提是
 * 「AI 基於真實 Proposal」，而畫面上的值在送出之後就不再是權威。
 */
export function buildPlanDraftInput(
  proposal: ChildProposal,
  ageGroup: PlanDraftAgeGroup,
): ChildProposalPlanDraftInput {
  return {
    schemaVersion: CHILD_PROPOSAL_PLAN_DRAFT_SCHEMA_VERSION,
    ageGroup,
    // 原話原樣送出。**這個方向是唯讀的** —— 回來的東西不會寫回這兩欄。
    childOriginalGoal: proposal.child_original_goal,
    childOriginalMotivation: proposal.child_original_motivation,
    proposalSource: proposal.proposal_source,
    cadence: toPlanDraftCadence(proposal),
    preferredTime: proposal.preferred_time,
    childRewardPreference: proposal.child_reward_preference,
  };
}

// ---------------------------------------------------------------------------
// 指紋
// ---------------------------------------------------------------------------

/**
 * 穩定序列化。鍵排序，陣列維持原順序（順序是內容的一部分）。
 * 與 taskAi 的 taskAiInputSignature 同一個做法。
 */
function stable(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * FNV-1a 64 bit（用兩個 32 bit 湊）。
 *
 * 不用 crypto：RN 沒有同步的 SHA，而這個雜湊只需要在**同一筆提案內**
 * 分辨得出兩份不同的輸入 —— 那個範圍裡碰撞的機率不值得為它加一個依賴。
 * 它不是安全用途，也不參與任何授權判斷。
 */
function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // FNV prime 16777619，用位移避免 32 bit 溢位在 JS 變成浮點。
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 這一版 key 的算法代號。改了算法就要改它，否則新舊 key 會撞在一起。 */
export const PLAN_DRAFT_REQUEST_KEY_PREFIX = 'cpd1';

/**
 * 這一次請求的 key。存進 plan version 的 ai_request_id。
 *
 * 含 proposalId 是為了讓 key 在整張表上就看得出屬於誰；含輸入指紋是為了讓
 * 「同樣的提案內容」永遠算出同一把 key。**不含**時間戳與隨機值 ——
 * 那會讓每一次重試都變成一份新的草稿。
 */
export function planDraftRequestKey(
  proposalId: string,
  input: ChildProposalPlanDraftInput,
): string {
  const payload = stable({
    schemaVersion: input.schemaVersion,
    ageGroup: input.ageGroup,
    childOriginalGoal: input.childOriginalGoal,
    childOriginalMotivation: input.childOriginalMotivation,
    proposalSource: input.proposalSource,
    cadence: input.cadence,
    preferredTime: input.preferredTime,
    childRewardPreference: input.childRewardPreference,
  });
  return `${PLAN_DRAFT_REQUEST_KEY_PREFIX}:${proposalId}:${fnv1a(payload, 0x811c9dc5)}${fnv1a(
    payload,
    0x01000193,
  )}`;
}
