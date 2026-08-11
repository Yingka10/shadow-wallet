// P0-3 Final — 計畫版本結構化契約的 migration
//
// ─────────────────────────────────────────────────────────────────────────
// 與 P0-1 同一套做法：對 SQL 檔的文字做斷言。
//
// 理由沒變 —— 這台機器沒有本機 Postgres 也沒有 Docker，而「這支 migration
// 真的建得起來」只能在 staging 實際套用時證明。靜態測試證明的是另一件事：
// **這支 migration 有沒有把該有的保證寫進去**，而那件事在 code review 時
// 最容易漏掉（少一條 CHECK 看起來跟有一樣）。
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260812000000_child_proposal_plan_structure.sql'),
  'utf8',
).split(/\r\n/).join('\n');

/** 去掉註解 —— 「這個東西不存在」的斷言不可以被說明文字命中。 */
const CODE = SQL
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

// ---------------------------------------------------------------------------
// 交易與向後相容
// ---------------------------------------------------------------------------

describe('整支是一個交易，而且不需要 backfill', () => {
  it('BEGIN / COMMIT 成對', () => {
    expect(CODE).toContain('BEGIN;');
    expect(CODE).toContain('COMMIT;');
  });

  it('新欄位全部用 ADD COLUMN IF NOT EXISTS，重跑不會炸', () => {
    for (const column of [
      'purpose_category',
      'completion_description',
      'progress_model',
      'next_step',
    ]) {
      expect({ column, present: CODE.includes(`ADD COLUMN IF NOT EXISTS ${column}`) })
        .toEqual({ column, present: true });
    }
  });

  it('沒有 NOT NULL —— 舊資料不需要填假值', () => {
    const addColumns = CODE.slice(
      CODE.indexOf('ADD COLUMN IF NOT EXISTS purpose_category'),
      CODE.indexOf('COMMENT ON COLUMN'),
    );
    expect(addColumns).not.toContain('NOT NULL');
  });

  it('沒有 DROP COLUMN / DROP TABLE —— 這是補欄位，不是改造', () => {
    expect(CODE).not.toContain('DROP COLUMN');
    expect(CODE).not.toContain('DROP TABLE');
  });

  it('不碰 confirmed_* —— 最終回饋的既有設計一個字都不動', () => {
    expect(CODE).not.toContain('ADD COLUMN IF NOT EXISTS confirmed_');
    expect(CODE).not.toContain('DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_confirmed');
  });

  it('沒有新增第二套最終定價欄位', () => {
    for (const forbidden of ['final_coin', 'final_amount', 'reward_coin_amount']) {
      expect({ forbidden, present: CODE.includes(forbidden) })
        .toEqual({ forbidden, present: false });
    }
  });
});

// ---------------------------------------------------------------------------
// 值域
// ---------------------------------------------------------------------------

describe('四個欄位的值域', () => {
  it('purpose_category 只收 A/B/C/D', () => {
    expect(CODE).toMatch(/purpose_category IN \('A', 'B', 'C', 'D'\)/);
  });

  it('progress_model 只收 weekly_rhythm —— 這一輪不做 generic engine', () => {
    expect(CODE).toMatch(/progress_model IN \('weekly_rhythm'\)/);
  });

  it('weekly_rhythm 必須真的有每週節奏可看', () => {
    expect(CODE).toContain('child_proposal_plan_versions_progress_model_evidence');
    const constraint = CODE.slice(
      CODE.indexOf('child_proposal_plan_versions_progress_model_evidence CHECK') > -1
        ? CODE.indexOf('child_proposal_plan_versions_progress_model_evidence CHECK')
        : CODE.lastIndexOf('child_proposal_plan_versions_progress_model_evidence'),
      CODE.indexOf('completion_not_blank'),
    );
    expect(constraint).toContain("duration_type = 'long_term'");
    expect(constraint).toContain("cadence_mode IN ('weekly_frequency', 'fixed_days')");
  });

  it('completion_description / next_step 不接受空字串，也有長度上限', () => {
    expect(CODE).toMatch(/btrim\(completion_description\) <> ''/);
    expect(CODE).toMatch(/btrim\(next_step\) <> ''/);
    expect(CODE).toContain('length(completion_description) <= 120');
    expect(CODE).toContain('length(next_step) <= 120');
  });
});

// ---------------------------------------------------------------------------
// weekly_frequency 的語意
// ---------------------------------------------------------------------------

describe('一週幾次是彈性的週目標，不是排定的星期', () => {
  it('兩張表都有 CHECK', () => {
    expect(CODE).toContain('child_proposals_weekly_frequency_no_days');
    expect(CODE).toContain('child_proposal_plan_versions_weekly_frequency_no_days');
    expect(
      CODE.match(/CHECK \(cadence_mode <> 'weekly_frequency' OR cadence_days IS NULL\)/g) ?? [],
    ).toHaveLength(2);
  });

  it('加 CHECK 之前先把既有資料正規化，避免套用時炸在別人的環境', () => {
    const normalize = CODE.slice(0, CODE.indexOf('child_proposals_weekly_frequency_no_days'));
    expect(normalize).toContain('UPDATE child_proposals');
    expect(normalize).toContain('SET cadence_days = NULL');
  });

  it('RPC 也擋 —— 命令同時帶 weekly_frequency 與 days 是兩種語意混在一起', () => {
    expect(CODE).toContain('WEEKLY_FREQUENCY_HAS_NO_DAYS');
    expect(CODE).toContain("v_cadence_mode = 'weekly_frequency' AND v_days IS NOT NULL");
  });
});

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

describe('同一份提案 ＋ 同一把 request key 只有一版', () => {
  it('partial unique index，只管有 request key 的列', () => {
    expect(CODE).toContain('CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_ai_request_unique');
    expect(CODE).toContain('ON child_proposal_plan_versions (proposal_id, ai_request_id)');
    expect(CODE).toContain('WHERE ai_request_id IS NOT NULL');
  });

  it('建索引之前先化解可能存在的重複，而且**不刪任何一列**', () => {
    const dedupe = CODE.slice(
      CODE.indexOf('UPDATE child_proposal_plan_versions v'),
      CODE.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS child_proposal_plan_versions_ai_request_unique'),
    );
    expect(dedupe).toContain('SET ai_request_id = NULL');
    expect(dedupe).not.toContain('DELETE');
  });

  it('碰撞當成成功，不是 persist_failed', () => {
    expect(CODE).toContain('ON CONFLICT (proposal_id, ai_request_id) WHERE ai_request_id IS NOT NULL');
    expect(CODE).toContain('DO NOTHING');
    expect(CODE).toContain("'duplicate', true");
  });

  it('沒插入又查不到既有那一列時，回明確失敗 —— 不回沒有 id 的成功', () => {
    expect(CODE).toContain("'code', 'PERSISTENCE_FAILED'");
    expect(CODE).toContain('計畫版本未寫入，且找不到既有的同一版');
  });
});

// ---------------------------------------------------------------------------
// RPC 仍然守住既有邊界
// ---------------------------------------------------------------------------

describe('RPC 沒有因為改版而鬆掉既有保證', () => {
  it('仍然是 _v1，新鍵全部可選', () => {
    expect(CODE).toContain('CREATE OR REPLACE FUNCTION public.add_child_proposal_plan_version_v1');
    // 新欄位一律走 NULLIF(btrim(COALESCE(...))) —— 沒帶就是 null。
    expect(CODE).toContain("NULLIF(btrim(COALESCE(p_command ->> 'purposeCategory', '')), '')");
  });

  it('最終幣值仍然一個字都不收', () => {
    expect(CODE).toContain('REWARD_NOT_CLIENT_DECIDED');
    expect(CODE).toContain("p_command -> 'reward' ? 'coinAmount'");
    expect(CODE).toContain("p_command ? 'confirmedReward'");
  });

  it('AI 建議幣值仍然必須附 snapshot', () => {
    expect(CODE).toContain('AI 建議幣值必須附上 aiSnapshot');
  });

  it('仍然是 SECURITY DEFINER ＋ 固定 search_path ＋ 家庭邊界', () => {
    expect(CODE).toContain('SECURITY DEFINER');
    expect(CODE).toContain('SET search_path = public');
    expect(CODE).toContain('PERFORM public.assert_child_in_caller_family(v_child_id)');
  });

  it('仍然只給 authenticated 執行', () => {
    expect(CODE).toContain('REVOKE ALL ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) FROM PUBLIC, anon');
    expect(CODE).toContain('GRANT EXECUTE ON FUNCTION public.add_child_proposal_plan_version_v1(jsonb) TO authenticated');
  });

  it('已回絕的提案仍然不能再加版本', () => {
    expect(CODE).toContain("v_status = 'closed_unsuitable'");
  });

  it('AI 版本仍然不會自己帶家長確認時間', () => {
    expect(CODE).toContain("CASE WHEN v_authored_by = 'parent' THEN v_now ELSE NULL END");
  });

  it('purpose / progress 的值域在 RPC 也擋一次，不只靠 CHECK', () => {
    expect(CODE).toContain("v_purpose NOT IN ('A', 'B', 'C', 'D')");
    expect(CODE).toContain("v_progress NOT IN ('weekly_rhythm')");
  });
});

// ---------------------------------------------------------------------------
// 不可變性
// ---------------------------------------------------------------------------

describe('計畫版本仍然是 append-only', () => {
  it('守衛涵蓋四個新欄位', () => {
    const guard = CODE.slice(CODE.indexOf('child_proposal_plan_version_guard()'));
    for (const column of [
      'purpose_category',
      'completion_description',
      'progress_model',
      'next_step',
    ]) {
      expect({ column, guarded: guard.includes(`NEW.${column} IS DISTINCT FROM OLD.${column}`) })
        .toEqual({ column, guarded: true });
    }
  });

  it('已確認的回饋快照仍然 write-once', () => {
    const guard = CODE.slice(CODE.indexOf('child_proposal_plan_version_guard()'));
    expect(guard).toContain('OLD.confirmed_at IS NOT NULL');
    expect(guard).toContain('已確認的回饋快照不可修改');
  });
});

// ---------------------------------------------------------------------------
// 不碰別人的東西
// ---------------------------------------------------------------------------

describe('這支 migration 的影響面', () => {
  it('不碰 tasks / wallets / transactions / child_tasks', () => {
    for (const table of ['tasks', 'wallets', 'transactions', 'child_tasks']) {
      expect({ table, altered: CODE.includes(`ALTER TABLE ${table}`) })
        .toEqual({ table, altered: false });
    }
  });

  it('不碰其他四支提案 RPC', () => {
    for (const rpc of [
      'create_child_proposal_v1',
      'transition_child_proposal_v1',
      'record_child_proposal_trial_v1',
      'create_child_proposal_adjustment_request_v1',
    ]) {
      expect({ rpc, replaced: CODE.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`) })
        .toEqual({ rpc, replaced: false });
    }
  });

  it('不動 RLS policy', () => {
    expect(CODE).not.toContain('CREATE POLICY');
    expect(CODE).not.toContain('DROP POLICY');
  });
});
