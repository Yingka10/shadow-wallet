// P0-2 — 孩子端的提案入口與導航
//
// 這一支釘住的是「Demo 使用者按到的是哪一條路」。
//
// 孩子端首頁原本那顆「＋ 新增任務」直接呼叫 createChildTask ——
// 那條路徑會**立刻**建立一筆正式任務、進今日任務、之後就會發幣，
// 完全繞過家長確認。P0-2 把入口換成提案流程，舊的那條關掉但沒刪。
//
// 這件事沒有測試的話，之後任何一次改版都可能把入口接回舊路徑，
// 而畫面看起來一模一樣。

import { readFileSync } from 'fs';
import { join } from 'path';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8').split(/\r\n/).join('\n');
}

const HOME = read('src', 'screens', 'child', 'HomeScreen.tsx');
const APP = read('App.tsx');
const SCREEN = read('src', 'screens', 'child', 'ChildProposalScreen.tsx');

/** 去掉註解 —— 「這個東西不存在」的斷言不能被說明文字命中。 */
function code(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// 入口走的是提案，不是任務
// ---------------------------------------------------------------------------

describe('孩子端首頁的入口', () => {
  it('入口導到 ChildProposal，而且帶著 childId', () => {
    expect(code(HOME)).toContain("navigation.navigate('ChildProposal', { childId })");
  });

  it('入口有 testID，Demo 與 QA 指得出來是哪一顆', () => {
    expect(code(HOME)).toContain('testID="child-proposal-entry"');
  });

  it('入口文字用孩子的語言，不是「新增任務」', () => {
    expect(code(HOME)).toContain('PROPOSAL_COPY.entry');
  });

  it('入口按下去不會呼叫 createChildTask', () => {
    // 入口那一段的 onPress 只做導航。
    const entry = code(HOME).slice(
      code(HOME).indexOf('testID="child-proposal-entry"'),
      code(HOME).indexOf('</TouchableOpacity>', code(HOME).indexOf('testID="child-proposal-entry"')),
    );
    expect(entry).not.toContain('createChildTask');
    expect(entry).not.toContain('openAddTask');
  });
});

// ---------------------------------------------------------------------------
// 舊路徑：保留但關閉
// ---------------------------------------------------------------------------

describe('legacy 直接建立任務的入口已關閉', () => {
  it('用一個看得見的旗標關掉，而不是默默刪掉', () => {
    expect(code(HOME)).toContain('const LEGACY_CHILD_TASK_ENTRY_ENABLED = false;');
  });

  it('舊的入口按鈕被旗標擋住', () => {
    expect(code(HOME)).toContain('{LEGACY_CHILD_TASK_ENTRY_ENABLED ? (');
  });

  it('舊的表單在旗標關閉時不會被打開', () => {
    expect(code(HOME)).toContain('visible={LEGACY_CHILD_TASK_ENTRY_ENABLED && addTaskVisible}');
  });

  it('createChildTask 本身沒有被刪除（其他路徑可能還要用）', () => {
    const actions = read('src', 'lib', 'taskActions.ts');
    expect(actions).toContain('export async function createChildTask');
  });

  it('關掉之後，孩子端沒有第二個會直接建立任務的入口', () => {
    // 整個 HomeScreen 只有一處呼叫 createChildTask（submitAddTask 裡面），
    // 而那個 handler 只被被旗標關掉的表單用到。
    const calls = code(HOME).match(/await createChildTask\(/g) ?? [];
    expect(calls.length).toBe(2); // temp / recurring 兩個分支，同一個被關掉的 handler
    expect(code(HOME).match(/onPress=\{openAddTask\}/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 導航註冊
// ---------------------------------------------------------------------------

describe('navigation', () => {
  it('ChildProposal 有註冊在 stack 上', () => {
    expect(code(APP)).toContain(
      '<Stack.Screen name="ChildProposal" component={ChildProposalScreen} />',
    );
  });

  it('route param 有型別，而且要求 childId', () => {
    expect(code(APP)).toContain('ChildProposal: { childId: string };');
  });

  it('只註冊一次（重複註冊會讓 navigate 行為不可預期）', () => {
    expect(code(APP).match(/name="ChildProposal"/g) ?? []).toHaveLength(1);
    expect(code(APP).match(/^\s*ChildProposal: \{ childId: string \};$/gm) ?? []).toHaveLength(1);
  });

  it('畫面有被 import', () => {
    expect(code(APP)).toContain(
      "import ChildProposalScreen from './src/screens/child/ChildProposalScreen';",
    );
    expect(code(APP).match(/import ChildProposalScreen/g) ?? []).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 提案畫面本身不碰任務與金流
// ---------------------------------------------------------------------------

describe('提案畫面的依賴邊界', () => {
  it('沒有 import taskActions', () => {
    expect(code(SCREEN)).not.toContain('taskActions');
    expect(code(SCREEN)).not.toContain('createChildTask');
  });

  it('沒有直接 import supabase client —— 一律透過 service', () => {
    expect(code(SCREEN)).not.toContain("from '../../lib/supabase'");
  });

  it('沒有任何 AI 呼叫（P0-3 才接）', () => {
    for (const term of ['aiAgent', 'analyzeTask', 'gemini', 'Gemini', 'taskAi']) {
      expect({ term, present: code(SCREEN).includes(term) })
        .toEqual({ term, present: false });
    }
  });

  it('用的是 P0-1 的 service，不是自己組 RPC', () => {
    expect(code(SCREEN)).toContain('SupabaseChildProposalService');
  });
});
