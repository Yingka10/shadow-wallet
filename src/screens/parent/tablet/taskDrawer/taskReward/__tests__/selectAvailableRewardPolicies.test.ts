// 第七階段 B — 回饋方式的能力閘門
//
// 兩件事：
//   1. 幣值數字只有一份 —— 來自 coin-policy.json，不是抄在程式碼裡。
//   2. 家長不會看到一個選了之後會被資料庫拒絕的選項。

import { readFileSync } from 'fs';
import { join } from 'path';
import { ALL_FAMILIES } from '../../taskCatalog';
import {
  COIN_POLICY_EFFECTIVE_DATE,
  COIN_POLICY_VERSION,
  priceCoin,
  resolveBand,
} from '../coinPolicy';
import {
  TIME_SAVING_ENABLED,
  resolveInitialRewardPolicy,
  resolveTaskRewardCapabilities,
  selectAvailableRewardPolicies,
} from '../selectAvailableRewardPolicies';
import type { TaskRewardCapabilities } from '../types';

/**
 * 讀檔一律把 CRLF 正規化成 LF。
 *
 * 這個 repo 的 git 設定會在 checkout 時把行尾轉成 CRLF（Windows），
 * 而下面的斷言用多行片段比對 SQL。不正規化的話，一次 `git checkout`
 * 就能讓一堆測試「壞掉」，但程式其實一個字都沒改。
 */
function readText(path: string): string {
  return readFileSync(path, 'utf8').split(/\r\n/).join('\n');
}

const POLICY_PATH = join(
  process.cwd(), 'supabase', 'functions', 'ai-proxy', 'coin-policy.json',
);
const POLICY_RAW = readText(
POLICY_PATH);

const BOTH_ON: TaskRewardCapabilities = { coinRewardsEnabled: true, timeSavingEnabled: true };
const COIN_ONLY: TaskRewardCapabilities = { coinRewardsEnabled: true, timeSavingEnabled: false };
const NEITHER: TaskRewardCapabilities = { coinRewardsEnabled: false, timeSavingEnabled: false };

// ---------------------------------------------------------------------------
// 政策來源
// ---------------------------------------------------------------------------

describe('幣值來源', () => {
  it('用的是 repo 裡那份已定案的政策，不是另一份抄本', () => {
    expect(POLICY_RAW).toContain(COIN_POLICY_VERSION);
    expect(POLICY_RAW).toContain(COIN_POLICY_EFFECTIVE_DATE);
    expect(COIN_POLICY_VERSION).toMatch(/^coin-policy-\d+\.\d+\.\d+$/);
  });

  it('政策狀態是 ACTIVE —— 不是 placeholder', () => {
    expect(POLICY_RAW).toContain('ACTIVE');
  });

  it('時間分級與政策檔的 band 一致', () => {
    expect(resolveBand(7)).toBe('5-10');
    expect(resolveBand(20)).toBe('11-20');
    expect(resolveBand(30)).toBe('21-30');
    expect(resolveBand(45)).toBe('31-45');
    expect(resolveBand(90)).toBe('46+');
    // 低於最小 band 併入第一段，與 ai-proxy 的 calcCoins 相同。
    expect(resolveBand(2)).toBe('5-10');
  });

  it('程式碼裡沒有自己的幣值表 —— 數字全部從 JSON 來', () => {
    const source = readText(
join(__dirname, '..', 'coinPolicy.ts'));
    const code = source.split(/\r?\n/).filter(line => !line.trim().startsWith('//')).join('\n');
    // 政策檔的錨點數字（6-9 歲 D 類 21-30 分 = 15 幣）不該出現在程式碼裡。
    expect(code).not.toMatch(/bandBaseCoins\s*[:=]\s*\{/);
    expect(code).toContain("from '../../../../../../supabase/functions/ai-proxy/coin-policy.json'");
  });

  it('政策沒填數字時回 unpriced，不猜', () => {
    expect(priceCoin('2-4', 'C', 20).status).toBe('coin_disabled');
    expect(priceCoin('unknown-age', 'D', 20).status).toBe('unpriced');
    // 沒有分鐘就沒有 band。
    expect(priceCoin('6-9', 'D', 0).status).toBe('unpriced');
  });
});

// ---------------------------------------------------------------------------
// 能力
// ---------------------------------------------------------------------------

describe('能力判定', () => {
  it('時間儲蓄一律關閉：建立端、完成端、兌換端都還沒打通', () => {
    expect(TIME_SAVING_ENABLED).toBe(false);
    const capabilities = resolveTaskRewardCapabilities({
      ageGroup: '6-9',
      purposeCategory: 'learning_skill',
      estimatedMinutes: 20,
    });
    expect(capabilities.timeSavingEnabled).toBe(false);
  });

  it('有估計分鐘的學習任務算得出幣值 → 可發幣', () => {
    expect(
      resolveTaskRewardCapabilities({
        ageGroup: '6-9', purposeCategory: 'learning_skill', estimatedMinutes: 20,
      }).coinRewardsEnabled,
    ).toBe(true);
  });

  it('沒有估計分鐘 → 不可發幣（不是給 0，是不給這個選項）', () => {
    expect(
      resolveTaskRewardCapabilities({
        ageGroup: '6-9', purposeCategory: 'autonomous_challenge',
      }).coinRewardsEnabled,
    ).toBe(false);
  });

  it('家庭參與與生活常規永遠不可發幣', () => {
    for (const purpose of ['family_participation', 'life_routine'] as const) {
      expect(
        resolveTaskRewardCapabilities({
          ageGroup: '6-9', purposeCategory: purpose, estimatedMinutes: 20,
        }).coinRewardsEnabled,
      ).toBe(false);
    }
  });

  it('2-4 歲不可發幣（政策明說不獨立呈現、不發幣）', () => {
    expect(
      resolveTaskRewardCapabilities({
        ageGroup: '2-4', purposeCategory: 'learning_skill', estimatedMinutes: 20,
      }).coinRewardsEnabled,
    ).toBe(false);
  });

  it('年齡段不明時當作不可發幣，寧可少一個選項', () => {
    expect(
      resolveTaskRewardCapabilities({
        ageGroup: '', purposeCategory: 'learning_skill', estimatedMinutes: 20,
      }).coinRewardsEnabled,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 選單
// ---------------------------------------------------------------------------

describe('選單', () => {
  const allowed = [
    'coin_eligible', 'time_saving_eligible', 'progress_only', 'record_only',
  ] as const;

  it('demo：用不了的直接不列出來', () => {
    const options = selectAvailableRewardPolicies({
      allowedRewardPolicies: allowed, displayMode: 'demo', capabilities: COIN_ONLY,
    });
    expect(options.map(o => o.policy)).toEqual(['coin_eligible', 'progress_only', 'record_only']);
    expect(options.every(o => o.available)).toBe(true);
  });

  it('demo：能力全關時連可發幣也不列', () => {
    const options = selectAvailableRewardPolicies({
      allowedRewardPolicies: allowed, displayMode: 'demo', capabilities: NEITHER,
    });
    expect(options.map(o => o.policy)).toEqual(['progress_only', 'record_only']);
  });

  it('development：全部列出，用不了的標示原因', () => {
    const options = selectAvailableRewardPolicies({
      allowedRewardPolicies: allowed, displayMode: 'development', capabilities: NEITHER,
    });
    expect(options.map(o => o.policy)).toEqual([...allowed]);

    const timeSaving = options.find(o => o.policy === 'time_saving_eligible');
    expect(timeSaving?.available).toBe(false);
    expect(timeSaving?.unavailableNote).toBe('尚未啟用');

    const coin = options.find(o => o.policy === 'coin_eligible');
    expect(coin?.available).toBe(false);
    expect(coin?.unavailableNote).toBeTruthy();
  });

  it('能力都開時 time_saving 才會回 available（型別與資料都保留著）', () => {
    const options = selectAvailableRewardPolicies({
      allowedRewardPolicies: allowed, displayMode: 'demo', capabilities: BOTH_ON,
    });
    expect(options.map(o => o.policy)).toEqual([...allowed]);
  });
});

// ---------------------------------------------------------------------------
// 草稿的起始選項
// ---------------------------------------------------------------------------

describe('草稿的起始回饋方式', () => {
  it('預設可用時就用預設', () => {
    expect(
      resolveInitialRewardPolicy(
        ['coin_eligible', 'progress_only'], 'coin_eligible', COIN_ONLY,
      ),
    ).toBe('coin_eligible');
  });

  it('預設用不了時退到第一個能用的', () => {
    expect(
      resolveInitialRewardPolicy(
        ['coin_eligible', 'time_saving_eligible', 'progress_only'], 'coin_eligible', NEITHER,
      ),
    ).toBe('progress_only');
  });

  it('完全沒有可用選項時回 undefined，讓呼叫端決定而不是靜靜換掉', () => {
    expect(
      resolveInitialRewardPolicy(
        ['coin_eligible', 'time_saving_eligible'], 'coin_eligible', NEITHER,
      ),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 整份 catalog
// ---------------------------------------------------------------------------

describe('36 個 variant 都走得完', () => {
  const variants = ALL_FAMILIES.flatMap(f => f.variants);

  it('沒有任何 variant 會落到「一個回饋方式都選不了」', () => {
    const dead = variants.filter(variant => {
      const capabilities = resolveTaskRewardCapabilities({
        ageGroup: '6-9',
        purposeCategory: variant.purposeCategory,
        ...(variant.defaultDraft.estimatedMinutes !== undefined
          ? { estimatedMinutes: variant.defaultDraft.estimatedMinutes }
          : null),
      });
      return selectAvailableRewardPolicies({
        allowedRewardPolicies: variant.allowedRewardPolicies,
        displayMode: 'demo',
        capabilities,
      }).length === 0;
    });
    expect(dead.map(v => v.id)).toEqual([]);
  });

  it('demo 模式下沒有任何 variant 列得出時間儲蓄', () => {
    const offenders = variants.filter(variant =>
      selectAvailableRewardPolicies({
        allowedRewardPolicies: variant.allowedRewardPolicies,
        displayMode: 'demo',
        capabilities: resolveTaskRewardCapabilities({
          ageGroup: '6-9',
          purposeCategory: variant.purposeCategory,
          ...(variant.defaultDraft.estimatedMinutes !== undefined
            ? { estimatedMinutes: variant.defaultDraft.estimatedMinutes }
            : null),
        }),
      }).some(option => option.policy === 'time_saving_eligible'),
    );
    expect(offenders.map(v => v.id)).toEqual([]);
  });
});
