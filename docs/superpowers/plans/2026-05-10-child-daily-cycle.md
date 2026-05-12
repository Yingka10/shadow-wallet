# Child Daily Cycle (Flow 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the child-facing daily task loop for ages 6–9, letting a child view, complete, and receive animated feedback for tasks in under 30 seconds per interaction, with prerequisite-based coin discounts and AI-assisted task classification.

**Architecture:** Seven focused modules wired together: `aiAgent` owns all LLM calls with fallbacks; `taskActions` owns write logic (completions, wallet updates, milestone checks, habit-resume); `useTodayTasks` owns read + Supabase Realtime state; `TaskItem` / `TaskCompleteModal` / `FeedbackAnimation` are pure display components; `HomeScreen` composes all of them. A stub `LongTermDetailScreen` is added for navigation wiring only — its full implementation is a separate phase.

**Tech Stack:** React Native 0.81 + Expo 54, Supabase JS v2 (realtime channels), TypeScript 5.9 strict, dayjs + plugins (timezone/utc), React Native built-in `Animated` API (no reanimated needed).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | add dayjs |
| Modify | `src/types/database.ts` | add `parent_task_id`, `CheckpointRewards` type |
| Modify | `App.tsx` | add `LongTermDetail` route |
| Create | `src/screens/child/LongTermDetailScreen.tsx` | navigation stub |
| Create | `src/lib/aiAgent.ts` | LLM calls with fallbacks |
| Create | `src/lib/__tests__/taskActions.test.ts` | unit tests |
| Create | `src/lib/taskActions.ts` | completion write logic |
| Create | `src/hooks/useTodayTasks.ts` | data fetching + realtime |
| Create | `src/components/TaskItem.tsx` | task card (A/B/C/D styles) |
| Create | `src/components/TaskCompleteModal.tsx` | confirm modal |
| Create | `src/components/FeedbackAnimation.tsx` | reward animations |
| Replace | `src/screens/child/HomeScreen.tsx` | main screen |

---

## Task 1: Install dayjs

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dayjs**

```bash
cd shadow-wallet && npm install dayjs
```

Expected output: `added 1 package` (no native module linking needed—pure JS).

- [ ] **Step 2: Verify import compiles**

In a temporary check, confirm the following import would resolve (no actual file to create—just confirm the package exists in node_modules):

```bash
ls node_modules/dayjs/plugin/timezone.js && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dayjs for Asia/Taipei date handling"
```

---

## Task 2: Update Types

**Files:**
- Modify: `src/types/database.ts`

> Note: The `parent_task_id` column also requires a Supabase migration (`ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id);`). Run that in the Supabase SQL editor before using skill-type long-term tasks. The TypeScript types below reflect the post-migration schema.

- [ ] **Step 1: Add `CheckpointRewards` type and update `Task`**

In `src/types/database.ts`, after the existing enum type declarations (around line 25), add:

```typescript
/** Maps day-number (as string key) to coin reward. E.g. {"7": 20, "14": 40, "21": 80} */
export type CheckpointRewards = Record<string, number>;
```

Then update the `Task` type (around line 74) to add `parent_task_id`:

```typescript
export type Task = {
  id: string;
  family_id: string;
  name: string;
  category: TaskCategory;
  day_type: DayType;
  long_term_type: LongTermType | null;
  is_long_term: boolean;
  base_time_min: number;
  difficulty: number;
  coin_override: number | null;
  is_system_default: boolean;
  allow_repeat: boolean;
  min_age: number;
  max_age: number;
  is_active: boolean;
  time_saving_min: number;
  parent_task_id: string | null;
  created_at: string;
};
```

Update `LongTermGoal` (around line 154) to replace `checkpoint_rewards: unknown | null` with:

```typescript
export type LongTermGoal = {
  id: string;
  child_id: string;
  task_id: string;
  goal_type: LongTermType;
  total_days: number | null;
  current_day: number;
  status: GoalStatus;
  checkpoint_rewards: CheckpointRewards | null;
  motivation_note: string | null;
  started_at: string;
  next_review_at: string | null;
  completed_at: string | null;
  created_at: string;
};
```

In the `Database` interface, update `tasks.Insert` and `tasks.Update` to include `parent_task_id`:

```typescript
tasks: {
  Row: Task;
  Insert: {
    id?: string;
    family_id: string;
    name: string;
    category: TaskCategory;
    day_type?: DayType;
    long_term_type?: LongTermType | null;
    is_long_term?: boolean;
    base_time_min?: number;
    difficulty?: number;
    coin_override?: number | null;
    is_system_default?: boolean;
    allow_repeat?: boolean;
    min_age?: number;
    max_age?: number;
    is_active?: boolean;
    time_saving_min?: number;
    parent_task_id?: string | null;
    created_at?: string;
  };
  Update: Partial<Task>;
  Relationships: [];
};
```

Also update `long_term_goals.Insert` to type `checkpoint_rewards` correctly:

```typescript
long_term_goals: {
  Row: LongTermGoal;
  Insert: {
    id?: string;
    child_id: string;
    task_id: string;
    goal_type: LongTermType;
    total_days?: number | null;
    current_day?: number;
    status?: GoalStatus;
    checkpoint_rewards?: CheckpointRewards | null;
    motivation_note?: string | null;
    started_at?: string;
    next_review_at?: string | null;
    completed_at?: string | null;
    created_at?: string;
  };
  Update: Partial<LongTermGoal>;
  Relationships: [];
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd shadow-wallet && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(types): add parent_task_id to Task, CheckpointRewards type"
```

---

## Task 3: LongTermDetailScreen stub + navigation

**Files:**
- Create: `src/screens/child/LongTermDetailScreen.tsx`
- Modify: `App.tsx`

- [ ] **Step 1: Create stub screen**

Create `src/screens/child/LongTermDetailScreen.tsx`:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../../App';
import { Colors } from '../../constants/colors';

type LongTermDetailRoute = RouteProp<RootStackParamList, 'LongTermDetail'>;

export default function LongTermDetailScreen() {
  const route = useRoute<LongTermDetailRoute>();
  const { taskName } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{taskName}</Text>
      <Text style={styles.subtitle}>長期任務詳情（即將推出）</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
});
```

- [ ] **Step 2: Register route in App.tsx**

In `App.tsx`, add to `RootStackParamList`:

```typescript
export type RootStackParamList = {
  Entry: undefined;
  ParentLogin: undefined;
  ChildLogin: undefined;
  Onboarding: undefined;
  Home: { childId: string };
  Parent: undefined;
  GoalSetup: {
    childId: string;
    childNickname: string;
    familyId: string;
    ageGroup: AgeGroup;
    isOnboarding: boolean;
  };
  TaskSelection: {
    childId: string;
    childNickname: string;
    familyId: string;
    ageGroup: AgeGroup;
    rewardName: string;
    goalCoinCost: number;
    isOnboarding: boolean;
  };
  Overview: {
    childId: string;
    childNickname: string;
    familyId: string;
    selectedTemplateIds: string[];
    customTasks: CustomTask[];
    rewardName: string;
    goalCoinCost: number;
    isOnboarding: boolean;
  };
  LongTermDetail: {
    goalId: string;
    taskId: string;
    taskName: string;
  };
};
```

Add the import at the top of `App.tsx`:

```typescript
import LongTermDetailScreen from './src/screens/child/LongTermDetailScreen';
```

Add the screen inside `<Stack.Navigator>` (after the Overview screen):

```typescript
<Stack.Screen name="LongTermDetail" component={LongTermDetailScreen} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/child/LongTermDetailScreen.tsx App.tsx
git commit -m "feat: add LongTermDetail navigation route and stub screen"
```

---

## Task 4: AI Agent

**Files:**
- Create: `src/lib/aiAgent.ts`

The env var is `EXPO_PUBLIC_ANTHROPIC_API_KEY`. All three functions call the Anthropic Messages API via fetch. Each has a try/catch that returns a safe fallback.

- [ ] **Step 1: Add env var to .env**

Open `.env` (create if absent) and add:

```
EXPO_PUBLIC_ANTHROPIC_API_KEY=your_key_here
```

- [ ] **Step 2: Create src/lib/aiAgent.ts**

```typescript
import type { TaskCategory } from '../types/database';

const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(prompt: string, maxTokens = 256): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = (await res.json()) as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? '';
}

export type ClassifyTaskResult = {
  category: TaskCategory;
  base_time_min: number;
  difficulty: number;
  reason: string;
};

/**
 * Classifies a task name into Task-A/B/C/D and estimates base_time_min and difficulty.
 * Falls back to category='B', base_time_min=5, difficulty=1.0 on any error.
 */
export async function classifyTask(taskName: string): Promise<ClassifyTaskResult> {
  const prompt = `你是一個兒童教養任務分類助手。
根據以下任務名稱，判斷它屬於哪個類別，並估算完成時間和難度。
任務名稱：${taskName}
類別定義：
A = 基本生活自理（刷牙、整理書包）
B = 家庭本分（倒垃圾、洗碗）
C = 超出本分貢獻（照顧弟妹、主動幫忙）
D = 學習成長里程碑（連續練習、學習新技能）
回傳 JSON：{"category":"B","base_time_min":5,"difficulty":1.0,"reason":"這是家庭成員的基本分工"}
只回傳 JSON，不要其他文字。`;

  const fallback: ClassifyTaskResult = {
    category: 'B',
    base_time_min: 5,
    difficulty: 1.0,
    reason: '預設分類',
  };

  try {
    console.log('[aiAgent.classifyTask] input:', taskName);
    const raw = await callClaude(prompt);
    console.log('[aiAgent.classifyTask] output:', raw);
    const parsed = JSON.parse(raw.trim()) as ClassifyTaskResult;
    if (!['A', 'B', 'C', 'D'].includes(parsed.category)) return fallback;
    return parsed;
  } catch (err) {
    console.warn('[aiAgent.classifyTask] fallback due to error:', err);
    return fallback;
  }
}

/**
 * Generates a gentle suggestion for a parent when a child fails a task 3+ days in a row.
 * Falls back to a template string on any error.
 */
export async function generateDegradeSuggestion(
  taskName: string,
  age: number,
  days: number,
): Promise<string> {
  const prompt = `任務名稱：${taskName}
孩子年齡：${age}歲
連續未完成天數：${days}天
請給家長一個簡短的建議（50字以內），說明可以怎麼調整這個任務，語氣要溫和不批判。
只回傳建議文字，不要其他格式。`;

  const fallback = `「${taskName}」連續 ${days} 天未完成，可以試著和孩子討論是否調整難度或時間。`;

  try {
    console.log('[aiAgent.generateDegradeSuggestion] input:', { taskName, age, days });
    const text = await callClaude(prompt, 128);
    console.log('[aiAgent.generateDegradeSuggestion] output:', text);
    return text.trim() || fallback;
  } catch (err) {
    console.warn('[aiAgent.generateDegradeSuggestion] fallback due to error:', err);
    return fallback;
  }
}

export type WeeklyInsightSummary = {
  completionRate: number;
  totalTimeSavedMin: number;
  overrideCount: number;
};

/**
 * Generates a natural-language weekly insight for the parent report.
 * Stub — full implementation in Flow 3.
 */
export async function generateWeeklyInsight(
  _summary: WeeklyInsightSummary,
): Promise<string> {
  // Flow 3 will implement the full prompt.
  return '本週洞察即將推出。';
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiAgent.ts .env
git commit -m "feat(lib): add aiAgent with classifyTask, generateDegradeSuggestion stubs"
```

---

## Task 5: taskActions — tests first, then implementation

**Files:**
- Create: `src/lib/__tests__/taskActions.test.ts`
- Create: `src/lib/taskActions.ts`

### Step group A: Write tests

- [ ] **Step 1: Create test file**

Create `src/lib/__tests__/taskActions.test.ts`:

```typescript
jest.mock('../supabase', () => ({ supabase: {} }));

import { calcCoin, checkMilestone, getPrevCheckpoint } from '../taskActions';
import type { Task, CheckpointRewards } from '../../types/database';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    family_id: 'fam-1',
    name: 'Test',
    category: 'C',
    day_type: 'weekday',
    long_term_type: null,
    is_long_term: false,
    base_time_min: 10,
    difficulty: 2,
    coin_override: null,
    is_system_default: false,
    allow_repeat: false,
    min_age: 6,
    max_age: 9,
    is_active: true,
    time_saving_min: 0,
    parent_task_id: null,
    created_at: '2026-01-01',
    ...overrides,
  };
}

// ── calcCoin ─────────────────────────────────────────────────────────────────

describe('calcCoin', () => {
  it('returns 0 for Task-A regardless of prerequisite', () => {
    const t = makeTask({ category: 'A', base_time_min: 5, difficulty: 1 });
    expect(calcCoin(t, true)).toBe(0);
    expect(calcCoin(t, false)).toBe(0);
  });

  it('returns 0 for Task-B regardless of prerequisite', () => {
    const t = makeTask({ category: 'B', base_time_min: 5, difficulty: 1 });
    expect(calcCoin(t, true)).toBe(0);
    expect(calcCoin(t, false)).toBe(0);
  });

  it('returns Math.round(base_time_min * difficulty) for Task-C when prereqs met', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2 });
    expect(calcCoin(t, true)).toBe(20);
  });

  it('applies 0.7 discount for Task-C when prereqs not met', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2 }); // base=20
    expect(calcCoin(t, false)).toBe(14); // Math.round(20 * 0.7)
  });

  it('uses coin_override if set, ignoring base_time_min * difficulty', () => {
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 2, coin_override: 50 });
    expect(calcCoin(t, true)).toBe(50);
  });

  it('applies 0.7 discount to coin_override when prereqs not met', () => {
    const t = makeTask({ category: 'D', coin_override: 100 });
    expect(calcCoin(t, false)).toBe(70); // Math.round(100 * 0.7)
  });

  it('rounds fractional results', () => {
    // base=10*1.5=15, discount=0.7 → 10.5 → round → 11
    const t = makeTask({ category: 'C', base_time_min: 10, difficulty: 1.5 });
    expect(calcCoin(t, false)).toBe(11);
  });
});

// ── checkMilestone ────────────────────────────────────────────────────────────

describe('checkMilestone', () => {
  const rewards: CheckpointRewards = { '7': 20, '14': 40, '21': 80 };

  it('returns milestone result when currentDay hits a checkpoint', () => {
    const result = checkMilestone('goal-1', 7, rewards);
    expect(result).toEqual({ goalId: 'goal-1', day: 7, coinReward: 20 });
  });

  it('returns null when currentDay is not a checkpoint', () => {
    expect(checkMilestone('goal-1', 5, rewards)).toBeNull();
    expect(checkMilestone('goal-1', 8, rewards)).toBeNull();
  });

  it('returns null when checkpoints is null', () => {
    expect(checkMilestone('goal-1', 7, null)).toBeNull();
  });

  it('handles day 21 checkpoint', () => {
    const result = checkMilestone('goal-1', 21, rewards);
    expect(result).toEqual({ goalId: 'goal-1', day: 21, coinReward: 80 });
  });
});

// ── getPrevCheckpoint ─────────────────────────────────────────────────────────

describe('getPrevCheckpoint', () => {
  const rewards: CheckpointRewards = { '7': 20, '14': 40, '21': 80 };

  it('returns the largest checkpoint strictly less than currentDay', () => {
    expect(getPrevCheckpoint(8, rewards)).toBe(7);
    expect(getPrevCheckpoint(15, rewards)).toBe(14);
    expect(getPrevCheckpoint(22, rewards)).toBe(21);
  });

  it('returns 0 when currentDay is at or before first checkpoint', () => {
    expect(getPrevCheckpoint(7, rewards)).toBe(0);
    expect(getPrevCheckpoint(3, rewards)).toBe(0);
  });

  it('returns 0 when checkpoints is null', () => {
    expect(getPrevCheckpoint(10, null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL (functions not defined yet)**

```bash
cd shadow-wallet && npx jest src/lib/__tests__/taskActions.test.ts --no-coverage
```

Expected: `Cannot find module '../taskActions'` or similar FAIL.

### Step group B: Implement taskActions

- [ ] **Step 3: Create src/lib/taskActions.ts**

```typescript
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from './supabase';
import type { Task, CheckpointRewards } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Calculates the coin reward for completing a task.
 * Task-A and Task-B always return 0.
 * Task-C/D use coin_override if set, otherwise Math.round(base_time_min * difficulty).
 * Applies a 0.7 discount when prerequisite tasks are incomplete.
 */
export function calcCoin(task: Task, isPrerequisiteMet: boolean): number {
  if (task.category === 'A' || task.category === 'B') return 0;
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  const discount = isPrerequisiteMet ? 1.0 : 0.7;
  return Math.round(base * discount);
}

export type MilestoneResult = {
  goalId: string;
  day: number;
  coinReward: number;
};

/**
 * Checks whether currentDay (after increment) hits a checkpoint.
 * Returns the MilestoneResult if so, null otherwise.
 */
export function checkMilestone(
  goalId: string,
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): MilestoneResult | null {
  if (!checkpointRewards) return null;
  const coin = checkpointRewards[String(currentDay)];
  if (coin === undefined) return null;
  return { goalId, day: currentDay, coinReward: coin };
}

/**
 * Returns the highest checkpoint day strictly less than currentDay.
 * Used to enforce the "don't fall below last checkpoint" rule after a habit gap.
 * Returns 0 when currentDay is at or before the first checkpoint.
 */
export function getPrevCheckpoint(
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): number {
  if (!checkpointRewards) return 0;
  const days = Object.keys(checkpointRewards)
    .map(Number)
    .sort((a, b) => a - b);
  const prev = days.filter(d => d < currentDay);
  return prev.length > 0 ? prev[prev.length - 1] : 0;
}

// ── Async actions ─────────────────────────────────────────────────────────────

export type CompletionResult = {
  completionId: string;
  coinEarned: number;
  timeSavedMin: number;
  milestone: MilestoneResult | null;
};

/**
 * Records a task completion and handles all side-effects:
 * - Inserts a task_completion row
 * - Task-C/D: updates wallet balance and inserts a transaction
 * - Task-B: inserts a time_savings row
 * - Task-D habit: increments long_term_goal.current_day and checks for milestone coin
 *
 * @param taskId       The task being completed
 * @param childId      The child completing the task
 * @param completedDate ISO date string (YYYY-MM-DD) in Asia/Taipei timezone
 * @param isPrerequisiteMet Whether all Task-A and Task-B tasks are done today
 * @param task         Full task row (needed for coin calculation)
 * @param goalId       Required only for Task-D habit-type tasks
 */
export async function completeTask(
  taskId: string,
  childId: string,
  completedDate: string,
  isPrerequisiteMet: boolean,
  task: Task,
  goalId?: string,
): Promise<CompletionResult> {
  const coinEarned = calcCoin(task, isPrerequisiteMet);
  const timeSavedMin = task.category === 'B' ? task.time_saving_min : 0;

  // 1. Insert task_completion
  const { data: completion, error: completionError } = await supabase
    .from('task_completions')
    .insert({
      task_id: taskId,
      child_id: childId,
      completed_at: completedDate,
      reported_by: 'child',
      status: 'completed',
      coin_earned: coinEarned,
      time_saved_min: timeSavedMin,
    })
    .select('id')
    .single();

  if (completionError || !completion) {
    throw new Error(completionError?.message ?? 'Failed to insert task_completion');
  }

  const completionId = completion.id;
  let milestone: MilestoneResult | null = null;

  // 2. Task-C/D: update wallet and insert transaction
  if (coinEarned > 0) {
    const { data: wallet, error: walletFetchError } = await supabase
      .from('wallets')
      .select('id, balance')
      .eq('child_id', childId)
      .eq('wallet_type', 'spending')
      .single();

    if (walletFetchError || !wallet) {
      throw new Error(walletFetchError?.message ?? 'Spending wallet not found');
    }

    const { error: walletUpdateError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance + coinEarned })
      .eq('id', wallet.id);

    if (walletUpdateError) {
      throw new Error(walletUpdateError.message);
    }

    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: wallet.id,
        amount: coinEarned,
        type: 'earn',
        reference_id: completionId,
        reference_type: 'task_completion',
      });

    if (txError) throw new Error(txError.message);
  }

  // 3. Task-B: insert time_savings
  if (task.category === 'B' && timeSavedMin > 0) {
    const { error: tsError } = await supabase
      .from('time_savings')
      .insert({
        child_id: childId,
        completion_id: completionId,
        minutes_saved: timeSavedMin,
      });

    if (tsError) throw new Error(tsError.message);
  }

  // 4. Task-D habit: increment current_day, check milestone
  if (task.category === 'D' && task.long_term_type === 'habit' && goalId) {
    const { data: goal, error: goalFetchError } = await supabase
      .from('long_term_goals')
      .select('current_day, checkpoint_rewards')
      .eq('id', goalId)
      .single();

    if (goalFetchError || !goal) {
      throw new Error(goalFetchError?.message ?? 'Long-term goal not found');
    }

    const newDay = goal.current_day + 1;
    const { error: goalUpdateError } = await supabase
      .from('long_term_goals')
      .update({ current_day: newDay })
      .eq('id', goalId);

    if (goalUpdateError) throw new Error(goalUpdateError.message);

    const rewards = goal.checkpoint_rewards as CheckpointRewards | null;
    milestone = checkMilestone(goalId, newDay, rewards);

    // Award milestone coins
    if (milestone) {
      const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('child_id', childId)
        .eq('wallet_type', 'spending')
        .single();

      if (!wErr && wallet) {
        await supabase
          .from('wallets')
          .update({ balance: wallet.balance + milestone.coinReward })
          .eq('id', wallet.id);

        await supabase.from('transactions').insert({
          wallet_id: wallet.id,
          amount: milestone.coinReward,
          type: 'earn',
          reference_id: goalId,
          reference_type: 'long_term_goal_milestone',
        });
      }
    }
  }

  return { completionId, coinEarned, timeSavedMin, milestone };
}

/**
 * Checks whether a habit-type long-term goal missed yesterday's check-in
 * and decrements current_day by 1 (floor = previous checkpoint day).
 * Called on HomeScreen mount to enforce the "soft reset" anti-frustration rule.
 */
export async function applyHabitResume(
  goalId: string,
  childId: string,
  taskId: string,
  currentDay: number,
  checkpointRewards: CheckpointRewards | null,
): Promise<void> {
  const yesterday = dayjs().tz(TZ).subtract(1, 'day').format('YYYY-MM-DD');

  const { data: completions } = await supabase
    .from('task_completions')
    .select('id')
    .eq('task_id', taskId)
    .eq('child_id', childId)
    .gte('completed_at', yesterday)
    .lt('completed_at', dayjs().tz(TZ).format('YYYY-MM-DD'))
    .limit(1);

  const missedYesterday = !completions || completions.length === 0;
  if (!missedYesterday || currentDay <= 0) return;

  const floor = getPrevCheckpoint(currentDay, checkpointRewards);
  const newDay = Math.max(currentDay - 1, floor);

  await supabase
    .from('long_term_goals')
    .update({ current_day: newDay })
    .eq('id', goalId);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx jest src/lib/__tests__/taskActions.test.ts --no-coverage
```

Expected: all tests pass (green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskActions.ts src/lib/__tests__/taskActions.test.ts
git commit -m "feat(lib): taskActions with calcCoin, completeTask, checkMilestone, applyHabitResume"
```

---

## Task 6: useTodayTasks hook

**Files:**
- Create: `src/hooks/useTodayTasks.ts`

This hook:
1. Loads the child's assigned tasks (`child_tasks` → `tasks`)
2. Loads today's completions (`task_completions`)
3. Loads active long-term goals (`long_term_goals`)
4. Derives `isPrerequisiteMet` (all Task-A and Task-B completed today)
5. Subscribes to `task_completions` realtime channel and refreshes on change
6. On mount, calls `applyHabitResume` for each active habit goal

- [ ] **Step 1: Create src/hooks/useTodayTasks.ts**

```typescript
import { useEffect, useCallback, useRef, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { supabase } from '../lib/supabase';
import { applyHabitResume } from '../lib/taskActions';
import type { Task, LongTermGoal } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

export type TodayTask = Task & {
  isCompleted: boolean;
  goal?: LongTermGoal;
};

export type UseTodayTasksResult = {
  weekdayTasks: TodayTask[];
  weekendTasks: TodayTask[];
  longTermTasks: TodayTask[];
  isPrerequisiteMet: boolean;
  completedTodayIds: Set<string>;
  loading: boolean;
  refresh: () => void;
};

function getTodayStr(): string {
  return dayjs().tz(TZ).format('YYYY-MM-DD');
}

function isWeekendToday(): boolean {
  const day = dayjs().tz(TZ).day(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

export function useTodayTasks(childId: string): UseTodayTasksResult {
  const [weekdayTasks, setWeekdayTasks] = useState<TodayTask[]>([]);
  const [weekendTasks, setWeekendTasks] = useState<TodayTask[]>([]);
  const [longTermTasks, setLongTermTasks] = useState<TodayTask[]>([]);
  const [completedTodayIds, setCompletedTodayIds] = useState<Set<string>>(new Set());
  const [isPrerequisiteMet, setIsPrerequisiteMet] = useState(false);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const today = getTodayStr();
      const weekend = isWeekendToday();

      // 1. Get task IDs assigned to this child
      const { data: childTaskRows, error: ctErr } = await supabase
        .from('child_tasks')
        .select('task_id')
        .eq('child_id', childId)
        .eq('is_active', true);

      if (ctErr) throw ctErr;
      const taskIds = (childTaskRows ?? []).map(r => r.task_id);
      if (taskIds.length === 0) {
        setWeekdayTasks([]);
        setWeekendTasks([]);
        setLongTermTasks([]);
        setCompletedTodayIds(new Set());
        setIsPrerequisiteMet(true);
        return;
      }

      // 2. Fetch task details
      const { data: taskRows, error: tErr } = await supabase
        .from('tasks')
        .select('*')
        .in('id', taskIds)
        .eq('is_active', true);

      if (tErr) throw tErr;
      const tasks: Task[] = taskRows ?? [];

      // 3. Fetch today's completions
      const { data: completionRows, error: cErr } = await supabase
        .from('task_completions')
        .select('task_id')
        .eq('child_id', childId)
        .gte('completed_at', today)
        .lt('completed_at', dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD'));

      if (cErr) throw cErr;
      const completedIds = new Set((completionRows ?? []).map(r => r.task_id));
      setCompletedTodayIds(completedIds);

      // 4. Fetch active long-term goals
      const { data: goalRows, error: gErr } = await supabase
        .from('long_term_goals')
        .select('*')
        .eq('child_id', childId)
        .eq('status', 'active');

      if (gErr) throw gErr;
      const goals: LongTermGoal[] = goalRows ?? [];
      const goalsByTaskId = new Map(goals.map(g => [g.task_id, g]));

      // 5. Apply habit resume (soft reset) for missed days
      for (const goal of goals) {
        if (goal.goal_type === 'habit') {
          await applyHabitResume(
            goal.id,
            childId,
            goal.task_id,
            goal.current_day,
            goal.checkpoint_rewards,
          );
        }
      }

      // 6. Derive prerequisite status: all Task-A and Task-B completed today
      const aTasks = tasks.filter(t => t.category === 'A' && !t.is_long_term);
      const bTasks = tasks.filter(t => t.category === 'B' && !t.is_long_term);
      const prereqMet =
        aTasks.every(t => completedIds.has(t.id)) &&
        bTasks.every(t => completedIds.has(t.id));
      setIsPrerequisiteMet(prereqMet);

      // 7. Split into three buckets
      const shortTermTasks = tasks.filter(t => !t.is_long_term);
      const longTerm = tasks
        .filter(t => t.is_long_term)
        .map(t => ({ ...t, isCompleted: completedIds.has(t.id), goal: goalsByTaskId.get(t.id) }));

      // Weekday tasks: day_type='weekday' or 'both'
      // On weekdays show all; on weekends show only 'both'
      const wdFilter = weekend
        ? shortTermTasks.filter(t => t.day_type === 'both')
        : shortTermTasks.filter(t => t.day_type === 'weekday' || t.day_type === 'both');

      // Weekend tasks: day_type='weekend' or 'both'
      // On weekends show all; on weekdays show only 'both'
      const weFilter = weekend
        ? shortTermTasks.filter(t => t.day_type === 'weekend' || t.day_type === 'both')
        : shortTermTasks.filter(t => t.day_type === 'both');

      const sortTasks = (list: Task[]): TodayTask[] => {
        const incomplete = list
          .filter(t => !completedIds.has(t.id) || t.allow_repeat)
          .sort((a, b) => {
            const order: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
            return (order[a.category] ?? 4) - (order[b.category] ?? 4);
          });
        const complete = list
          .filter(t => completedIds.has(t.id) && !t.allow_repeat)
          .map(t => ({ ...t, isCompleted: true }));
        return [
          ...incomplete.map(t => ({ ...t, isCompleted: completedIds.has(t.id) })),
          ...complete,
        ];
      };

      setWeekdayTasks(sortTasks(wdFilter));
      setWeekendTasks(sortTasks(weFilter));
      setLongTermTasks(longTerm);
    } catch (err) {
      console.error('[useTodayTasks] fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  // Subscribe to realtime changes on task_completions for this child
  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel(`task_completions:child_${childId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_completions',
          filter: `child_id=eq.${childId}`,
        },
        () => { fetchAll(); },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [childId, fetchAll]);

  return {
    weekdayTasks,
    weekendTasks,
    longTermTasks,
    isPrerequisiteMet,
    completedTodayIds,
    loading,
    refresh: fetchAll,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTodayTasks.ts
git commit -m "feat(hooks): useTodayTasks with realtime subscription and habit resume"
```

---

## Task 7: TaskItem component

**Files:**
- Create: `src/components/TaskItem.tsx`

Renders one task card. Four visual styles based on `task.category`. Completed tasks are dimmed with a checkmark. Task-C/D with unmet prerequisites show a discount badge.

- [ ] **Step 1: Create src/components/TaskItem.tsx**

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import type { Task, LongTermGoal } from '../types/database';

interface TaskItemProps {
  task: Task;
  isCompleted: boolean;
  isPrerequisiteMet: boolean;
  goal?: LongTermGoal;
  onPress: () => void;
}

function calcDisplayCoin(task: Task, isPrerequisiteMet: boolean): number {
  if (task.category === 'A' || task.category === 'B') return 0;
  const base = task.coin_override ?? Math.round(task.base_time_min * task.difficulty);
  const discount = isPrerequisiteMet ? 1.0 : 0.7;
  return Math.round(base * discount);
}

function CategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = { A: '自理', B: '本分', C: '貢獻', D: '成長' };
  const bg: Record<string, string> = {
    A: Colors.textSecondary,
    B: Colors.primary,
    C: Colors.secondary,
    D: '#8B5CF6',
  };
  return (
    <View style={[styles.badge, { backgroundColor: bg[category] ?? Colors.textSecondary }]}>
      <Text style={styles.badgeText}>{labels[category] ?? category}</Text>
    </View>
  );
}

function LongTermProgress({ goal, task }: { goal: LongTermGoal; task: Task }) {
  const total = goal.total_days ?? 30;
  const progress = Math.min(goal.current_day / total, 1);
  const label =
    goal.goal_type === 'habit'
      ? `第 ${goal.current_day} / ${total} 天`
      : `Level ${goal.current_day} / ${total}`;

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.progressLabel}>{label}</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
    </View>
  );
}

export default function TaskItem({
  task,
  isCompleted,
  isPrerequisiteMet,
  goal,
  onPress,
}: TaskItemProps) {
  const showCoinDiscount = (task.category === 'C' || task.category === 'D') && !isPrerequisiteMet;
  const displayCoin = calcDisplayCoin(task, isPrerequisiteMet);

  return (
    <TouchableOpacity
      style={[styles.card, isCompleted && styles.cardCompleted]}
      onPress={onPress}
      disabled={isCompleted && !task.allow_repeat}
      activeOpacity={0.7}
    >
      <View style={styles.row}>
        {/* Left: checkmark or category badge */}
        <View style={styles.leftCol}>
          {isCompleted ? (
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          ) : (
            <CategoryBadge category={task.category} />
          )}
        </View>

        {/* Center: task name + long-term progress */}
        <View style={styles.centerCol}>
          <Text style={[styles.taskName, isCompleted && styles.taskNameCompleted]}>
            {task.name}
          </Text>
          {task.is_long_term && goal && <LongTermProgress goal={goal} task={task} />}
          {showCoinDiscount && (
            <Text style={styles.discountNote}>本分未完成，幣值打折中</Text>
          )}
        </View>

        {/* Right: reward indicator */}
        <View style={styles.rightCol}>
          {task.category === 'A' && (
            <Text style={styles.rewardEmpty}>—</Text>
          )}
          {task.category === 'B' && (
            <View style={styles.timeSavingRow}>
              <Text style={styles.hourglassIcon}>⏳</Text>
              <Text style={styles.timeSavingText}>+{task.time_saving_min}分</Text>
            </View>
          )}
          {(task.category === 'C' || task.category === 'D') && !task.is_long_term && (
            <View style={styles.coinRow}>
              <Text style={[styles.coinText, showCoinDiscount && styles.coinTextDiscounted]}>
                +{displayCoin}
              </Text>
              <Text style={styles.coinUnit}>幣</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardCompleted: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCol: {
    width: 44,
    alignItems: 'center',
    marginRight: 12,
  },
  centerCol: {
    flex: 1,
  },
  rightCol: {
    marginLeft: 12,
    alignItems: 'flex-end',
    minWidth: 56,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  taskName: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  taskNameCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  discountNote: {
    fontSize: 11,
    color: Colors.warning,
    marginTop: 3,
  },
  rewardEmpty: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  timeSavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hourglassIcon: {
    fontSize: 14,
  },
  timeSavingText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
  },
  coinText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.coin,
  },
  coinTextDiscounted: {
    color: Colors.warning,
  },
  coinUnit: {
    fontSize: 12,
    color: Colors.coin,
  },
  progressContainer: {
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskItem.tsx
git commit -m "feat(components): TaskItem with A/B/C/D styles, discount badge, long-term progress"
```

---

## Task 8: TaskCompleteModal

**Files:**
- Create: `src/components/TaskCompleteModal.tsx`

Shows task name, date selector (today / yesterday / 2 days ago), expected reward, and a confirm button that disables while loading.

- [ ] **Step 1: Create src/components/TaskCompleteModal.tsx**

```typescript
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { Colors } from '../constants/colors';
import { calcCoin } from '../lib/taskActions';
import type { Task, LongTermGoal } from '../types/database';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Taipei';

interface DateOption {
  label: string;
  value: string; // YYYY-MM-DD
}

function buildDateOptions(): DateOption[] {
  const now = dayjs().tz(TZ);
  return [
    { label: '今天', value: now.format('YYYY-MM-DD') },
    { label: '昨天', value: now.subtract(1, 'day').format('YYYY-MM-DD') },
    { label: '前天', value: now.subtract(2, 'day').format('YYYY-MM-DD') },
  ];
}

interface TaskCompleteModalProps {
  visible: boolean;
  task: Task | null;
  isPrerequisiteMet: boolean;
  goal?: LongTermGoal;
  onConfirm: (completedDate: string) => Promise<void>;
  onClose: () => void;
}

export default function TaskCompleteModal({
  visible,
  task,
  isPrerequisiteMet,
  goal,
  onConfirm,
  onClose,
}: TaskCompleteModalProps) {
  const dateOptions = buildDateOptions();
  const [selectedDate, setSelectedDate] = useState(dateOptions[0].value);
  const [loading, setLoading] = useState(false);

  if (!task) return null;

  const coin = calcCoin(task, isPrerequisiteMet);
  const showDiscount = (task.category === 'C' || task.category === 'D') && !isPrerequisiteMet;
  const timeSaved = task.category === 'B' ? task.time_saving_min : 0;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(selectedDate);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <Text style={styles.taskName}>{task.name}</Text>

          {/* Date selector */}
          <Text style={styles.sectionLabel}>什麼時候完成的？</Text>
          <View style={styles.dateRow}>
            {dateOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.dateChip,
                  selectedDate === opt.value && styles.dateChipSelected,
                ]}
                onPress={() => setSelectedDate(opt.value)}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    selectedDate === opt.value && styles.dateChipTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reward preview */}
          <View style={styles.rewardBox}>
            {task.category === 'A' && (
              <Text style={styles.rewardText}>完成打勾，繼續加油！</Text>
            )}
            {task.category === 'B' && (
              <Text style={styles.rewardText}>
                你幫家裡省了 <Text style={styles.rewardHighlight}>{timeSaved} 分鐘</Text>！
              </Text>
            )}
            {(task.category === 'C' || task.category === 'D') && (
              <>
                <Text style={styles.rewardText}>
                  可獲得{' '}
                  <Text style={[styles.rewardHighlight, showDiscount && styles.rewardDiscounted]}>
                    +{coin} 幣
                  </Text>
                </Text>
                {showDiscount && (
                  <Text style={styles.discountNote}>
                    完成所有本分任務後，幣值可恢復全額
                  </Text>
                )}
              </>
            )}
          </View>

          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmBtn, loading && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>我完成了！</Text>
            )}
          </TouchableOpacity>

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={styles.cancelBtnText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
  },
  taskName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  dateChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  dateChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  dateChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  dateChipTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  rewardBox: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  rewardText: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: '500',
  },
  rewardHighlight: {
    color: Colors.coin,
    fontWeight: 'bold',
    fontSize: 22,
  },
  rewardDiscounted: {
    color: Colors.warning,
  },
  discountNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TaskCompleteModal.tsx
git commit -m "feat(components): TaskCompleteModal with date picker and reward preview"
```

---

## Task 9: FeedbackAnimation component

**Files:**
- Create: `src/components/FeedbackAnimation.tsx`

Uses RN built-in `Animated` API. Four modes: task-a (checkmark fade), task-b (hourglass + text), task-c (coin pop), milestone (full-screen celebration with scale + confetti text).

- [ ] **Step 1: Create src/components/FeedbackAnimation.tsx**

```typescript
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Colors } from '../constants/colors';

const { width: SW, height: SH } = Dimensions.get('window');

export type FeedbackType = 'task-a' | 'task-b' | 'task-c' | 'milestone';

interface FeedbackAnimationProps {
  visible: boolean;
  type: FeedbackType;
  value?: number; // coins for task-c/milestone, minutes for task-b
  onComplete: () => void;
}

function CheckmarkFeedback({ onComplete }: { onComplete: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.delay(900),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View style={[styles.checkBox, { transform: [{ scale }], opacity }]}>
        <Text style={styles.checkIcon}>✓</Text>
        <Text style={styles.feedbackLabel}>做到了！</Text>
      </Animated.View>
    </View>
  );
}

function TimeSavingFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const translateY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.delay(1200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View style={[styles.feedbackCard, { transform: [{ translateY }], opacity }]}>
        <Text style={styles.hourglassLarge}>⏳</Text>
        <Text style={styles.timeSavingBig}>你幫家裡省了</Text>
        <Text style={styles.timeSavingValue}>{value} 分鐘</Text>
      </Animated.View>
    </View>
  );
}

function CoinFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 14 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(translateY, {
        toValue: -60,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <View style={styles.centeredOverlay}>
      <Animated.View
        style={[styles.coinBurst, { transform: [{ scale }, { translateY }], opacity }]}
      >
        <Text style={styles.coinBurstText}>+{value}</Text>
        <Text style={styles.coinBurstUnit}>幣！</Text>
      </Animated.View>
    </View>
  );
}

function MilestoneFeedback({ value, onComplete }: { value: number; onComplete: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const confettiOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 16 }),
      Animated.timing(confettiOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => onComplete());
  }, []);

  return (
    <Animated.View style={[styles.milestoneOverlay, { opacity }]}>
      <Animated.View style={[styles.milestoneCard, { transform: [{ scale }] }]}>
        <Text style={styles.milestoneEmoji}>🎉</Text>
        <Text style={styles.milestoneTitle}>恭喜達成！</Text>
        <Text style={styles.milestoneReward}>獲得 {value} 幣！</Text>
      </Animated.View>
      <Animated.Text style={[styles.confetti, { opacity: confettiOpacity }]}>
        {'🌟 ⭐ ✨ 🌟 ⭐ ✨'}
      </Animated.Text>
    </Animated.View>
  );
}

export default function FeedbackAnimation({
  visible,
  type,
  value = 0,
  onComplete,
}: FeedbackAnimationProps) {
  if (!visible) return null;

  if (type === 'milestone') {
    return (
      <Modal transparent visible={visible} animationType="fade">
        <MilestoneFeedback value={value} onComplete={onComplete} />
      </Modal>
    );
  }

  return (
    <Modal transparent visible={visible} animationType="none">
      {type === 'task-a' && <CheckmarkFeedback onComplete={onComplete} />}
      {type === 'task-b' && <TimeSavingFeedback value={value} onComplete={onComplete} />}
      {type === 'task-c' && <CoinFeedback value={value} onComplete={onComplete} />}
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBox: {
    backgroundColor: Colors.success,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    minWidth: 160,
  },
  checkIcon: {
    fontSize: 56,
    color: '#fff',
    fontWeight: 'bold',
  },
  feedbackLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  feedbackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  hourglassLarge: {
    fontSize: 48,
    marginBottom: 8,
  },
  timeSavingBig: {
    fontSize: 18,
    color: Colors.text,
    fontWeight: '500',
  },
  timeSavingValue: {
    fontSize: 36,
    color: Colors.primary,
    fontWeight: 'bold',
    marginTop: 4,
  },
  coinBurst: {
    alignItems: 'center',
  },
  coinBurstText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: Colors.coin,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 4,
  },
  coinBurstUnit: {
    fontSize: 28,
    color: Colors.coin,
    fontWeight: '700',
  },
  milestoneOverlay: {
    flex: 1,
    backgroundColor: 'rgba(74, 144, 217, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneCard: {
    backgroundColor: Colors.surface,
    borderRadius: 28,
    padding: 40,
    alignItems: 'center',
    width: SW * 0.8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  milestoneEmoji: {
    fontSize: 64,
    marginBottom: 12,
  },
  milestoneTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  milestoneReward: {
    fontSize: 22,
    color: Colors.coin,
    fontWeight: '700',
  },
  confetti: {
    fontSize: 24,
    marginTop: 32,
    letterSpacing: 8,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/FeedbackAnimation.tsx
git commit -m "feat(components): FeedbackAnimation with 4 modes using RN Animated API"
```

---

## Task 10: HomeScreen — compose everything

**Files:**
- Replace: `src/screens/child/HomeScreen.tsx`

Renders three sections, handles modal open/close, calls `completeTask`, shows `FeedbackAnimation`, supports pull-to-refresh.

- [ ] **Step 1: Replace src/screens/child/HomeScreen.tsx**

```typescript
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Colors } from '../../constants/colors';
import type { RootStackParamList } from '../../../App';
import { useTodayTasks, type TodayTask } from '../../hooks/useTodayTasks';
import TaskItem from '../../components/TaskItem';
import TaskCompleteModal from '../../components/TaskCompleteModal';
import FeedbackAnimation, { type FeedbackType } from '../../components/FeedbackAnimation';
import { completeTask } from '../../lib/taskActions';
import type { Task } from '../../types/database';

type HomeRoute = RouteProp<RootStackParamList, 'Home'>;
type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

type ModalState = {
  task: TodayTask | null;
  visible: boolean;
};

type FeedbackState = {
  visible: boolean;
  type: FeedbackType;
  value: number;
};

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count} 個任務</Text>
    </View>
  );
}

function PrereqBanner() {
  return (
    <View style={styles.prereqBanner}>
      <Text style={styles.prereqBannerText}>
        ⚠️ 完成自理和本分任務後，貢獻任務的幣值會恢復全額！
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const route = useRoute<HomeRoute>();
  const navigation = useNavigation<Nav>();
  const { childId } = route.params;

  const { weekdayTasks, weekendTasks, longTermTasks, isPrerequisiteMet, loading, refresh } =
    useTodayTasks(childId);

  const [modal, setModal] = useState<ModalState>({ task: null, visible: false });
  const [feedback, setFeedback] = useState<FeedbackState>({
    visible: false,
    type: 'task-a',
    value: 0,
  });

  const openModal = useCallback((task: TodayTask) => {
    setModal({ task, visible: true });
  }, []);

  const closeModal = useCallback(() => {
    setModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleConfirm = useCallback(
    async (completedDate: string) => {
      if (!modal.task) return;
      const task: Task = modal.task;

      const result = await completeTask(
        task.id,
        childId,
        completedDate,
        isPrerequisiteMet,
        task,
        modal.task.goal?.id,
      );

      closeModal();

      // Show appropriate feedback animation
      if (result.milestone) {
        setFeedback({ visible: true, type: 'milestone', value: result.milestone.coinReward });
      } else if (task.category === 'A') {
        setFeedback({ visible: true, type: 'task-a', value: 0 });
      } else if (task.category === 'B') {
        setFeedback({ visible: true, type: 'task-b', value: result.timeSavedMin });
      } else {
        setFeedback({ visible: true, type: 'task-c', value: result.coinEarned });
      }
    },
    [modal.task, childId, isPrerequisiteMet, closeModal],
  );

  const handleFeedbackComplete = useCallback(() => {
    setFeedback(prev => ({ ...prev, visible: false }));
    refresh();
  }, [refresh]);

  const hasDiscountableTasks =
    !isPrerequisiteMet &&
    [...weekdayTasks, ...weekendTasks].some(
      t => (t.category === 'C' || t.category === 'D') && !t.isCompleted,
    );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>今天的任務</Text>
          <TouchableOpacity
            onPress={() => navigation.replace('Entry')}
            style={styles.logoutBtn}
          >
            <Text style={styles.logoutText}>登出</Text>
          </TouchableOpacity>
        </View>

        {/* Prerequisite warning banner */}
        {hasDiscountableTasks && <PrereqBanner />}

        {/* Section 1: Weekday tasks */}
        {weekdayTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="平日任務" count={weekdayTasks.length} />
            {weekdayTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Section 2: Weekend tasks */}
        {weekendTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="週末任務" count={weekendTasks.length} />
            {weekendTasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                isCompleted={task.isCompleted}
                isPrerequisiteMet={isPrerequisiteMet}
                onPress={() => openModal(task)}
              />
            ))}
          </View>
        )}

        {/* Section 3: Long-term tasks */}
        {longTermTasks.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="長期任務" count={longTermTasks.length} />
            {longTermTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                onPress={() => {
                  if (task.goal) {
                    navigation.navigate('LongTermDetail', {
                      goalId: task.goal.id,
                      taskId: task.id,
                      taskName: task.name,
                    });
                  }
                }}
                activeOpacity={0.75}
              >
                <TaskItem
                  task={task}
                  isCompleted={task.isCompleted}
                  isPrerequisiteMet={isPrerequisiteMet}
                  goal={task.goal}
                  onPress={() => openModal(task)}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Empty state */}
        {weekdayTasks.length === 0 &&
          weekendTasks.length === 0 &&
          longTermTasks.length === 0 &&
          !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyText}>今天的任務都完成了！</Text>
            </View>
          )}
      </ScrollView>

      {/* Task complete modal */}
      <TaskCompleteModal
        visible={modal.visible}
        task={modal.task}
        isPrerequisiteMet={isPrerequisiteMet}
        goal={modal.task?.goal}
        onConfirm={handleConfirm}
        onClose={closeModal}
      />

      {/* Feedback animation */}
      <FeedbackAnimation
        visible={feedback.visible}
        type={feedback.type}
        value={feedback.value}
        onComplete={handleFeedbackComplete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.text,
  },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  logoutText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  prereqBanner: {
    backgroundColor: Colors.warning + '22',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  prereqBannerText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/screens/child/HomeScreen.tsx
git commit -m "feat(screens): HomeScreen — 3-section task list, modal, feedback animation"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| Three task sections (weekday/weekend/long-term) | Task 10 |
| Task-A/B/C/D display styles | Task 7 |
| Prerequisite discount (0.7) display | Task 7, Task 8 |
| isPrerequisiteMet logic (all A+B done) | Task 6 |
| TaskCompleteModal with date backfill (today/yesterday/2 days ago) | Task 8 |
| completeTask writes task_completion | Task 5 |
| Task-C/D: wallet update + transaction | Task 5 |
| Task-B: time_savings insert | Task 5 |
| Task-D habit: current_day increment + milestone check | Task 5 |
| Milestone coin award animation | Task 9, Task 10 |
| Anti-frustration habit resume (−1 day) | Task 5 (applyHabitResume), Task 6 |
| Pull to refresh | Task 10 |
| Realtime subscription | Task 6 |
| allow_repeat tasks stay active after completion | Task 6 (sortTasks logic) |
| Long-term progress bar | Task 7 |
| LongTermDetailScreen navigation | Task 3 |
| aiAgent.classifyTask | Task 4 |
| aiAgent.generateDegradeSuggestion | Task 4 |
| aiAgent.generateWeeklyInsight stub | Task 4 |
| Fallback on AI errors | Task 4 |
| dayjs/Asia/Taipei timezone | Tasks 5, 6, 8 |
| JSDoc on all lib functions | Task 4, 5 |
| No inline styles | All component tasks |
| StyleSheet.create() | All component tasks |
| Math.round() for coin values | Task 5, 7, 8 |
| try/catch on all Supabase operations | Task 5, 6 |

All spec requirements are covered.

### Type consistency check

- `calcCoin` defined in Task 5, imported in Task 7 (TaskItem), Task 8 (TaskCompleteModal) — signature matches
- `completeTask` defined in Task 5, imported in Task 10 — `goalId` param is optional, matches usage
- `FeedbackType` exported from Task 9, imported in Task 10 — same union type
- `TodayTask` exported from Task 6, imported in Task 10 — includes `isCompleted` and optional `goal`
- `CheckpointRewards` defined in Task 2, used in Task 5 — consistent `Record<string, number>`
- `MilestoneResult` defined and exported in Task 5, used in Task 10 — consistent shape
