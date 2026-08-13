#!/usr/bin/env node
/**
 * 重新產生 20260821000000_canonical_confirmed_reward.sql。
 *
 *   node supabase/scripts/derive_canonical_confirmed_reward.js [--check]
 *
 * 那支 migration 裡的三支函式是從原始 migration **衍生**出來的（PL/pgSQL 沒辦法
 * 只替換函式的一段，只能整支 CREATE OR REPLACE），但**沒有手抄** —— 三支加起來
 * 約 1000 行，手抄是這種改動最大的風險來源（20260818 差點用衍生法把 P0-8G 的
 * material 欄位清單洗回舊版）。
 *
 * 這支腳本從原始 migration 讀出函式原文，只做三處精確字串替換，任何一處沒命中
 * 就中止；並檢查衍生結果仍帶著授權、狀態機與快照複製那幾道防線。
 *
 * --check 只驗證重跑會產生一模一樣的檔案，不寫入。差異代表有人手改了那支
 * migration —— 那正是這支腳本要防的事。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const M = p => path.join(ROOT, 'supabase/migrations', p);
const TARGET = M('20260821000000_canonical_confirmed_reward.sql');

// 產出的檔案由「手寫的 header」＋「衍生的三支函式」＋ COMMIT 組成。
// header 直接從現有檔案取（第一支衍生函式之前的全部），所以它是唯一的手寫來源，
// 改 header 不必動這支腳本。
const FIRST_DERIVED = 'CREATE OR REPLACE FUNCTION public.transition_child_proposal_v1(p_command jsonb)';

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

function readFn(file, startsWith) {
  const src = read(file);
  const start = src.indexOf(startsWith);
  if (start < 0) throw new Error(`找不到函式起點: ${startsWith}`);
  const end = src.indexOf('\n$$;\n', start);
  if (end < 0) throw new Error(`找不到函式終點: ${startsWith}`);
  return src.slice(start, end + '\n$$;'.length + 1);
}

function replaceOnce(text, oldStr, newStr, label) {
  const n = text.split(oldStr).length - 1;
  if (n !== 1) throw new Error(`${label}: 預期命中 1 次，實際 ${n} 次`);
  return text.replace(oldStr, newStr);
}

let fnTransition = readFn(M('20260810000000_child_proposal_contract_v1.sql'), FIRST_DERIVED);
fnTransition = replaceOnce(
  fnTransition,
  `    -- 轉 active 時把快照原樣回傳，P0-5 可以直接比對它與 tasks 是否一致，
    -- 不必再查一次。非 active 的轉換這一鍵是 null。
    'confirmedReward', CASE WHEN v_to = 'active' THEN jsonb_build_object(
      'rewardPolicy',       v_task.reward_policy,
      'coinAmount',         CASE WHEN v_task.reward_policy = 'coin_eligible'
                                 THEN v_task.reward_coin_amount END,
      'payoutBasis',        v_payout_basis,
      'claimPeriod',        v_task.claim_period,
      'maxClaimsPerPeriod', v_task.max_claims_per_period,
      'rewardPolicyVersion', v_task.reward_policy_version,
      'taskPolicyVersion',  v_task.task_policy_version,
      'sourceTaskId',       v_task_id
    ) END`,
  `    -- 從**已經寫下去的版本列**讀回來，不是拿上面算好的區域變數再組一次。
    --
    -- 這是本 migration 的全部重點。payout semantics 由
    -- snapshot_canonical_payout_basis_v1 在 BEFORE trigger 裡以 tasks 為準覆寫，
    -- 而 v_payout_basis 是 claim_period 的推導值 —— long_term + fixed_days
    -- 兩者就會不一樣。回傳推導值等於「紀錄一套、回應另一套」。
    --
    -- P0-5 原本要的「不必再查一次 tasks 就能比對」仍然成立，而且更強：
    -- 現在比對的對象是實際被持久化的那一列。
    -- 非 active 的轉換這一鍵仍然是 null。
    'confirmedReward', CASE WHEN v_to = 'active'
      THEN public.child_proposal_confirmed_reward_v1(v_current_ver) END`,
  'transition RETURN',
);

let fnConfirm = readFn(
  M('20260813000000_child_proposal_direct_confirm.sql'),
  'CREATE OR REPLACE FUNCTION public.confirm_child_proposal_v1(p_command jsonb)',
);
fnConfirm = replaceOnce(
  fnConfirm,
  `        'confirmedReward', jsonb_build_object(
          'rewardPolicy', v_parent_plan.confirmed_reward_policy,
          'coinAmount', v_parent_plan.confirmed_coin_amount,
          'payoutBasis', v_parent_plan.confirmed_payout_basis,
          'claimPeriod', v_parent_plan.confirmed_claim_period,
          'maxClaimsPerPeriod', v_parent_plan.confirmed_max_claims_per_period,
          'rewardPolicyVersion', v_parent_plan.confirmed_reward_policy_version,
          'taskPolicyVersion', v_parent_plan.confirmed_task_policy_version,
          'sourceTaskId', v_parent_plan.confirmed_source_task_id
        ),`,
  `        -- 與第一次成功用同一支函式組同一個形狀。
        -- 原本這裡逐欄手寫，於是新增 periodTargetCount 之後 replay 的回應
        -- 就少一個鍵 —— 而 idempotent replay 存在的意義正是「重試拿到跟
        -- 第一次一樣的答案」。逐欄手寫兩份必然會分岔，這裡不再手寫。
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_parent_plan.id),`,
  'confirm replay',
);

let fnAccept = readFn(
  M('20260815000000_child_proposal_review_flow.sql'),
  'CREATE OR REPLACE FUNCTION public.accept_child_proposal_plan_v1(p_command jsonb)',
);
fnAccept = replaceOnce(
  fnAccept,
  `        'confirmedReward', jsonb_build_object(
          'rewardPolicy', v_plan.confirmed_reward_policy,
          'coinAmount', v_plan.confirmed_coin_amount,
          'payoutBasis', v_plan.confirmed_payout_basis,
          'claimPeriod', v_plan.confirmed_claim_period,
          'maxClaimsPerPeriod', v_plan.confirmed_max_claims_per_period,
          'rewardPolicyVersion', v_plan.confirmed_reward_policy_version,
          'taskPolicyVersion', v_plan.confirmed_task_policy_version,
          'sourceTaskId', v_plan.confirmed_source_task_id
        ),`,
  `        -- 同 confirm_child_proposal_v1 的 replay 分支：同一支函式、同一個形狀。
        'confirmedReward', public.child_proposal_confirmed_reward_v1(v_plan.id),`,
  'accept replay',
);

// 衍生結果必須仍然帶著原本的關鍵防線。少了任何一條就代表替換打到了不該打的地方。
const mustKeep = [
  [fnTransition, 'assert_child_in_caller_family', 'transition 掉了家庭邊界檢查'],
  [fnTransition, 'child_proposal_transition_allowed', 'transition 掉了狀態機檢查'],
  [fnTransition, 'confirmed_reward_policy         = COALESCE(', 'transition 掉了快照複製'],
  [fnConfirm, 'assert_child_in_caller_family', 'confirm 掉了家庭邊界檢查'],
  [fnAccept, 'assert_child_in_caller_family', 'accept 掉了家庭邊界檢查'],
];
for (const [text, needle, msg] of mustKeep) {
  if (!text.includes(needle)) throw new Error(`衍生檢查失敗：${msg}`);
}
for (const [name, text] of [
  ['transition', fnTransition],
  ['confirm', fnConfirm],
  ['accept', fnAccept],
]) {
  if (/'confirmedReward',\s*jsonb_build_object/.test(text)) {
    throw new Error(`衍生檢查失敗：${name} 仍有手寫的 confirmedReward`);
  }
}

const existing = read(TARGET);
const header = existing.slice(0, existing.indexOf(FIRST_DERIVED));
if (!header.includes('child_proposal_confirmed_reward_v1')) {
  throw new Error('header 取錯了：裡面沒有 helper 函式的定義');
}

const out = header + fnTransition + '\n\n' + fnConfirm + '\n\n' + fnAccept + '\nCOMMIT;\n';

if (process.argv.includes('--check')) {
  if (out !== existing) {
    console.error('FAIL：重新衍生的結果與檔案不一致 —— 那支 migration 被手改過。');
    process.exit(1);
  }
  console.log('OK：重新衍生的結果與檔案完全一致。');
} else {
  fs.writeFileSync(TARGET, out, 'utf8');
  console.log(`OK：已寫入 ${path.relative(ROOT, TARGET)}（${out.length} bytes）`);
}
