# 解開 weekly_rhythm 死結 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 `duration_type='recurring'` 且 `cadence_mode='weekly_frequency'` 的孩子計畫能夠有 `progress_model='weekly_rhythm'`，解開「沒有終點的目標永遠不能直接確認」的跨層死結。

**Architecture:** 三處把「有每週節奏」誤寫成「必須是 long_term」的條件，一併放寬成「排除 one_time」。一支新 migration 用 `CREATE OR REPLACE` 覆寫兩支 RPC 並重建一條 CHECK；客戶端不需要改動，但補一組契約測試把行為釘住。

**Tech Stack:** PostgreSQL / PL/pgSQL（Supabase migrations）、TypeScript、Jest

**Spec:** `docs/superpowers/specs/2026-09-06-child-goal-duration-design.md`（§3）

## Global Constraints

- `progress_model` 的合法值只有 `'weekly_rhythm'` 與 `NULL`。這一包**不新增**任何 progress model。
- 放寬後的判準一律是「排除 `one_time`」，不是「允許 `long_term` 與 `recurring`」。前者表達的是「one_time 沒有每週節奏可看」這條真正的理由；後者是列舉，之後新增 duration_type 時會再錯一次。
- `cadence_mode` 的條件不變：仍然只有 `('weekly_frequency', 'fixed_days')`。
- 不動 `resolveDurationType`、不動 ai-proxy、不動任何 UI 文案。那些屬於另一份計畫。
- 現行函式定義位置（`CREATE OR REPLACE` 必須基於這兩份，不是更早的版本）：
  - `publish_child_confirmed_plan_v1` → `supabase/migrations/20260828000000_parent_shared_term_proposal.sql:79`
  - `propose_child_planning_terms_v1` → `supabase/migrations/20260830000000_shared_term_pending_reward_fix.sql:21`

---

## 背景：死結是怎麼形成的

| 層 | 現行規則 | 位置 |
|---|---|---|
| DB CHECK | `progress_model='weekly_rhythm'` ⇒ `duration_type='long_term'` | `20260812000000_child_proposal_plan_structure.sql:79-89` |
| RPC（publish） | 只有 `v_duration = 'long_term'` 才寫 `weekly_rhythm` | `20260828000000_parent_shared_term_proposal.sql:416-421` |
| RPC（shared terms） | 只有 `v_source.duration_type = 'long_term'` 才寫 | `20260830000000_shared_term_pending_reward_fix.sql:414-419` |
| Client 閘門 | `cadence_mode='weekly_frequency'` ⇒ `progress_model='weekly_rhythm'` | `src/lib/childPlanning/parentAgreement/isChildPlanDirectConfirmable.ts` |

`recurring` + `weekly_frequency` 的計畫因此永遠拿不到 `weekly_rhythm`，
client 永遠判定系統欄位不齊，家長永遠只看得到「想調整一下」。

CHECK 的註解自述理由是「一個 one_time 的計畫不該宣稱用每週節奏看進度，
畫面會去算一個永遠是 0/0 的本週」——這個理由只涵蓋 `one_time`。

**客戶端不需要改。** `systemFieldsComplete` 對 `duration_type` 只有一條要求
（`long_term` 時 `duration_days` 必須 > 0），`recurring` 走不到那一條；
它要的 `progress_model === 'weekly_rhythm'` 在本計畫修好後就會有值。

---

### Task 1: 放寬 CHECK 與兩支 RPC 的 weekly_rhythm 判準

**Files:**
- Create: `supabase/migrations/20260906000000_weekly_rhythm_recurring.sql`
- Create: `supabase/verify/weekly_rhythm_recurring_check.sql`
- Read-only 基底（**不要修改這兩個檔案**）：
  - `supabase/migrations/20260828000000_parent_shared_term_proposal.sql:79`
  - `supabase/migrations/20260830000000_shared_term_pending_reward_fix.sql:21`

**Interfaces:**
- Consumes: 無（本計畫第一個任務）
- Produces: `child_proposal_plan_versions` 接受 `duration_type IN ('recurring','long_term')` 搭配 `progress_model='weekly_rhythm'`；兩支 RPC 在 `progressionKind='rhythm'` 且 duration 非 `one_time` 時寫入 `weekly_rhythm`

- [x] **Step 1: 寫會失敗的驗證腳本**

建立 `supabase/verify/weekly_rhythm_recurring_check.sql`。全程在交易內、最後 ROLLBACK，
不留任何資料：

```sql
-- 驗證：recurring + weekly_frequency 必須能有 weekly_rhythm。
-- 修正前這支會在第一個 INSERT 就被 CHECK 擋下並 RAISE。
BEGIN;

DO $$
DECLARE
  v_family uuid;
  v_child  uuid;
  v_prop   uuid;
BEGIN
  SELECT id INTO v_family FROM families LIMIT 1;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'SKIP: 這個資料庫沒有 families 列，無法驗證';
  END IF;
  SELECT id INTO v_child FROM children WHERE family_id = v_family LIMIT 1;
  IF v_child IS NULL THEN
    RAISE EXCEPTION 'SKIP: 這個家庭沒有孩子，無法驗證';
  END IF;

  INSERT INTO child_proposals (
    family_id, child_id, status, child_original_goal,
    proposal_source, cadence_mode, cadence_weekly_frequency,
    child_reward_preference
  ) VALUES (
    v_family, v_child, 'draft', '每週練琴三次',
    'child', 'weekly_frequency', 3, 'just_record'
  ) RETURNING id INTO v_prop;

  -- 這一段在修正前會丟 23514 check_violation
  INSERT INTO child_proposal_plan_versions (
    proposal_id, version_no, authored_by,
    plan_title, completion_description, next_step,
    purpose_category, duration_type, duration_days,
    cadence_mode, cadence_weekly_frequency, cadence_days,
    progress_model, estimated_minutes
  ) VALUES (
    v_prop, 1, 'child',
    '每週練琴三次', '完成一次約定的練習時段', '今天先練 15 分鐘',
    'D', 'recurring', NULL,
    'weekly_frequency', 3, NULL,
    'weekly_rhythm', 15
  );

  RAISE NOTICE 'PASS: recurring + weekly_frequency + weekly_rhythm 可以寫入';
END $$;

ROLLBACK;
```

- [x] **Step 2: 跑它，確認失敗**

Run：
```bash
psql "$DATABASE_URL" -f supabase/verify/weekly_rhythm_recurring_check.sql
```
Expected：FAIL，錯誤訊息含
`new row for relation "child_proposal_plan_versions" violates check constraint "child_proposal_plan_versions_progress_model_evidence"`

- [x] **Step 3: 寫 migration 的 CHECK 段**

建立 `supabase/migrations/20260906000000_weekly_rhythm_recurring.sql`，第一段：

```sql
-- GrowBook — weekly_rhythm 不再要求 long_term
--
-- ─────────────────────────────────────────────────────────────────────────
-- 原本的 evidence CHECK 寫成「只允許 long_term」，但它自述的理由是：
--
--   「沒有這條的話，一個 one_time 的計畫也可以宣稱自己用每週節奏看進度，
--     而畫面會去算一個永遠是 0/0 的『本週』。」
--
-- 那個理由只涵蓋 one_time。recurring + weekly_frequency（「每週練琴三次」）
-- 明明就有每週節奏可看，卻被同一條規則擋掉 —— 而且擋出來的後果不是
-- 顯示錯誤，是**家長永遠不能直接確認**：client 的 systemFieldsComplete
-- 要求 weekly_frequency 必須配 weekly_rhythm，而 DB 不讓它有值。
--
-- 判準改成「排除 one_time」而不是「允許 long_term 與 recurring」——
-- 前者是真正的理由，後者是列舉，之後新增 duration_type 會再錯一次。
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE child_proposal_plan_versions
  DROP CONSTRAINT IF EXISTS child_proposal_plan_versions_progress_model_evidence;
ALTER TABLE child_proposal_plan_versions
  ADD CONSTRAINT child_proposal_plan_versions_progress_model_evidence
  CHECK (
    progress_model IS NULL
    OR (
      progress_model = 'weekly_rhythm'
      AND duration_type IS NOT NULL
      AND duration_type <> 'one_time'
      AND cadence_mode IN ('weekly_frequency', 'fixed_days')
    )
  );
```

- [x] **Step 4: 跑驗證腳本，確認 CHECK 已放行**

Run：
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260906000000_weekly_rhythm_recurring.sql
psql "$DATABASE_URL" -f supabase/verify/weekly_rhythm_recurring_check.sql
```
Expected：`NOTICE: PASS: recurring + weekly_frequency + weekly_rhythm 可以寫入`

- [x] **Step 5: 覆寫 publish_child_confirmed_plan_v1**

把 `supabase/migrations/20260828000000_parent_shared_term_proposal.sql` 第 79 行起的
整支函式定義**逐字複製**到新 migration，只改第 416-421 行那一段：

```sql
  v_progress := NULL;
  IF v_progression = 'rhythm'
    AND v_duration IS NOT NULL
    AND v_duration <> 'one_time'
    AND v_cadence_mode IN ('weekly_frequency', 'fixed_days') THEN
    v_progress := 'weekly_rhythm';
  END IF;
```

⚠️ 複製整支而不是只貼這一段。`CREATE OR REPLACE FUNCTION` 是全體置換，
只貼片段會把函式其餘部分刪掉。

- [x] **Step 6: 覆寫 propose_child_planning_terms_v1**

同樣把 `supabase/migrations/20260830000000_shared_term_pending_reward_fix.sql` 第 21 行起的
整支函式複製過來，只改第 414-419 行那一段：

```sql
  v_progression := v_root.child_confirmed_plan ->> 'progressionKind';
  v_progress := NULL;
  IF v_progression = 'rhythm'
    AND v_source.duration_type IS NOT NULL
    AND v_source.duration_type <> 'one_time'
    AND v_mode IN ('weekly_frequency', 'fixed_days') THEN
    v_progress := 'weekly_rhythm';
  END IF;
```

- [x] **Step 7: 確認 migration 冪等（可重跑）**

Run：
```bash
psql "$DATABASE_URL" -f supabase/migrations/20260906000000_weekly_rhythm_recurring.sql
psql "$DATABASE_URL" -f supabase/migrations/20260906000000_weekly_rhythm_recurring.sql
```
Expected：兩次都成功、沒有錯誤。`DROP CONSTRAINT IF EXISTS` 與
`CREATE OR REPLACE FUNCTION` 都是冪等的。

（這一步是 P0-5A 的教訓：那一輪的 migration 不冪等，在 staging 重跑時炸掉。）

- [x] **Step 8: Commit**

```bash
git add supabase/migrations/20260906000000_weekly_rhythm_recurring.sql \
        supabase/verify/weekly_rhythm_recurring_check.sql
git commit -m "fix(child-planning): weekly_rhythm 不再要求 long_term

recurring + weekly_frequency 的計畫在 DB 層拿不到 weekly_rhythm，
而 client 的 systemFieldsComplete 要求它必須有 —— 結果是沒有終點的
目標永遠不能直接確認。三處判準一併改成排除 one_time。"
```

---

### Task 2: 釘住客戶端契約

**Files:**
- Modify: `src/lib/childPlanning/__tests__/parentAgreement.test.ts`
- 不修改 production code —— 本任務只加測試

**Interfaces:**
- Consumes: Task 1 讓 DB 能產生 `recurring` + `weekly_rhythm` 的列
- Produces: 無新介面

**為什麼需要這一組測試：** 客戶端這次不用改，但「recurring 也能直接確認」
現在只由 DB 那側保證。沒有客戶端測試的話，之後任何人在
`systemFieldsComplete` 加一條 `duration_type === 'long_term'` 就會把死結
重新裝回去，而且不會有任何測試變紅。

- [x] **Step 1: 寫測試**

在 `src/lib/childPlanning/__tests__/parentAgreement.test.ts` 末尾加入。
沿用檔案既有的 `card()` helper（它接受 plan 欄位的 overrides）：

```ts
describe('沒有終點的節奏計畫也能直接確認', () => {
  it('recurring + weekly_frequency + weekly_rhythm 是可以確認的', () => {
    const target = card({
      duration_type: 'recurring',
      duration_days: null,
      progress_model: 'weekly_rhythm',
      cadence_mode: 'weekly_frequency',
      cadence_weekly_frequency: 3,
      cadence_days: null,
    });

    expect(childPlanConfirmability(target)).toEqual({ ok: true });
    expect(isChildPlanDirectConfirmable(target)).toBe(true);
  });

  it('recurring 不需要 duration_days —— 那是 long_term 才有的要求', () => {
    const target = card({
      duration_type: 'recurring',
      duration_days: null,
      progress_model: 'weekly_rhythm',
    });

    expect(isChildPlanDirectConfirmable(target)).toBe(true);
  });

  it('long_term 仍然必須有 duration_days', () => {
    const target = card({
      duration_type: 'long_term',
      duration_days: null,
      progress_model: 'weekly_rhythm',
    });

    expect(childPlanConfirmability(target)).toEqual({
      ok: false,
      block: 'system_fields_incomplete',
      pending: [],
    });
  });
});
```

- [x] **Step 2: 跑測試**

Run：
```bash
npx jest src/lib/childPlanning/__tests__/parentAgreement.test.ts
```
Expected：全數 PASS。

⚠️ 這一組是**特徵測試（characterization test）**，不是 red-green ——
客戶端本來就已經正確，紅的是 DB 那側（已由 Task 1 的驗證腳本涵蓋）。
如果這三題有任何一題在 Task 1 之前就是紅的，代表我對客戶端閘門的判讀有誤，
**停下來重新分析，不要改測試去配合**。

- [x] **Step 3: 跑整個 childPlanning 測試組，確認沒有回歸**

Run：
```bash
npx jest src/lib/childPlanning
```
Expected：全數 PASS。

- [x] **Step 4: Commit**

```bash
git add src/lib/childPlanning/__tests__/parentAgreement.test.ts
git commit -m "test(child-planning): 釘住『沒有終點的節奏計畫可以直接確認』"
```

---

### Task 3: staging 驗收

**Files:**
- Create: `supabase/verify/staging/__tests__/weeklyRhythmRecurringSlice.test.ts`

**Interfaces:**
- Consumes: Task 1 的 migration 已套用到 staging
- Produces: 無

- [ ] **Step 1: 把 migration 推上 staging**

Run：
```bash
npx supabase migration list --linked
npx supabase db push --linked
```
Expected：`20260906000000` 出現在 remote 側。

⚠️ 先確認 `--linked` 指向的是 **staging**（ref `lcmzbdgzehjxwuyduqwj`），
不是 production。推錯專案是這個 repo 出過的事故。

- [ ] **Step 2: 寫 staging 測試**

建立 `supabase/verify/staging/__tests__/weeklyRhythmRecurringSlice.test.ts`，
沿用既有 staging 測試的骨架（預設 skip、環境變數開關、真登入）：

```ts
// staging 驗收 — 沒有終點的節奏計畫（recurring + weekly_frequency）
// 必須能拿到 weekly_rhythm，而且家長端呈現為「可以直接確認」。
//
// 跑法（預設 skip）：
//   STAGING_WEEKLY_RHYTHM_RECURRING=1 WEEKLY_RHYTHM_PROPOSAL_ID=<uuid> \
//   EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_SUPABASE_URL=... \
//   EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
//   EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=lcmzbdgzehjxwuyduqwj \
//   STAGING_PARENT_EMAIL=demo.parent@growbook-demo.invalid \
//   STAGING_PARENT_PASSWORD=... \
//   npx jest supabase/verify/staging/__tests__/weeklyRhythmRecurringSlice

import { supabase } from '../../../../src/lib/supabase';
import { isChildPlanDirectConfirmable } from '../../../../src/lib/childPlanning/parentAgreement';
import type { ParentProposalCardData } from '../../../../src/lib/childProposal/types';

const RUN = process.env.STAGING_WEEKLY_RHYTHM_RECURRING === '1';
const suite = RUN ? describe : describe.skip;

const EMAIL = process.env.STAGING_PARENT_EMAIL ?? '';
const PASSWORD = process.env.STAGING_PARENT_PASSWORD ?? '';
const PROPOSAL_ID = process.env.WEEKLY_RHYTHM_PROPOSAL_ID ?? '';

jest.setTimeout(60_000);

suite('staging — recurring 節奏計畫可以直接確認', () => {
  let card: ParentProposalCardData;

  beforeAll(async () => {
    if (!PROPOSAL_ID) throw new Error('缺 WEEKLY_RHYTHM_PROPOSAL_ID');
    const auth = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (auth.error) throw new Error(`登入失敗：${auth.error.message}`);

    const { data: proposal, error } = await supabase
      .from('child_proposals').select('*').eq('id', PROPOSAL_ID).maybeSingle();
    if (error || !proposal) throw new Error('讀不到目標提案');

    const { data: version } = await supabase
      .from('child_proposal_plan_versions').select('*')
      .eq('id', proposal.current_plan_version_id).maybeSingle();

    card = { proposal, currentPlanVersion: version } as ParentProposalCardData;
  });

  afterAll(async () => { await supabase.auth.signOut(); });

  it('這一版是 recurring，而且拿到了 weekly_rhythm', () => {
    expect(card.currentPlanVersion?.duration_type).toBe('recurring');
    expect(card.currentPlanVersion?.progress_model).toBe('weekly_rhythm');
    expect(card.currentPlanVersion?.duration_days).toBeNull();
  });

  it('家長端判定為可以直接確認', () => {
    expect(isChildPlanDirectConfirmable(card)).toBe(true);
  });
});
```

- [ ] **Step 3: 在 staging 走一次真流程產生 fixture**

用孩子端跑一次沒有終點的目標（例如「每週練琴三次」），
走完規劃並 publish，記下 proposal id。

- [ ] **Step 4: 跑 staging 測試**

Run：Step 2 註解裡那一串，`WEEKLY_RHYTHM_PROPOSAL_ID` 填 Step 3 記下的 id。
Expected：2 passed。

- [ ] **Step 5: 人工確認家長端畫面**

打開家長端首頁，那張卡片必須：
- 顯示「孩子已經想好怎麼做」而**不是**「還有安排要一起補充」
- 出現「確認這份約定」按鈕
- **不再**出現「孩子的想法已經很完整，還有幾件要一起說定」

- [ ] **Step 6: Commit**

```bash
git add supabase/verify/staging/__tests__/weeklyRhythmRecurringSlice.test.ts
git commit -m "test(staging): recurring 節奏計畫可以直接確認的驗收"
```

---

## 已解決的待驗證項（不要重查）

spec 列了三個待驗證項，其中兩個在寫這份計畫時已經查清：

1. **`tasks` 端有沒有平行約束** → **沒有。**
   `tasks_progress_model_check`（`20260813000000_child_proposal_direct_confirm.sql:54-56`）
   只是值域檢查 `progress_model IS NULL OR progress_model = 'weekly_rhythm'`，
   不帶任何 `duration_type` 條件。`tasks` 這一側不需要改動。

2. **weekly_rhythm 到底有幾個寫入點** → **兩個**，都在 Task 1 涵蓋：
   `publish_child_confirmed_plan_v1`（20260828:416）與
   `propose_child_planning_terms_v1`（20260830:414）。
   20260825 / 20260827 / 20260828:924 那三處是**已被取代的舊版定義**，
   不要動它們。

3. **CHECK 是否有註解之外的考量** → 使用者已於 2026-09-06 拍板照改。

---

## 執行紀錄（2026-09-06）

Task 1、Task 2 完成並在 staging 驗證通過。

- 紅燈：staging 實際約束為 `duration_type = 'long_term'`，兩支 RPC 都帶舊條件
- 綠燈：約束改為 `duration_type <> 'one_time'`，兩支 RPC `已更新 = true`
- 冪等：整份 migration 重跑一次，無錯誤
- 記帳：`supabase_migrations.schema_migrations` 已補 `20260906000000`
- 寫入驗證：`weekly_rhythm_recurring_check.sql` 三項全過（含「one_time 仍被擋下」）

套用途徑是 Dashboard SQL Editor（`BEGIN; … COMMIT;`）＋ 手動補記帳，
因為本機到 pooler 的連線一直失敗（`.temp/pooler-url` 的主機名已過期，
tenant not found）。**要拿正確連線字串請從 Dashboard → Connect 複製。**

Task 3（staging E2E 驗收）尚未執行 —— 見下方。

---

## 這一包**不**處理的事

- 「把哈利波特讀完」仍然會被判成 `recurring`、建成日常任務。那是
  `resolveDurationType` 的問題，屬於第二份計畫（期限由孩子決定）。
- 本計畫修好之後，那類目標會變成「可以直接確認的日常節奏任務」——
  比現在的「完全按不下去」好，但仍然不是正確的長期挑戰。
- 既有的 `recurring` 資料列不會回填 `weekly_rhythm`。它們是在舊規則下
  寫入的，要重新 publish 才會拿到。
