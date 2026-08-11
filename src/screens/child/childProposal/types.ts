// Shadow Wallet — 孩子提案的畫面草稿（P0-2）
//
// ─────────────────────────────────────────────────────────────────────────
// 這一層存在的理由：**孩子看到的東西和資料庫欄位不是同一組概念。**
//
// P0-1 的 CreateChildProposalCommand 用的是 cadence_mode / weekly_frequency /
// child_reward_preference 這種工程語言。6–9 歲的孩子要回答的是
// 「你想怎麼開始？」「你希望這件事怎麼被看見？」。
//
// 把兩者接起來的映射寫在 proposalDraft.ts，而且是純函式 ——
// 畫面只管收集選擇，映射對不對由測試證明，不必渲染整個畫面。
//
// ⚠️ 這裡刻意**沒有** difficulty、category(B/C/D)、policy flag、
//    AI confidence、幣值數字。那些不是孩子該回答的問題，
//    有些（幣值）甚至不是這個工作包該決定的事。
// ─────────────────────────────────────────────────────────────────────────

/**
 * 「你想怎麼開始？」
 *
 * 四個選項對孩子是四句話，對契約是 cadence_mode 的四種形狀。
 * `not_sure` 不是「沒填」—— 它是一個有意義的答案（想跟爸媽一起討論），
 * 對應到契約就是不指定 cadence，讓 P0-3／家長版本去補。
 */
export type CadenceChoice =
  | { kind: 'weekly_times'; timesPerWeek: number }
  | { kind: 'certain_days'; days: number[] }
  | { kind: 'just_once' }
  | { kind: 'not_sure' };

export type CadenceKind = CadenceChoice['kind'];

/**
 * 「你希望這個挑戰怎麼被看見？」
 *
 * ⚠️ 這是**偏好**，不是回饋決策。孩子選了 `hopes_for_coin` 不代表會發幣 ——
 * 幣值由 coin policy 在家長確認、建立正式任務時決定（P0-5）。
 * 所以這裡沒有任何數字輸入：孩子不能自己填 1～999 幣。
 */
export type SeenAsChoice =
  | 'not_specified'
  | 'just_record'
  | 'see_progress'
  | 'hopes_for_coin';

export type ChildProposalDraft = {
  /** 孩子的原話。**送出時一個字都不改寫。** */
  goal: string;
  /** 選填 —— 逼孩子講理由只會逼出假答案。 */
  motivation: string;
  cadence: CadenceChoice;
  seenAs: SeenAsChoice;
};

/** 畫面的步驟。一次只問一件事。 */
export type ProposalStep = 'goal' | 'motivation' | 'cadence' | 'seenAs' | 'review';

export const PROPOSAL_STEPS: readonly ProposalStep[] = [
  'goal',
  'motivation',
  'cadence',
  'seenAs',
  'review',
] as const;
