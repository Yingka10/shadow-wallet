// 第七階段 A — command 值 → DB canonical 值
//
// 這一組映射有兩份實作（這裡與 migration 的 map_purpose_category /
// map_completion_policy）。兩份不同步的話，寫進 DB 的 category 就會錯，
// 而 fn_complete_task 是用 category 決定發不發幣的 —— 所以要在這裡固定住。

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DB_CATEGORY_BY_PURPOSE,
  DB_COMPLETION_POLICY,
  claimRuleFor,
  dbCategoryOf,
  dbCompletionPolicyOf,
} from '../dbMapping';
import { COMPLETION_LABEL, PURPOSE_LABEL, PRESET_CATALOG_VERSION } from '../../taskCatalog';

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

const MIGRATION = readText(
  join(process.cwd(), 'supabase', 'migrations', '20260728000000_task_drawer_persistence_v1.sql'),
);

// ---------------------------------------------------------------------------
// 任務目的 → A/B/C/D
// ---------------------------------------------------------------------------

describe('purposeCategory → tasks.category', () => {
  it('四個目的各自對到一個字母，且沒有兩個目的撞在一起', () => {
    expect(DB_CATEGORY_BY_PURPOSE).toEqual({
      life_routine: 'A',
      family_participation: 'B',
      autonomous_challenge: 'C',
      learning_skill: 'D',
    });
    const letters = Object.values(DB_CATEGORY_BY_PURPOSE);
    expect(new Set(letters).size).toBe(letters.length);
  });

  it('catalog 的每一個 PurposeCategory 都有對應，沒有漏', () => {
    for (const purpose of Object.keys(PURPOSE_LABEL)) {
      expect({ purpose, mapped: (DB_CATEGORY_BY_PURPOSE as Record<string, string>)[purpose] })
        .toEqual({ purpose, mapped: expect.stringMatching(/^[ABCD]$/) });
    }
  });

  it('SQL 那一份用同一組對應', () => {
    for (const [purpose, letter] of Object.entries(DB_CATEGORY_BY_PURPOSE)) {
      expect(MIGRATION).toContain(`WHEN '${purpose}'`);
      // 例：WHEN 'family_participation' THEN 'B'
      const line = MIGRATION.split('\n').find(l => l.includes(`WHEN '${purpose}'`));
      expect({ purpose, line: line?.includes(`'${letter}'`) })
        .toEqual({ purpose, line: true });
    }
  });

  it('沒有新增 purpose_category 欄位', () => {
    // 兩個欄位並存必然會有一天不同步，而 fn_complete_task 讀的是 category。
    expect(MIGRATION).not.toMatch(/ADD COLUMN[^;]*purpose_category/i);
    expect(dbCategoryOf('family_participation')).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// 結束方式
// ---------------------------------------------------------------------------

describe('completionPolicy → DB canonical', () => {
  it('catalog 的五個值都有對應', () => {
    for (const policy of Object.keys(COMPLETION_LABEL)) {
      expect({ policy, mapped: (DB_COMPLETION_POLICY as Record<string, string>)[policy] })
        .toEqual({ policy, mapped: expect.any(String) });
    }
  });

  it('兩個名稱不同的值有明確改名，其餘原樣', () => {
    expect(dbCompletionPolicyOf('ongoing')).toBe('keep_recurring');
    expect(dbCompletionPolicyOf('plan_complete')).toBe('finish_project');
    expect(dbCompletionPolicyOf('complete_once')).toBe('complete_once');
    expect(dbCompletionPolicyOf('review_and_continue')).toBe('review_and_continue');
    expect(dbCompletionPolicyOf('stabilize_and_exit')).toBe('stabilize_and_exit');
  });

  it('DB constraint 允許的正好是映射後的那五個值', () => {
    const targets = new Set(Object.values(DB_COMPLETION_POLICY));
    expect(targets.size).toBe(5);
    for (const value of targets) {
      expect({ value, allowed: MIGRATION.includes(`'${value}'`) })
        .toEqual({ value, allowed: true });
    }
  });

  it('SQL 的映射函式接受 catalog 的舊名也接受 canonical 名（重複套用不會壞）', () => {
    expect(MIGRATION).toContain("WHEN 'ongoing'             THEN 'keep_recurring'");
    expect(MIGRATION).toContain("WHEN 'keep_recurring'      THEN 'keep_recurring'");
    expect(MIGRATION).toContain("WHEN 'plan_complete'       THEN 'finish_project'");
    expect(MIGRATION).toContain("WHEN 'finish_project'      THEN 'finish_project'");
  });
});

// ---------------------------------------------------------------------------
// claim 規則
// ---------------------------------------------------------------------------

describe('claim 規則推導', () => {
  it('單次任務是整個生命週期一次，不是每天一次', () => {
    expect(claimRuleFor('one_time')).toEqual({ claimPeriod: 'once', maxClaimsPerPeriod: 1 });
  });

  it('固定星期是每個排定日一次', () => {
    expect(claimRuleFor('fixed_days')).toEqual({ claimPeriod: 'day', maxClaimsPerPeriod: 1 });
  });

  it('每週次數是每週最多 N 次', () => {
    expect(claimRuleFor('weekly_frequency', 3))
      .toEqual({ claimPeriod: 'week', maxClaimsPerPeriod: 3 });
    expect(claimRuleFor('weekly_frequency', 1))
      .toEqual({ claimPeriod: 'week', maxClaimsPerPeriod: 1 });
  });

  it('DB 的 claim_period 允許 once，而且不是用 due_date 假裝的', () => {
    expect(MIGRATION).toContain("CHECK (claim_period IN ('day', 'week', 'once'))");
    // scheduled_date 不可以被寫進 due_date。
    expect(MIGRATION).toContain('NULL,                      -- due_date 不用來裝 scheduled_date');
  });

  it('RPC 自己推導，不從命令讀 claim 欄位', () => {
    // 命令裡根本沒有這兩個鍵，RPC 也沒有去讀它們的地方。
    expect(MIGRATION).not.toContain("->> 'claimPeriod'");
    expect(MIGRATION).not.toContain("->> 'maxClaimsPerPeriod'");
    // 推導本身在 RPC 裡，三種排程各一條。
    expect(MIGRATION).toContain("v_claim_period := 'once'");
    expect(MIGRATION).toContain("v_claim_period := 'week'");
    expect(MIGRATION).toContain("v_claim_period := 'day'");
  });
});

// ---------------------------------------------------------------------------
// catalog 版本
// ---------------------------------------------------------------------------

describe('preset catalog version', () => {
  it('有版本字串，且 DB 有欄位可以存', () => {
    expect(PRESET_CATALOG_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MIGRATION).toContain('preset_catalog_version text');
  });

  it('preset id 是 text 且刻意不設外鍵', () => {
    expect(MIGRATION).toContain('preset_family_id       text');
    expect(MIGRATION).toContain('preset_variant_id      text');
    expect(MIGRATION).not.toMatch(/preset_family_id[^,;]*REFERENCES/i);
  });
});
