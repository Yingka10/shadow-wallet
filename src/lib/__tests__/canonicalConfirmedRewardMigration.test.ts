import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const THIS_MIGRATION = join(MIGRATIONS, '20260821000000_canonical_confirmed_reward.sql');
const ORIGINALS = {
  transition: join(MIGRATIONS, '20260810000000_child_proposal_contract_v1.sql'),
  confirm: join(MIGRATIONS, '20260813000000_child_proposal_direct_confirm.sql'),
  accept: join(MIGRATIONS, '20260815000000_child_proposal_review_flow.sql'),
};

function readSql(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}

function functionBody(sql: string, signature: string): string {
  const start = sql.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('\n$$;', start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const sql = () => codeOnly(readSql(THIS_MIGRATION));

const SIGNATURES = {
  transition: 'CREATE OR REPLACE FUNCTION public.transition_child_proposal_v1(',
  confirm: 'CREATE OR REPLACE FUNCTION public.confirm_child_proposal_v1(',
  accept: 'CREATE OR REPLACE FUNCTION public.accept_child_proposal_plan_v1(',
};

describe('回應形狀只有一個來源', () => {
  it('helper 的每個值都從版本列讀，不重新推導', () => {
    const helper = functionBody(
      sql(),
      'CREATE OR REPLACE FUNCTION public.child_proposal_confirmed_reward_v1(',
    );

    expect(helper).toContain("'payoutBasis',         v.confirmed_payout_basis");
    expect(helper).toContain("'periodTargetCount',   v.confirmed_period_target_count");
    expect(helper).toContain('FROM child_proposal_plan_versions v');

    // 只要出現推導函式，這支 migration 就白做了。
    expect(helper).not.toContain('child_proposal_payout_basis');
    // 也不可以從 tasks 現況重讀 —— 快照要的是歷史事實，不是現況。
    expect(helper).not.toMatch(/FROM tasks\b/);
  });

  it('快照還沒成立時回 NULL，不回一包半成品', () => {
    const helper = functionBody(
      sql(),
      'CREATE OR REPLACE FUNCTION public.child_proposal_confirmed_reward_v1(',
    );
    expect(helper).toContain('CASE WHEN v.confirmed_at IS NULL THEN NULL');
  });

  it('三支函式都不再自己手寫 confirmedReward 的形狀', () => {
    // 手寫三份形狀正是「第一次與 replay 不一樣」的成因。
    expect(sql()).not.toMatch(/'confirmedReward',\s*jsonb_build_object/);
  });
});

describe('第一次成功 = replay = 快照', () => {
  it('transition 從剛寫好的版本列讀回來，不用區域變數', () => {
    const body = functionBody(sql(), SIGNATURES.transition);

    expect(body).toContain(
      "'confirmedReward', CASE WHEN v_to = 'active'\n      THEN public.child_proposal_confirmed_reward_v1(v_current_ver) END",
    );
    // v_payout_basis 仍然存在（快照複製與前置驗證要用），但不可以再進回應。
    const ret = body.slice(body.lastIndexOf('RETURN jsonb_build_object'));
    expect(ret).not.toContain('v_payout_basis');
    expect(ret).not.toContain('v_task.claim_period');
  });

  it('兩支 replay 分支改用同一支 helper', () => {
    const confirm = functionBody(sql(), SIGNATURES.confirm);
    const accept = functionBody(sql(), SIGNATURES.accept);

    expect(confirm).toContain(
      "'confirmedReward', public.child_proposal_confirmed_reward_v1(v_parent_plan.id),",
    );
    expect(accept).toContain(
      "'confirmedReward', public.child_proposal_confirmed_reward_v1(v_plan.id),",
    );
  });

  it('第一次成功仍然轉出上游的值 —— 上游修好就一起對了', () => {
    const confirm = functionBody(sql(), SIGNATURES.confirm);
    const accept = functionBody(sql(), SIGNATURES.accept);

    expect(confirm).toContain("'confirmedReward', v_transition_result -> 'confirmedReward',");
    expect(accept).toContain("'confirmedReward', v_transition_result -> 'confirmedReward',");
  });
});

describe('衍生的三支函式只換了回應，其餘逐字不變', () => {
  // 這一組是本輪最重要的測試。forward-derive 大型函式的風險就是
  // 「順手改到別的東西」—— 20260818 差點用這個手法把 P0-8G 的欄位清單洗回舊版。
  const cases: Array<[keyof typeof SIGNATURES, string[]]> = [
    [
      'transition',
      [
        'PERFORM public.assert_child_in_caller_family(v_child_id);',
        'IF NOT public.child_proposal_transition_allowed(v_from, v_to, v_actor) THEN',
        'confirmed_reward_policy         = COALESCE(confirmed_reward_policy, v_task.reward_policy),',
        'v_payout_basis := public.child_proposal_payout_basis(v_task.claim_period);',
      ],
    ],
    ['confirm', ['PERFORM public.assert_child_in_caller_family(']],
    ['accept', ['PERFORM public.assert_child_in_caller_family(']],
  ];

  it.each(cases)('%s 保留了原本的防線', (name, needles) => {
    const body = functionBody(sql(), SIGNATURES[name]);
    for (const needle of needles) {
      expect(body).toContain(needle);
    }
  });

  it.each(cases)('%s 與原始定義的差異只有 confirmedReward 那幾行', name => {
    const derived = functionBody(sql(), SIGNATURES[name]).split('\n');
    const original = functionBody(
      codeOnly(readSql(ORIGINALS[name])),
      SIGNATURES[name],
    ).split('\n');

    const removed = original.filter(l => !derived.includes(l));
    const added = derived.filter(l => !original.includes(l));

    // 被拿掉的行必須全部屬於舊的 confirmedReward 手寫區塊。
    for (const line of removed) {
      expect(line).toMatch(
        /confirmedReward|rewardPolicy|coinAmount|payoutBasis|claimPeriod|maxClaimsPerPeriod|rewardPolicyVersion|taskPolicyVersion|sourceTaskId|^\s*\) END$|^\s*\),$|reward_coin_amount END,/,
      );
    }
    // 新增的行必須全部是新的 helper 呼叫。
    for (const line of added) {
      expect(line).toMatch(/child_proposal_confirmed_reward_v1|confirmedReward|^\s*$/);
    }
  });
});

describe('已套用的 migration 保持不動', () => {
  it('不回頭改 20260818 / 20260819 / 20260820', () => {
    const raw = sql();
    expect(raw).not.toContain('FUNCTION public.complete_task');
    expect(raw).not.toContain('FUNCTION public.snapshot_canonical_payout_basis_v1');
    expect(raw).not.toContain('FUNCTION public.guard_confirmed_period_target_v1');
    expect(raw).not.toContain('ALTER TABLE tasks');
  });

  it('不 backfill 任何既有版本列', () => {
    expect(sql()).not.toMatch(
      /UPDATE\s+child_proposal_plan_versions[\s\S]{0,300}?SET[\s\S]{0,300}?confirmed_payout_basis\s*=/i,
    );
  });

  it('三支被衍生的函式在來源 migration 裡都只定義過一次', () => {
    // 這是本輪敢衍生的全部前提。哪天有人在別的 migration 再定義一次，
    // 這支 migration 就會默默把那次修改洗掉 —— 所以要在這裡先紅。
    const all = [
      '20260810000000_child_proposal_contract_v1.sql',
      '20260812000000_child_proposal_plan_structure.sql',
      '20260813000000_child_proposal_direct_confirm.sql',
      '20260815000000_child_proposal_review_flow.sql',
      '20260816000000_shared_plan_integrity_guard.sql',
      '20260817000000_shared_plan_preferred_time_adjustment.sql',
      '20260818000000_long_term_payout_settlement.sql',
      '20260819000000_snapshot_canonical_payout_basis.sql',
      '20260820000000_shared_plan_period_target_snapshot.sql',
    ]
      .map(f => readSql(join(MIGRATIONS, f)))
      .join('\n');

    for (const sig of Object.values(SIGNATURES)) {
      expect(all.split(sig).length - 1).toBe(1);
    }
  });
});
