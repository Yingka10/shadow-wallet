// P1-A2 — provider 中立
//
// ─────────────────────────────────────────────────────────────────────────────
// 現在的 provider 是 Gemini。競賽 Demo 之前很可能換成付費 API，而換的時候
// **契約、持久化與孩子端畫面都不應該重做**。
//
// 做得到的唯一方法是：provider 專屬的東西只准住在 provider 那一層
// （Edge Function 的 transport）。所以這一支掃的是「不該出現的地方有沒有
// 出現」，而不是「該出現的地方有沒有出現」。
//
// 這種測試很容易被寫成一句空話，所以它掃的是真實檔案清單，而且包含
// 「型別看不出來」的東西：DB schema 與 UI 文案。
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');

/** provider / 廠商 / 模型專屬的字眼。大小寫不敏感。 */
const PROVIDER_MARKERS = [
  'gemini',
  'google',
  'openai',
  'anthropic',
  'claude',
  'gpt-',
  'vertex',
  'generativelanguage',
  'candidates',
];

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
}

/** 去掉註解 —— 註解裡解釋「這裡刻意不放 Gemini」正是我們要的說明。 */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return (
        !trimmed.startsWith('//')
        && !trimmed.startsWith('*')
        && !trimmed.startsWith('/*')
        && !trimmed.startsWith('--')
      );
    })
    .join('\n');
}

function expectNoProviderMarkers(label: string, source: string): void {
  const code = codeOnly(source).toLowerCase();
  for (const marker of PROVIDER_MARKERS) {
    expect({ label, marker, present: code.includes(marker) })
      .toEqual({ label, marker, present: false });
  }
}

// ---------------------------------------------------------------------------

describe('planning 契約與 session 不認識任何 provider', () => {
  const files = readdirSync(join(ROOT, 'src', 'lib', 'childPlanning'))
    .filter((name) => name.endsWith('.ts'))
    // client 是**接線層**：它知道要打哪一支 Edge Function。那是它的工作。
    .filter((name) => name !== 'childGoalPlanningClient.ts');

  it.each(files)('%s', (name) => {
    expectNoProviderMarkers(name, read('src', 'lib', 'childPlanning', name));
  });

  // P1-A3 的 formal plan bridge 住在子目錄，上面那個 glob 掃不到它。
  const bridgeFiles = readdirSync(join(ROOT, 'src', 'lib', 'childPlanning', 'formalPlan'))
    .filter((name) => name.endsWith('.ts'));

  it.each(bridgeFiles)('formalPlan/%s', (name) => {
    expectNoProviderMarkers(name, read('src', 'lib', 'childPlanning', 'formalPlan', name));
  });

  it('連 client 也只認識「ai-proxy」這個 Function 名稱，不認識模型', () => {
    const source = codeOnly(read('src', 'lib', 'childPlanning', 'childGoalPlanningClient.ts'));
    expect(source).toContain("AI_PROXY_FUNCTION_NAME = 'ai-proxy'");
    // 它可以知道要打哪一支 Function，但不可以知道那支 Function 用誰的模型。
    for (const marker of PROVIDER_MARKERS) {
      expect({ marker, present: source.toLowerCase().includes(marker) })
        .toEqual({ marker, present: false });
    }
  });
});

describe('持久化不認識任何 provider', () => {
  it('planning session 的 schema', () => {
    expectNoProviderMarkers(
      'migration',
      read('supabase', 'migrations', '20260822000000_child_goal_planning_sessions.sql'),
    );
  });

  it('正式 Plan Bridge 的 schema', () => {
    expectNoProviderMarkers(
      'bridge migration',
      read('supabase', 'migrations', '20260825000000_child_confirmed_plan_bridge.sql'),
    );
  });

  it('存的是驗證過的契約結果，不是 provider 的回應本體', () => {
    const sql = read('supabase', 'migrations', '20260822000000_child_goal_planning_sessions.sql');
    // model 名稱**可以**留在計畫的 jsonb 裡（那是稽核資訊），
    // 但不可以有一個欄位叫「原始回應」。
    expect(sql).not.toMatch(/raw_response|provider_response|model_response/i);
  });
});

describe('孩子端畫面不認識任何 provider', () => {
  it.each([
    ['ChildGoalPlanningFlow.tsx', ['src', 'screens', 'child', 'childProposal', 'ChildGoalPlanningFlow.tsx']],
    ['toPlanningRequest.ts', ['src', 'screens', 'child', 'childProposal', 'toPlanningRequest.ts']],
    ['copy.ts', ['src', 'screens', 'child', 'childProposal', 'copy.ts']],
    ['ChildProposalScreen.tsx', ['src', 'screens', 'child', 'ChildProposalScreen.tsx']],
  ])('%s', (label, parts) => {
    expectNoProviderMarkers(label, read(...parts));
  });

  it('文案裡也沒有「AI」這兩個字 —— 孩子看到的是 GrowBook', () => {
    const copy = read('src', 'screens', 'child', 'childProposal', 'copy.ts');
    const planning = /export const PLANNING_COPY = \{[\s\S]*?\n\} as const;/.exec(copy)?.[0] ?? '';
    expect(planning.length).toBeGreaterThan(0);
    const strings = planning.match(/'[^']*'/g) ?? [];
    for (const value of strings) {
      expect({ value, mentionsAi: /\bAI\b/.test(value) }).toEqual({ value, mentionsAi: false });
    }
  });
});

describe('接線層沒有把 provider 概念漏進來', () => {
  it('adapter 只搬運欄位，不知道模型是誰', () => {
    const source = read('src', 'screens', 'child', 'childProposal', 'toPlanningRequest.ts');
    // 兩個 lib 因此都不知道對方存在，也都不知道 provider 是誰。
    expect(source).toContain('lib/childPlanning');
    expect(source).toContain('lib/childProposal/types');
    expectNoProviderMarkers('toPlanningRequest', source);
  });
});
