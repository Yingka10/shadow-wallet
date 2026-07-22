/**
 * coinPolicy — 讀取版本化的 coin-policy.json，提供型別安全的存取與幣值計算骨架。
 *
 * 對應 docs/coin-policy-draft.md 第 3 節（時間分級 → 難度加減 → range clamp）。
 * ⚠️ coin-policy.json 內所有 bandBaseCoins 目前為 null（placeholder，待團隊定案）。
 *    calcCoins 在遇到未填數字時回傳 { status: 'unpriced' }，不會亂猜幣值。
 *
 * 本檔只負責「C / D 已通過資格閘門後」的計算；A / B 的攔截屬 reward-eligibility，不在此。
 */

import policyRaw from './coin-policy.json' with { type: 'json' };

export type AgeGroup = '2-4' | '4-6' | '6-9' | '9-12';
export type CoinCategory = 'C' | 'D';
export type Difficulty = 'easy' | 'standard' | 'hard';
export type BandId = '5-10' | '11-20' | '21-30' | '31-45' | '46+';
export type PayoutBasis = 'per_completion' | 'per_session' | 'per_milestone' | 'final_completion';

interface CategoryPolicy {
  coinEnabled: boolean;
  reason?: string;
  bandBaseCoins?: Record<BandId, number | null>;
  range?: { min: number | null; max: number | null };
}

interface CoinPolicyFile {
  _meta: { policyVersion: string; status: string };
  timeBands: Array<{ id: BandId; minMinutes: number; maxMinutes: number | null }>;
  difficultyDelta: Record<Difficulty, number>;
  payoutBasis: { allowed: PayoutBasis[]; default: PayoutBasis };
  agePolicies: Record<AgeGroup, Record<CoinCategory, CategoryPolicy>>;
  frequency: { defaultClaimPeriod: string; defaultMaxClaimsPerPeriod: number };
}

const policy = policyRaw as unknown as CoinPolicyFile;

/** 目前使用中的 policy 版本字串，須隨每筆任務一起儲存以供稽核。 */
export const POLICY_VERSION = policy._meta.policyVersion;

/** 依估計分鐘數對應到時間分級 band。 */
export function resolveBand(estimatedMinutes: number): BandId {
  for (const b of policy.timeBands) {
    const underMax = b.maxMinutes === null || estimatedMinutes <= b.maxMinutes;
    if (estimatedMinutes >= b.minMinutes && underMax) return b.id;
  }
  // 低於最小 band（< 5 分）併入第一段。
  return policy.timeBands[0].id;
}

export type CalcResult =
  | { status: 'priced'; coins: number; band: BandId; policyVersion: string }
  | { status: 'coin_disabled'; reason: string; policyVersion: string }
  | { status: 'unpriced'; reason: string; band: BandId; policyVersion: string };

/**
 * 計算 C / D 任務的建議幣值：band → baseCoins → 難度加減 → range clamp。
 * 呼叫前假設任務已通過資格閘門（category ∈ {C,D}）。
 *
 * @param ageGroup 孩子年齡段
 * @param category 任務類別（僅 C / D）
 * @param estimatedMinutes AI 估計分鐘數
 * @param difficulty 難度列舉
 */
export function calcCoins(
  ageGroup: AgeGroup,
  category: CoinCategory,
  estimatedMinutes: number,
  difficulty: Difficulty,
): CalcResult {
  const cat = policy.agePolicies[ageGroup]?.[category];

  if (!cat || !cat.coinEnabled) {
    return { status: 'coin_disabled', reason: cat?.reason ?? '此年齡此類別不發幣', policyVersion: POLICY_VERSION };
  }

  const band = resolveBand(estimatedMinutes);
  const base = cat.bandBaseCoins?.[band];
  const min = cat.range?.min;
  const max = cat.range?.max;

  // placeholder 未填 → 明確回報 unpriced，交由呼叫端顯示「幣值待定案」，不亂算。
  if (base === null || base === undefined || min === null || min === undefined || max === null || max === undefined) {
    return {
      status: 'unpriced',
      reason: `policy 尚未填入 ${ageGroup}/${category}/${band} 的幣值（placeholder）`,
      band,
      policyVersion: POLICY_VERSION,
    };
  }

  const withDelta = base + policy.difficultyDelta[difficulty];
  const coins = Math.min(max, Math.max(min, Math.round(withDelta)));
  return { status: 'priced', coins, band, policyVersion: POLICY_VERSION };
}

/** 取得預設發放單位與頻率設定（第一版預設，family-policy 未覆寫時使用）。 */
export function defaultPayout(): { payoutBasis: PayoutBasis; claimPeriod: string; maxClaimsPerPeriod: number } {
  return {
    payoutBasis: policy.payoutBasis.default,
    claimPeriod: policy.frequency.defaultClaimPeriod,
    maxClaimsPerPeriod: policy.frequency.defaultMaxClaimsPerPeriod,
  };
}
