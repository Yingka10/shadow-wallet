// Shadow Wallet · Parent Tablet — 自訂任務的回饋方式選項
//
// ─────────────────────────────────────────────────────────────────────────
// 這個模組執行的是**修訂後**的家庭參與回饋政策。
//
// 舊規則：家庭參與 ＋ 成長幣 = 非法，硬擋。
//
// 新規則：家庭參與**預設**不以成長幣標價 —— 那是對孩子的承諾，不是設定 ——
//         但兩種情況是家庭的合法選擇：
//           · 孩子在起步階段需要一點外在支持
//           · 這個家庭本來就有明確的零用錢／有償約定
//
// 修訂的理由不是「放寬比較好」。是舊規則把一個**教養主張**寫成了
// 一條**技術限制**：它擋住的不是壞決定，是那些「我們家就是這樣過的」
// 的家庭 —— 而對他們來說，那條紅字的意思是「這個 App 不接受我們家」。
//
// ⚠️ 但「理念上允許」不等於「系統做得到」。
//
//    coin-policy.json 目前只定義 C 與 D 兩類的幣值，四個年齡段都是。
//    `CoinCategory` 這個型別本身就是 `'C' | 'D'`。
//    所以家庭參與現在**算不出合法的幣值**，而這裡不會去借 C 或 D 的數字來代算 ——
//    偷來的數字會變成一個沒有人知道依據的金額，寫進孩子的錢包。
//
//    這一層因此把兩件事分開回答：
//      availability      = 產品理念上允不允許
//      coinAmountStatus  = 系統現在算不算得出金額
//
//    家長在**選單那一步**就會知道第二件事，而不是填完整份表單、
//    按下建立、才被 RPC 回一句 POLICY_REJECTED。
// ─────────────────────────────────────────────────────────────────────────

import type { PurposeCategory, RewardPolicy } from '../taskCatalog';
import type { TaskEditorKind } from '../taskDraft';
import { priceCoin, type CoinCategory, type CoinDifficulty } from '../taskReward/coinPolicy';
import { TIME_SAVING_ENABLED } from '../taskReward/selectAvailableRewardPolicies';

/**
 * 幣值政策有沒有這一類的數字。
 *
 * `policy_missing` 不是錯誤狀態，是**目前的事實**：
 * 產品已經決定家庭參與可以用成長幣，但幣值政策還沒有 B 類的數字，
 * 而那需要產品拍板，不是工程可以自己填的。
 */
export type CoinAmountStatus = 'available' | 'policy_missing' | 'not_applicable';

export type RewardOptionAvailability =
  | 'recommended'
  | 'available'
  | 'available_with_confirmation'
  | 'unavailable';

export type RewardOptionReasonCode =
  | 'FAMILY_PARTICIPATION_DEFAULT'
  | 'FAMILY_PARTICIPATION_NEEDS_INTENT'
  | 'COIN_POLICY_MISSING_FOR_CATEGORY'
  | 'COIN_POLICY_NEEDS_ESTIMATED_MINUTES'
  | 'COIN_POLICY_UNPRICED'
  | 'ROUTINE_NOT_A_COIN_SOURCE'
  | 'SHORT_SUPPORT_PROGRESS_ONLY'
  | 'FAMILY_ROLE_CONTRIBUTION_ONLY'
  | 'TIME_SAVING_NOT_ENABLED';

export type RewardOptionPresentation = {
  rewardPolicy: RewardPolicy;
  availability: RewardOptionAvailability;
  title: string;
  description: string;
  reasonCode?: RewardOptionReasonCode;
  /** 選了就必須明確表達「為什麼要用成長幣」。 */
  requiresSupportIntent?: boolean;
  /** 選了暫時性支持就必須設回顧時間。 */
  requiresReviewTiming?: boolean;
  /**
   * 系統現在算不算得出金額。
   *
   * 不在 spec 的原始欄位清單裡，是實作時發現非加不可的：
   * 少了它，`available_with_confirmation` 這個值同時代表
   * 「可以但要確認」與「可以但建不出來」，而家長會在最後一步才發現差別。
   */
  coinAmountStatus: CoinAmountStatus;
};

export type EvaluateCustomTaskRewardOptionsInput = {
  /** 與 lib/onboarding 的 AgeGroup 對齊（'6-9' 等）。 */
  ageGroup: string;
  purposeCategory: PurposeCategory;
  editorKind: TaskEditorKind;
  /** 長期形式的期間。目前不影響選項，保留給之後的「太長不宜發幣」規則。 */
  durationDays?: number;
  /** 沒有估計分鐘就對應不到幣值政策的時間分級。 */
  estimatedMinutes?: number;
  difficulty?: CoinDifficulty;
};

/**
 * 目的 → 幣值政策的分類。
 *
 * **與 taskReward 的同名對照表刻意保持一致的形狀**（A/B 都是 null），
 * 但這裡多回一個原因：呼叫端要能分辨「這一類不發幣」與
 * 「這一類還沒有數字」—— 前者是政策，後者是缺口。
 */
function coinCategoryOf(purposeCategory: PurposeCategory): CoinCategory | null {
  switch (purposeCategory) {
    case 'autonomous_challenge':
      return 'C';
    case 'learning_skill':
      return 'D';
    case 'life_routine':
    case 'family_participation':
      return null;
  }
}

/** 幣值政策現在對這個組合算不算得出金額。 */
function coinAmountStatusOf(
  input: EvaluateCustomTaskRewardOptionsInput,
): { status: CoinAmountStatus; reasonCode?: RewardOptionReasonCode } {
  const category = coinCategoryOf(input.purposeCategory);

  if (category === null) {
    // A 與 B 都落在這裡，但意義不同：
    //   A 生活常規 —— 產品上就不作為固定幣源（下面會標成 unavailable）
    //   B 家庭參與 —— 產品上已經允許，只是政策還沒有數字
    return { status: 'policy_missing', reasonCode: 'COIN_POLICY_MISSING_FOR_CATEGORY' };
  }

  if (input.estimatedMinutes === undefined) {
    return { status: 'policy_missing', reasonCode: 'COIN_POLICY_NEEDS_ESTIMATED_MINUTES' };
  }

  const pricing = priceCoin(
    input.ageGroup,
    category,
    input.estimatedMinutes,
    input.difficulty,
  );

  return pricing.status === 'priced'
    ? { status: 'available' }
    : { status: 'policy_missing', reasonCode: 'COIN_POLICY_UNPRICED' };
}

type Draft = Omit<RewardOptionPresentation, 'coinAmountStatus'> & {
  coinAmountStatus?: CoinAmountStatus;
};

/**
 * 這一份自訂任務可以用哪些回饋方式。
 *
 * 純函式。不呼叫 AI、不讀 catalog、不碰網路。
 *
 * **回傳的是「呈現」不是「決定」**：真正的決定仍然由
 * `evaluateTaskReward` 做，而那一層會再擋一次。這裡的價值是讓家長
 * 在選單那一刻就看見結果，而不是在最後一步。
 */
export function evaluateCustomTaskRewardOptions(
  input: EvaluateCustomTaskRewardOptionsInput,
): RewardOptionPresentation[] {
  const coin = coinAmountStatusOf(input);
  const options: Draft[] = [];

  // ── 兩種形式的回饋方式是被政策鎖死的 ──────────────────────────────────
  //
  // 不是「建議」，是 create_parent_task_v1 的 guard 會擋：
  // 短期支援必須 progress_only、家庭角色必須 family_contribution。
  // 在這裡就只列一個選項，家長不會看到一個選了會失敗的東西。

  if (input.editorKind === 'short_support') {
    return [{
      rewardPolicy: 'progress_only',
      availability: 'recommended',
      title: '進度與肯定',
      description: '記錄進步的過程，穩定之後就結束。這種短期練習不作為賺幣的來源。',
      reasonCode: 'SHORT_SUPPORT_PROGRESS_ONLY',
      coinAmountStatus: 'not_applicable',
    }];
  }

  if (input.editorKind === 'family_role') {
    return [{
      rewardPolicy: 'family_contribution',
      availability: 'recommended',
      title: '家庭貢獻紀錄',
      description: '孩子承擔的角色會被記錄下來，在週報裡被看見。',
      reasonCode: 'FAMILY_ROLE_CONTRIBUTION_ONLY',
      coinAmountStatus: 'not_applicable',
    }];
  }

  switch (input.purposeCategory) {
    // ── B 家庭參與：這一輪修訂的重點 ───────────────────────────────────
    case 'family_participation':
      options.push(
        {
          rewardPolicy: 'family_contribution',
          availability: 'recommended',
          title: '家庭貢獻紀錄',
          description: '這件事會被記錄成對家的投入，在週報裡被看見。不發成長幣。',
          reasonCode: 'FAMILY_PARTICIPATION_DEFAULT',
          coinAmountStatus: 'not_applicable',
        },
        {
          rewardPolicy: 'progress_only',
          availability: 'available',
          title: '進度與肯定',
          description: '只記錄有沒有做到，用肯定回應，不發成長幣。',
          coinAmountStatus: 'not_applicable',
        },
        {
          rewardPolicy: 'record_only',
          availability: 'available',
          title: '只留下紀錄',
          description: '完成後留一筆紀錄就好，不額外回饋。',
          coinAmountStatus: 'not_applicable',
        },
        {
          // 修訂前這一項根本不會出現。現在它出現，但需要家長明確說明為什麼。
          rewardPolicy: 'coin_eligible',
          availability: 'available_with_confirmation',
          title: '成長幣回饋',
          description:
            '家庭參與預設不用成長幣。如果孩子現在需要一點外在動力，'
            + '或你們家本來就有有償的約定，可以選這一項，並說明是哪一種。',
          reasonCode: 'FAMILY_PARTICIPATION_NEEDS_INTENT',
          requiresSupportIntent: true,
          // 回顧時間只有「暫時性支持」才要求。家庭自訂約定不強制 ——
          // 對一個既有的家庭制度跳出「多久後檢討」是在指導別人怎麼過日子。
          requiresReviewTiming: false,
          coinAmountStatus: coin.status,
          ...(coin.reasonCode ? { reasonCode: coin.reasonCode } : null),
        },
      );
      break;

    // ── A 生活常規：維持不作為固定幣源 ─────────────────────────────────
    //
    // 這一輪**沒有**修訂 A 類。修訂的只有家庭參與 ——
    // 兩者的理由不同：家庭參與是「家庭怎麼分工」，那是家庭的事；
    // 生活自理是「照顧自己」，把它標價會讓孩子學到照顧自己是有償的。
    case 'life_routine':
      options.push(
        {
          rewardPolicy: 'progress_only',
          availability: 'recommended',
          title: '進度與肯定',
          description: '記錄有沒有做到，用肯定回應。',
          coinAmountStatus: 'not_applicable',
        },
        {
          rewardPolicy: 'record_only',
          availability: 'available',
          title: '只留下紀錄',
          description: '完成後留一筆紀錄就好。',
          coinAmountStatus: 'not_applicable',
        },
        {
          rewardPolicy: 'coin_eligible',
          availability: 'unavailable',
          title: '成長幣回饋',
          description: '照顧自己的事不作為固定的賺幣來源。',
          reasonCode: 'ROUTINE_NOT_A_COIN_SOURCE',
          coinAmountStatus: 'not_applicable',
        },
      );
      break;

    // ── C / D：既有政策完全不變 ────────────────────────────────────────
    case 'autonomous_challenge':
    case 'learning_skill':
      options.push(
        {
          rewardPolicy: 'coin_eligible',
          availability: coin.status === 'available' ? 'recommended' : 'unavailable',
          title: '成長幣回饋',
          description:
            coin.status === 'available'
              ? '完成後給予成長幣，金額由幣值政策依年齡段與投入時間計算。'
              : '要先設定每次大約做多久，才算得出金額。',
          ...(coin.reasonCode ? { reasonCode: coin.reasonCode } : null),
          coinAmountStatus: coin.status,
        },
        {
          rewardPolicy: 'progress_only',
          availability: 'available',
          title: '進度與肯定',
          description: '記錄投入與進步，不發成長幣。',
          coinAmountStatus: 'not_applicable',
        },
        {
          rewardPolicy: 'record_only',
          availability: 'available',
          title: '只留下紀錄',
          description: '完成後留一筆紀錄就好。',
          coinAmountStatus: 'not_applicable',
        },
      );
      break;
  }

  // 時間儲蓄的建立與兌換鏈路都還沒打通。列出來但標明不可用，
  // 免得下一個人以為是漏寫。
  options.push({
    rewardPolicy: 'time_saving_eligible',
    availability: TIME_SAVING_ENABLED ? 'available' : 'unavailable',
    title: '時間儲蓄',
    description: '累積可以兌換的時間。',
    reasonCode: 'TIME_SAVING_NOT_ENABLED',
    coinAmountStatus: 'not_applicable',
  });

  return options.map((o) => ({ ...o, coinAmountStatus: o.coinAmountStatus ?? 'not_applicable' }));
}

/**
 * 這個組合現在建得出來嗎。
 *
 * 「理念上允許」與「現在做得到」是兩件事，這個函式回答第二件。
 * 用途是讓確認按鈕在正確的時機變成不可按，而不是讓家長送出後才失敗。
 */
export function canFinalizeRewardOption(option: RewardOptionPresentation): boolean {
  if (option.availability === 'unavailable') return false;
  if (option.rewardPolicy !== 'coin_eligible') return true;
  // 發幣的選項一定要有合法金額。沒有金額的 coin_eligible 任務會讓
  // 家長看到「可獲得成長幣」、孩子完成後拿到 0。
  return option.coinAmountStatus === 'available';
}
