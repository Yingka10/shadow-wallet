// 第七階段 F — Demo 展示資料與 QA regression 資料的分離
//
// staging 上住著兩組資料，用途相反：
//
//   qa_seed.sql    regression 用。名稱刻意帶技術性（QA Child 8、
//                  QA idempotency 測試），因為 E2E 會斷言那些字串。
//   demo_seed.sql  給人看的。任何一個 QA/test/debug 字眼出現在 Demo 畫面上，
//                  都會讓人覺得這是半成品。
//
// 兩者最危險的互動是 reset：一支沒有 family 範圍的 DELETE 會把另一組清掉。
// 所以下面除了檢查文案，更重要的是檢查**每一條 DELETE 都有範圍**。

import { readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..', '..', '..', 'supabase', 'verify', 'staging');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

const DEMO_SEED = read('demo_seed.sql');
const DEMO_RESET = read('demo_reset.sql');
const QA_SEED = read('qa_seed.sql');
const RUNNER = read('run_demo.sh');

const DEMO_FAMILY = 'd0e70000-0000-4000-8000-000000000001';

/** 去掉註解，只留真正會被執行的 SQL。 */
function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

// ---------------------------------------------------------------------------
// 14. Demo 資料不含技術性字眼
// ---------------------------------------------------------------------------

describe('14. Demo seed 的內容是給人看的', () => {
  /** 只看會被寫進資料庫的中文字串（單引號內），不看註解與欄位名。 */
  const literals = statementsOf(DEMO_SEED)
    .match(/'[^']*'/g)
    ?.map(s => s.slice(1, -1)) ?? [];

  it.each(['QA', 'idempotency', 'debug', '測試'])(
    '寫進資料庫的字串不含「%s」', term => {
      const offenders = literals.filter(v => v.toLowerCase().includes(term.toLowerCase()));
      expect(offenders).toEqual([]);
    });

  it('六筆展示任務都在', () => {
    for (const name of ['完成學校作業', '餐後整理', '運動練習',
      '四週閱讀計畫', '整理書包 14 天', '四週餐桌小幫手']) {
      expect(DEMO_SEED).toContain(`'${name}'`);
    }
  });

  it('孩子是承恩、家庭是 GrowBook Demo Family', () => {
    expect(DEMO_SEED).toContain("'承恩'");
    expect(DEMO_SEED).toContain("'GrowBook Demo Family'");
  });

  it('可發幣的那一筆有正的幣值 —— 不展示 0 枚成長幣任務', () => {
    // demo_coin(12, 5, 25)：12 來自正式的 coin policy。
    expect(DEMO_SEED).toMatch(/demo_coin\(\s*(\d+)/);
    const amount = Number(DEMO_SEED.match(/demo_coin\(\s*(\d+)/)![1]);
    expect(amount).toBeGreaterThan(0);
  });

  it('成長計畫有五個里程碑，而且沒有任何「已完成」標記', () => {
    const milestones = DEMO_SEED.match(/'targetDay',\s*\d+/g) ?? [];
    expect(milestones).toHaveLength(5);
    // 目前沒有 milestone completion model，seed 也不該假裝有。
    // （只看里程碑那一段 —— State A 的背景紀錄本來就會真的建立 completion，
    //   但那是走 complete_task 產生的真實紀錄，不是編出來的里程碑狀態。）
    const milestoneBlock = DEMO_SEED.slice(
      DEMO_SEED.indexOf('{plan,milestones}'),
      DEMO_SEED.indexOf('整理書包 14 天'),
    );
    expect(milestoneBlock).not.toMatch(/completedAt|isCompleted|'completed'/);
  });

  it('不含密碼、金鑰或 project ref', () => {
    expect(DEMO_SEED).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(DEMO_SEED).not.toMatch(/supabase\.co/);
    // 密碼是必須被替換掉的佔位符，不是真的值。
    expect(DEMO_SEED).toContain('__DEMO_PASSWORD__');
  });

  it('佔位符沒被替換就拒絕建立帳號', () => {
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*DEMO_PASSWORD/);
  });
});

// ---------------------------------------------------------------------------
// 15 + 17. reset 的範圍
// ---------------------------------------------------------------------------

describe('15. demo_reset 只刪 Demo family', () => {
  const body = statementsOf(DEMO_RESET);

  it('沒有 TRUNCATE', () => {
    expect(body).not.toMatch(/TRUNCATE/i);
  });

  it('沒有 DROP TABLE / DROP SCHEMA', () => {
    expect(body).not.toMatch(/DROP\s+(TABLE|SCHEMA|DATABASE)/i);
  });

  it('每一條 DELETE 都有 WHERE', () => {
    const deletes = body.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    expect(deletes.length).toBeGreaterThan(10);
    for (const stmt of deletes) {
      expect({ stmt: stmt.slice(0, 60), hasWhere: /WHERE/i.test(stmt) })
        .toEqual({ stmt: stmt.slice(0, 60), hasWhere: true });
    }
  });

  it('每一條 DELETE 的範圍都追溯得到 Demo family', () => {
    // 允許的範圍變數：family / 該 family 的孩子 / 該 family 的任務 / demo 使用者。
    const deletes = body.match(/DELETE FROM[\s\S]*?;/g) ?? [];
    for (const stmt of deletes) {
      const scoped = /v_family|v_kids|v_tasks|v_user/.test(stmt);
      expect({ stmt: stmt.slice(0, 60), scoped }).toEqual({ stmt: stmt.slice(0, 60), scoped: true });
    }
  });

  it('範圍來自固定 id，不是「第一個家庭」這種不穩定的判斷', () => {
    expect(body).toContain(DEMO_FAMILY);
    expect(body).not.toMatch(/LIMIT 1|ORDER BY created_at\s+(ASC|LIMIT)/i);
  });

  it('刪之前先確認那個 id 真的是 Demo family', () => {
    expect(body).toContain("'GrowBook Demo Family'");
    expect(body).toMatch(/RAISE EXCEPTION[^;]*Demo family/);
  });
});

describe('17. QA regression 資料不會被 Demo reset 波及', () => {
  it('reset 完全沒有提到 QA 的任何識別字', () => {
    const body = statementsOf(DEMO_RESET);
    for (const term of ['QA Family', 'QA Parent', 'QA Child', 'qa-parent']) {
      expect(body).not.toContain(term);
    }
  });

  it('兩組 seed 的 family 名稱不同、帳號網域也不同', () => {
    expect(QA_SEED).toContain("'QA Family A'");
    expect(DEMO_SEED).toContain("'GrowBook Demo Family'");
    expect(QA_SEED).toContain('@example.invalid');
    expect(DEMO_SEED).toContain('@growbook-demo.invalid');
    expect(DEMO_SEED).not.toContain('@example.invalid');
  });

  it('Demo 的固定 id 不會出現在 QA seed 裡', () => {
    expect(QA_SEED).not.toContain('d0e70000');
  });
});

// ---------------------------------------------------------------------------
// 16. 可重複執行
// ---------------------------------------------------------------------------

describe('16. reset → seed 連跑兩次不會產生重複', () => {
  it('身分用固定 id，所以重跑不會多出一個家庭或孩子', () => {
    for (const id of [
      'd0e70000-0000-4000-8000-000000000001', // family
      'd0e70000-0000-4000-8000-000000000011', // auth user
      'd0e70000-0000-4000-8000-000000000021', // child
      'd0e70000-0000-4000-8000-000000000031', // wallet
    ]) {
      expect(DEMO_SEED).toContain(id);
    }
  });

  it('每一筆任務都有固定的 clientRequestId —— DB 層的 idempotency 也擋一次', () => {
    const requestIds = DEMO_SEED.match(/'d0e70000-0000-4000-8000-0000000000a\d'/g) ?? [];
    expect(requestIds).toHaveLength(6);
    expect(new Set(requestIds).size).toBe(6); // 六筆各自不同，不會互相覆蓋
  });

  it('已經有資料時 seed 直接停手，要求先 reset', () => {
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*demo_reset\.sql/);
  });

  it('沒有資料時 reset 不算失敗（可以直接 reseed）', () => {
    expect(DEMO_RESET).toMatch(/RAISE NOTICE[^;]*不存在/);
  });
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

describe('run_demo.sh 的安全條件', () => {
  it('沒有指定目標就不執行 —— 這支腳本會刪資料', () => {
    expect(RUNNER).toContain('DEMO_STAGING_REF');
    expect(RUNNER).toMatch(/中止：請設定 DEMO_STAGING_REF/);
  });

  it('比對 linked ref，而且要求專案名稱是 growbook-staging', () => {
    expect(RUNNER).toContain('supabase/.temp/project-ref');
    expect(RUNNER).toContain('growbook-staging');
  });

  it('密碼只從環境變數讀，不寫死也不放進指令列', () => {
    expect(RUNNER).toContain('DEMO_PASSWORD');
    expect(RUNNER).not.toMatch(/DEMO_PASSWORD=['"][^'"$]/);
  });

  it('不含金鑰，目標 ref 一律來自環境變數', () => {
    expect(RUNNER).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    // staging 的 ref 不寫死 —— 目標必須由 DEMO_STAGING_REF 明說。
    expect(RUNNER).not.toContain('lcmzbdgzehjxwuyduqwj');
    expect(RUNNER).toContain('DEMO_STAGING_REF');
  });

  it('唯一寫死的 ref 是 production，而且用途是黑名單', () => {
    // project ref 不是秘密（它出現在每一個 API URL 裡）。把 production 的 ref
    // 寫進來是防護，不是外洩：任何 target 證據命中它就立刻退出。
    // P0-5A 與 P0-6 都已經證明預設 target 會指向 production。
    expect(RUNNER).toContain('mduaghqszbwmoigllpbj');
    const line = RUNNER.split('\n').find(l => l.includes('mduaghqszbwmoigllpbj')) ?? '';
    expect(line).toMatch(/PRODUCTION_REF=/);
  });

  it('用 stdout.buffer 輸出 —— 否則中文會在送進資料庫前被本機 codepage 轉壞', () => {
    // 這不是假設性的：第一次跑 seed 時就是這樣壞的，而且壞得很安靜 ——
    // 筆數正確、只有名稱是亂碼。
    expect(RUNNER).toContain('stdout.buffer.write');
    expect(RUNNER).not.toMatch(/sys\.stdout\.write\(/);
  });
});

// ---------------------------------------------------------------------------
// P0-10A：reset 的順序
//
// 這一組釘的是一個真的壞過的東西。舊版 reset 寫於 P0-1 落地之前，順序是
// … → tasks → children，而 child_proposals.task_id 與
// child_proposal_plan_versions.confirmed_source_task_id 都是 ON DELETE SET NULL。
// 刪掉 canonical task 會把那兩欄設成 NULL，接著撞上
// child_proposals_active_consistency 與 ..._confirmed_atomic 兩條 CHECK（23514）。
// 也就是說：只要 Demo 真的跑過一次「提案 → 家長確認 → 正式任務」，reset 就必定失敗。
// ---------------------------------------------------------------------------

describe('P0-10A. reset 的刪除順序', () => {
  const body = statementsOf(DEMO_RESET);
  /** 某個表的 DELETE 在腳本裡的位置；-1 代表根本沒刪。 */
  const at = (table: string) =>
    body.search(new RegExp(`DELETE FROM\\s+${table}\\b`));

  it('提案圖排在 tasks 之前', () => {
    expect(at('child_proposals')).toBeGreaterThan(-1);
    expect(at('tasks')).toBeGreaterThan(-1);
    expect(at('child_proposals')).toBeLessThan(at('tasks'));
  });

  it('intervention_log 排在最前面 —— 它對 families/children 是 RESTRICT', () => {
    expect(at('intervention_log')).toBeGreaterThan(-1);
    expect(at('intervention_log')).toBeLessThan(at('children'));
    expect(at('intervention_log')).toBeLessThan(at('families'));
  });

  it('reward_items 排在 children 之前 —— 那條 FK 是 NO ACTION，不會自己被帶走', () => {
    expect(at('reward_items')).toBeGreaterThan(-1);
    expect(at('reward_items')).toBeLessThan(at('children'));
  });

  it('redemption_requests 也在 children 之前', () => {
    expect(at('redemption_requests')).toBeGreaterThan(-1);
    expect(at('redemption_requests')).toBeLessThan(at('children'));
  });

  it('weekly_reports 有被清掉', () => {
    expect(at('weekly_reports')).toBeGreaterThan(-1);
  });

  it('先把 task_completions.override_id 斷開再刪 overrides', () => {
    // overrides.completion_id → task_completions 是 CASCADE，
    // 但反向的 task_completions.override_id → overrides 是 NO ACTION，會擋人。
    const nullify = body.search(/UPDATE task_completions SET override_id = NULL/);
    expect(nullify).toBeGreaterThan(-1);
    expect(nullify).toBeLessThan(at('overrides'));
  });

  it('auth 那兩列排在 families / parents 之後（NO ACTION）', () => {
    expect(body.search(/DELETE FROM auth\.users/)).toBeGreaterThan(at('families'));
    expect(body.search(/DELETE FROM auth\.users/)).toBeGreaterThan(at('parents'));
  });

  it('孩子的身分也要對得上，不是只看 family 名稱', () => {
    expect(body).toContain('承恩');
    expect(body).toMatch(/RAISE EXCEPTION[^;]*承恩/);
  });

  it('有破壞性筆數上限，而且沒有 --force 之類的繞道', () => {
    expect(body).toMatch(/v_cap/);
    expect(body).toMatch(/RAISE EXCEPTION[^;]*超過上限/);
    expect(body).not.toMatch(/force/i);
  });

  it('清完會自我驗證，不是「跑完沒噴錯就算過」', () => {
    expect(body).toMatch(/RAISE EXCEPTION[^;]*沒有清乾淨/);
    expect(body).toMatch(/孤兒/);
  });
});

// ---------------------------------------------------------------------------
// P0-10A：State A 的背景紀錄
// ---------------------------------------------------------------------------

describe('P0-10A. State A 的背景紀錄', () => {
  const body = statementsOf(DEMO_SEED);

  it('完成紀錄走正式 RPC，不直接寫表', () => {
    expect(body).toContain('complete_task(');
    expect(body).toContain('record_completion_context(');
    expect(body).not.toMatch(/INSERT INTO task_completions/i);
    expect(body).not.toMatch(/INSERT INTO transactions/i);
  });

  it('絕對不直接改錢包餘額 —— 每一枚幣都要追得回一次完成', () => {
    expect(body).not.toMatch(/UPDATE\s+wallets\s+SET\s+balance/i);
  });

  it('RPC 回 error 就整包停下來，不會少一筆而沒人發現', () => {
    expect(body).toMatch(/RAISE EXCEPTION[^;]*背景紀錄失敗/);
  });

  it('日期全部相對推導，沒有寫死的日曆日', () => {
    expect(body).toContain("date_trunc('week'");
    expect(body).toContain("AT TIME ZONE 'Asia/Taipei'");
    // 只看背景紀錄那一段：寫死一個 2026-08-xx，隔週再展示就對不上「本週」了。
    // （整份檔案裡還有 presetCatalogVersion 這種**版本字串**長得像日期，
    //   那不是排程用的日期，不該被這條規則掃到。）
    const history = body.slice(body.indexOf('DO $history$'), body.indexOf('$history$;'));
    expect(history.length).toBeGreaterThan(200);
    expect(history).not.toMatch(/'20\d\d-\d\d-\d\d'/);
  });

  it('週界以週一為首，和 App 的 isoWeek 一致', () => {
    expect(body).toMatch(/demo_this_monday/);
  });

  it('長期計畫的起點被挪到過去，背景紀錄才落得進 plan window', () => {
    expect(body).toContain('demo_from');
    expect(body).toMatch(/v_start\s+date\s*:=\s*pg_temp\.demo_this_monday\(\)\s*-\s*7/);
  });

  it('seed 自己會驗錢包＝交易總和，而且沒有孤兒 earn', () => {
    expect(body).toMatch(/RAISE EXCEPTION[^;]*與交易總和/);
    expect(body).toMatch(/RAISE EXCEPTION[^;]*追不回任何一次完成/);
  });

  it('背景完成筆數是固定的（上週 5 + 本週 4 + 技能練習 2）', () => {
    expect(body).toMatch(/v_count <> 11/);
  });
});

// ---------------------------------------------------------------------------
// P0-10A：runner 的安全防護與 state CLI
// ---------------------------------------------------------------------------

describe('P0-10A. runner 的防護', () => {
  it('把 production ref 列為黑名單，命中就退出', () => {
    expect(RUNNER).toContain('PRODUCTION_REF');
    expect(RUNNER).toContain('mduaghqszbwmoigllpbj');
    expect(RUNNER).toMatch(/命中 production ref/);
  });

  it('黑名單掃的是多個 target 證據，不是只看 linked', () => {
    expect(RUNNER).toMatch(/for evidence in[^\n]*LINKED[^\n]*EXPECTED_PROJECT[^\n]*SUPABASE_URL/);
  });

  it('要求專案名稱是 growbook-staging', () => {
    expect(RUNNER).toContain('EXPECTED_PROJECT_NAME');
    expect(RUNNER).toContain('growbook-staging');
  });

  it('比對固定的 family 與 child 身分', () => {
    expect(RUNNER).toContain(DEMO_FAMILY);
    expect(RUNNER).toContain('d0e70000-0000-4000-8000-000000000021');
    expect(RUNNER).toContain('GrowBook Demo Family');
    expect(RUNNER).toContain('承恩');
  });

  it('執行前把 target 印出來給人看', () => {
    for (const label of ['PROJECT REF', 'PROJECT NAME', 'FAMILY', 'CHILD', 'STATE']) {
      expect(RUNNER).toContain(label);
    }
  });

  it('有 dry-run，而且它只讀不寫', () => {
    expect(RUNNER).toContain('dry-run');
    const dry = RUNNER.slice(RUNNER.indexOf('run_dry()'), RUNNER.indexOf('run_seed()'));
    expect(dry).toMatch(/SELECT/);
    for (const mutation of ['DELETE ', 'INSERT ', 'UPDATE ', 'TRUNCATE']) {
      expect(dry).not.toContain(mutation);
    }
  });

  it('預設 state 是 a', () => {
    expect(RUNNER).toMatch(/STATE='a'/);
  });

  // P0-10B 之後 --state=b 是真的可以跑的，所以這裡從「一定要拒絕」改成
  // 「不認得的 state 一定要拒絕」—— 守的還是同一件事：不准偷偷退回 a。
  it('不認得的 state 明確拒絕，不會偷偷退回 a', () => {
    expect(RUNNER).toMatch(/不認得的 state/);
    const arm = RUNNER.slice(RUNNER.indexOf('不認得的 state'));
    expect(arm.slice(0, 120)).toMatch(/exit 1/);
    // 唯一會靜默決定 state 的地方只有預設值。
    expect(RUNNER.match(/STATE=(['"])a\1/g) ?? []).toHaveLength(1);
  });

  it('runner 永遠不設 FORCE_AI_FALLBACK —— 那會把提案 AI 一起關掉', () => {
    expect(RUNNER).not.toContain('FORCE_AI_FALLBACK');
  });
});

describe('編碼守門', () => {
  it('seed 會驗中文的位元組長度，不是比對內容', () => {
    // 比對內容抓不到傳輸損壞：SQL 裡的字串和寫進去的值會一起壞掉，兩邊仍然相等。
    expect(DEMO_SEED).toContain('octet_length(nickname)');
    expect(DEMO_SEED).toMatch(/RAISE EXCEPTION[^;]*位元組/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// P0-10B — State B（共同閱讀計畫 4→3→接受→本週 2/3）
//
// State B 唯一無法由「今天重播」得到的東西是**行事曆**：P0-5B 的 accept 會把
// start_date 定成台北的今天，而 buildGoalPresentation 會丟掉 planStart 以前的
// 完成紀錄，所以「本週兩個不同日期各一次」在當天接受的計畫上不存在。
//
// 下面這組測的就是這條界線有沒有被守住：資料語意全部走正式 RPC，只有行事曆
// 被往前移，而且沒有任何未來日期、沒有手寫 completion/transaction/wallet。
// ───────────────────────────────────────────────────────────────────────────

const DEMO_STORY = read('demo_seed_story.sql');

describe('P0-10B. State B 的資料語意由正式 RPC 產生', () => {
  const story = statementsOf(DEMO_STORY);

  it('提案、版本、家長調整、孩子接受全部走正式 RPC', () => {
    for (const rpc of [
      'create_child_proposal_v1',
      'transition_child_proposal_v1',
      'add_child_proposal_plan_version_v1',
      'revise_child_proposal_plan_v1',
      'accept_child_proposal_plan_v1',
    ]) {
      expect(story).toContain(rpc);
    }
  });

  it('完成紀錄走 complete_task ＋ record_completion_context，不手寫任何一列', () => {
    expect(story).toContain('complete_task(');
    expect(story).toContain('record_completion_context(');
    expect(story).not.toMatch(/INSERT\s+INTO\s+task_completions/i);
    expect(story).not.toMatch(/INSERT\s+INTO\s+transactions/i);
    expect(story).not.toMatch(/UPDATE\s+wallets/i);
  });

  it('用真正的家長身分呼叫，不是繞過 assert_child_in_caller_family', () => {
    // auth.uid() 讀的是 request.jwt.claims，所以設定它等於「以這個人的身分呼叫」，
    // 而不是把授權檢查關掉。
    expect(story).toContain("set_config('request.jwt.claims'");
    expect(story).toContain('FROM parents WHERE family_id');
    // 真的切到 authenticated 角色會讓後面的行事曆 UPDATE 撞 RLS，不可以有。
    expect(story).not.toMatch(/set_config\(\s*'role'/);
  });

  it('AI 版本是一週 4 次，家長版本是一週 3 次', () => {
    expect(story).toMatch(/'weeklyFrequency',\s*4/);
    expect(story).toMatch(/'cadenceWeeklyFrequency',\s*3/);
  });

  it('只位移行事曆欄位，不動任何建立時間戳', () => {
    const updates = story.match(/UPDATE\s+\w+[\s\S]*?WHERE/g) ?? [];
    const updated = updates.join(' ');
    // 允許動的：plan window。
    expect(updated).toMatch(/started_at\s*=/);
    expect(updated).toMatch(/start_date\s*=/);
    // 不允許動的：建立與生效的時間戳。移了它們就是在編一條假時間線，
    // 而且 confirmed_at 被 guard 保護成 write-once，一定會留下破口。
    for (const forbidden of [
      'activated_at', 'effective_at', 'child_accepted_at',
      'parent_confirmed_at', 'confirmed_at',
    ]) {
      expect(updated).not.toContain(`${forbidden} =`);
    }
  });

  it('明確拒絕未來日期', () => {
    expect(story).toContain('拒絕建立未來的完成紀錄');
    expect(story).toMatch(/>\s*timezone\('Asia\/Taipei',\s*now\(\)\)::date/);
  });

  it('自我驗證釘住 2 個不同日期與 weekly_frequency=3 的正式任務', () => {
    expect(story).toContain('count(DISTINCT timezone(');
    expect(story).toContain('weekly_frequency = 3');
    expect(story).toContain('recurrence_days IS NULL');
    expect(story).toContain("progress_model = 'weekly_rhythm'");
  });

  it('故事層不寫死任何日曆日，全部由執行當下推導', () => {
    const literals = story.match(/'20\d\d-\d\d-\d\d'/g) ?? [];
    expect(literals).toEqual([]);
  });
});

describe('P0-10B. 行事曆可行性', () => {
  // 「本週 2/3」需要本週兩個不同日期。週一時本週只過了一天 —— 那個畫面在現實
  // 上不存在，而 App 的孩子端只呈現當週（completionsThisWeek 沒有 offset 參數，
  // 全域也找不到任何 previous-week 的呈現路徑），所以沒有「顯示上一週」這個
  // 退路。唯一誠實的做法是明確拒絕，不是補第二個日期出來。
  it('週一明確拒絕，而且是在任何破壞性動作之前', () => {
    expect(RUNNER).toContain('STATE_B_2_OF_3_NOT_CALENDAR_FEASIBLE');
    expect(DEMO_STORY).toContain('STATE_B_2_OF_3_NOT_CALENDAR_FEASIBLE');

    // reseed 會先 reset。可行性檢查必須排在 reset 前面，否則週一執行的結果是
    // State A 被清掉、State B 又建不起來，兩個 state 都沒有。
    const reseed = RUNNER.slice(RUNNER.indexOf('reseed)'));
    const feasibleAt = reseed.indexOf('assert_state_b_feasible');
    const resetAt = reseed.indexOf('demo_reset.sql');
    expect(feasibleAt).toBeGreaterThanOrEqual(0);
    expect(resetAt).toBeGreaterThanOrEqual(0);
    expect(feasibleAt).toBeLessThan(resetAt);
  });

  it('日期推導只用「本週一」與「本週二」，兩者都不可能是未來', () => {
    expect(DEMO_STORY).toContain("date_trunc('week', p_ref::timestamp)::date");
    expect(DEMO_STORY).toMatch(/'feasible',\s*p_ref > m/);
    expect(DEMO_STORY).toMatch(/'first_day',\s*m,/);
    expect(DEMO_STORY).toMatch(/'second_day',\s*m \+ 1,/);
  });

  /*
    d2 曾經是「今天」，而那讓 P0-8M 的 Demo 橋段永遠演不出來：孩子端「今天預計」
    的第一順位是今天那筆 completion 的 planned_time_window，所以今天一有完成
    紀錄，家長剛談定的新時段就會被壓在下面。

    正確的處置是改 Demo 的編排（把 d2 固定成週二），**不是**改 production 的
    precedence —— 今天實際發生的事本來就該優先於一份往後看的計畫。
  */
  it('第二筆完成不是「今天」，否則 P0-8M 的換時段畫面永遠被今天的紀錄蓋住', () => {
    expect(DEMO_STORY).not.toMatch(/'second_day',\s*p_ref/);
  });

  it('明確標出 P0-8M 的錄影窗口：要今天沒有完成紀錄才看得到新時段', () => {
    expect(DEMO_STORY).toMatch(/'p0_8m_capture_ready',\s*p_ref > m \+ 1/);
  });
});

describe('P0-10B. runner 的 state 切換', () => {
  it('--state=b 不再回 NOT_AVAILABLE_YET，而且 a/b 都是合法 state', () => {
    expect(RUNNER).not.toContain('STATE_B_NOT_AVAILABLE_YET');
    const arms = RUNNER.slice(RUNNER.indexOf('case "$STATE" in'));
    expect(arms).toMatch(/^\s*a\)/m);
    expect(arms).toMatch(/^\s*b\)/m);
  });

  it('State B 是 State A 再加一層，不是另一份 seed', () => {
    expect(RUNNER).toContain('demo_seed.sql');
    expect(RUNNER).toContain('demo_seed_story.sql');
    const seedFn = RUNNER.slice(RUNNER.indexOf('run_seed()'));
    // 故事層一定排在背景 seed 之後。
    expect(seedFn.indexOf('demo_seed.sql'))
      .toBeLessThan(seedFn.indexOf('demo_seed_story.sql'));
    // 而且只有 state b 才跑。
    expect(seedFn).toMatch(/if \[ "\$STATE" = 'b' \]; then\s*\n\s*run_sql "\$HERE\/demo_seed_story\.sql"/);
  });

  it('兩個 state 的預期產出寫在同一處，dry-run 與文件不會各說各話', () => {
    expect(RUNNER).toMatch(/a\)\s*B_TASKS=7;.*B_PROPOSALS=0/s);
    expect(RUNNER).toMatch(/b\)\s*B_TASKS=8;.*B_PROPOSALS=1/s);
  });

  it('State A 仍然是零提案 —— B 的提案不能滲進 A', () => {
    // reset 會清掉整個家庭，而故事層只在 state b 執行，所以 A 的提案數
    // 必然是 0。這條釘住的是「不要為了省事把故事層併進 demo_seed.sql」。
    expect(DEMO_SEED).not.toContain('create_child_proposal_v1');
    expect(DEMO_SEED).not.toContain('accept_child_proposal_plan_v1');
  });
});

// reset 清得掉 State B 的關鍵是「child_proposals 排在 tasks 之前」，
// 而那條已經由上面「P0-10A. reset 的刪除順序」釘住了 —— State B 只是讓那條
// 順序第一次真的有 canonical task 要清，不需要再寫一條一樣的斷言。
