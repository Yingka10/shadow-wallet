// Shadow Wallet · Parent Tablet — 成長幣政策的讀取層
//
// 這裡**沒有任何幣值數字**。所有數字來自 supabase/functions/ai-proxy/coin-policy.json，
// 那份檔案的 _meta.status 是「ACTIVE — 已定案（首版）」、有 policyVersion，
// 是這個 repo 裡唯一一份正式、可版本化的幣值依據。
//
// 為什麼是「讀同一個 JSON」而不是「import ai-proxy 的 coinPolicy.ts」：
// 那支是 Deno Edge Function，用 `import ... with { type: 'json' }` 的 import attribute，
// RN / jest 的 babel 解析不了；而且 tsconfig 已把 supabase/functions 排除在編譯之外。
// 複製一份數字表則會立刻產生兩個會不同步的真相。
// 所以：**數字只有一份（JSON），演算法在兩邊各有一份實作，並由測試釘住兩者一致。**
//
// 演算法與 ai-proxy/coinPolicy.ts 的 calcCoins 相同：
//   時間分級 band → bandBaseCoins → difficultyDelta → range clamp。

import policyRaw from '../../../../../../supabase/functions/ai-proxy/coin-policy.json';

/** 與 lib/onboarding 的 AgeGroup 對齊。 */
export type CoinAgeGroup = '2-4' | '4-6' | '6-9' | '9-12';

/** 只有 C / D 進得了幣值計算；A / B 在資格層就結束。 */
export type CoinCategory = 'C' | 'D';

/** 難度是列舉三值，不是連續小數（policy _meta.notes）。 */
export type CoinDifficulty = 'easy' | 'standard' | 'hard';

export type CoinBandId = '5-10' | '11-20' | '21-30' | '31-45' | '46+';

type CategoryPolicy = {
  coinEnabled: boolean;
  reason?: string;
  bandBaseCoins?: Record<CoinBandId, number | null>;
  range?: { min: number | null; max: number | null };
};

type CoinPolicyFile = {
  _meta: { policyVersion: string; status: string; effectiveDate: string };
  timeBands: Array<{ id: CoinBandId; minMinutes: number; maxMinutes: number | null }>;
  difficultyDelta: Record<CoinDifficulty, number>;
  agePolicies: Record<string, Record<string, CategoryPolicy>>;
};

// JSON 的推導型別會把每個鍵都變成字面量，無法用變數索引。
// 這裡做一次結構斷言（不是 any），之後全部型別安全。
const policy = policyRaw as unknown as CoinPolicyFile;

/**
 * 目前使用中的政策版本。每一筆 coin_eligible 任務都要記下它，
 * 之後改數字時才分得出舊任務是依哪一版定價的。
 */
export const COIN_POLICY_VERSION: string = policy._meta.policyVersion;

/** 政策生效日，只作稽核顯示用。 */
export const COIN_POLICY_EFFECTIVE_DATE: string = policy._meta.effectiveDate;

/**
 * 難度未指定時套用的值。
 *
 * 這**不是**自己發明的數字：policy 的 difficultyDelta.standard 就是 0，
 * 也就是「不加不減，直接用該時間分級的基準幣值」。
 * 目前抽屜沒有難度輸入欄位（唯一產生難度的來源是 analyzeTask 的 AI 理解，本輪不呼叫），
 * 所以套用政策自己的中性值，並在 explanation 裡說明難度未指定。
 */
export const DEFAULT_COIN_DIFFICULTY: CoinDifficulty = 'standard';

/** 依估計分鐘數對應時間分級。低於最小 band 併入第一段（與 ai-proxy 相同）。 */
export function resolveBand(estimatedMinutes: number): CoinBandId {
  for (const band of policy.timeBands) {
    const underMax = band.maxMinutes === null || estimatedMinutes <= band.maxMinutes;
    if (estimatedMinutes >= band.minMinutes && underMax) return band.id;
  }
  return policy.timeBands[0].id;
}

export type CoinPricing =
  | {
      status: 'priced';
      /** 政策算出的建議值。 */
      suggestedAmount: number;
      /** 家長可調整的下限（policy 的 range.min）。 */
      minAllowed: number;
      /** 家長可調整的上限（policy 的 range.max）。 */
      maxAllowed: number;
      band: CoinBandId;
      difficulty: CoinDifficulty;
      /** true = 難度由呼叫端指定；false = 套用 policy 的中性值。 */
      difficultySpecified: boolean;
    }
  | { status: 'coin_disabled'; reason: string }
  | { status: 'unpriced'; reason: string };

/**
 * 算出一筆 C / D 任務的建議幣值與允許範圍。
 *
 * 呼叫前假設資格已判過（category 已收斂成 C / D）。
 * 政策沒填數字時回 unpriced —— 絕不猜、也不退回 0。
 */
export function priceCoin(
  ageGroup: string,
  category: CoinCategory,
  estimatedMinutes: number,
  difficulty?: CoinDifficulty,
): CoinPricing {
  const categoryPolicy = policy.agePolicies[ageGroup]?.[category];

  if (!categoryPolicy) {
    return { status: 'unpriced', reason: `政策沒有 ${ageGroup} 這個年齡段的規則` };
  }
  if (!categoryPolicy.coinEnabled) {
    return {
      status: 'coin_disabled',
      reason: categoryPolicy.reason ?? `${ageGroup} 的 ${category} 類不發成長幣`,
    };
  }
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
    return { status: 'unpriced', reason: '沒有估計分鐘數，無法對應到政策的時間分級' };
  }

  const band = resolveBand(estimatedMinutes);
  const base = categoryPolicy.bandBaseCoins?.[band];
  const min = categoryPolicy.range?.min;
  const max = categoryPolicy.range?.max;

  if (base == null || min == null || max == null) {
    return {
      status: 'unpriced',
      reason: `政策尚未填入 ${ageGroup} / ${category} / ${band} 的幣值`,
    };
  }

  const effectiveDifficulty = difficulty ?? DEFAULT_COIN_DIFFICULTY;
  const withDelta = base + policy.difficultyDelta[effectiveDifficulty];
  const suggestedAmount = Math.min(max, Math.max(min, Math.round(withDelta)));

  return {
    status: 'priced',
    suggestedAmount,
    minAllowed: min,
    maxAllowed: max,
    band,
    difficulty: effectiveDifficulty,
    difficultySpecified: difficulty !== undefined,
  };
}
