# Unified Long-Term Goal Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate habit, skill, and family long-term detail layouts with one compact treehouse-based detail experience, persist meaningful reading-session context, and add an idempotent 「自主閱讀計畫」 Demo for 承恩.

**Architecture:** Pure presentation helpers translate each `LongTermGoal` into one shared view model, while `LongTermDetailScreen` owns Supabase loading and completion actions. A focused shared view renders the same Header/Hero/action/week/reward/review skeleton for every goal type. Two migrations add optional completion context plus the Demo rows without hard-coding UUIDs.

**Tech Stack:** React Native 0.81, Expo 54, TypeScript 5.9, Supabase/Postgres, Jest Expo, Testing Library React Native, react-native-svg.

---

### Task 1: Add Reading Context To The Data Contract

**Files:**
- Create: `supabase/migrations/20260727000000_add_long_term_reading_context.sql`
- Modify: `src/types/database.ts`
- Modify: `src/lib/taskActions.ts`
- Test: `src/lib/__tests__/taskActions.test.ts`

- [ ] **Step 1: Write the failing task-action test**

Add `recordCompletionContext` to the import list and add:

```ts
describe('recordCompletionContext', () => {
  it('records the selected window and start mode through the authorized rpc', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true }, error: null });

    await recordCompletionContext('completion-1', 'after_dinner', 'self_started');

    expect(mockRpc).toHaveBeenCalledWith('record_completion_context', {
      p_completion_id: 'completion-1',
      p_planned_time_window: 'after_dinner',
      p_start_mode: 'self_started',
    });
  });

  it('surfaces an rpc error without changing the completed task', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'context failed' } });

    await expect(
      recordCompletionContext('completion-1', 'before_bed', 'reminded'),
    ).rejects.toThrow('context failed');
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts --runInBand
```

Expected: FAIL because `recordCompletionContext` is not exported.

- [ ] **Step 3: Add the TypeScript contract**

In `src/types/database.ts`, add:

```ts
export type PreferredTimeWindow = 'after_dinner' | 'before_bed';
export type CompletionStartMode = 'self_started' | 'reminded';
```

Add to `LongTermGoal`:

```ts
preferred_time_window: PreferredTimeWindow | null;
```

Add to `TaskCompletion`:

```ts
planned_time_window: PreferredTimeWindow | null;
start_mode: CompletionStartMode | null;
```

- [ ] **Step 4: Add the migration and authorized RPC**

Create `supabase/migrations/20260727000000_add_long_term_reading_context.sql`:

```sql
ALTER TABLE public.long_term_goals
  ADD COLUMN IF NOT EXISTS preferred_time_window text
  CHECK (preferred_time_window IS NULL OR preferred_time_window IN ('after_dinner', 'before_bed'));

ALTER TABLE public.task_completions
  ADD COLUMN IF NOT EXISTS planned_time_window text
  CHECK (planned_time_window IS NULL OR planned_time_window IN ('after_dinner', 'before_bed')),
  ADD COLUMN IF NOT EXISTS start_mode text
  CHECK (start_mode IS NULL OR start_mode IN ('self_started', 'reminded'));

CREATE OR REPLACE FUNCTION public.record_completion_context(
  p_completion_id uuid,
  p_planned_time_window text,
  p_start_mode text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child_id uuid;
BEGIN
  IF p_planned_time_window NOT IN ('after_dinner', 'before_bed') THEN
    RAISE EXCEPTION 'Invalid planned time window';
  END IF;
  IF p_start_mode NOT IN ('self_started', 'reminded') THEN
    RAISE EXCEPTION 'Invalid start mode';
  END IF;

  SELECT child_id INTO v_child_id
  FROM task_completions
  WHERE id = p_completion_id;

  IF v_child_id IS NULL THEN
    RAISE EXCEPTION 'Completion not found';
  END IF;

  IF coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM children c
      WHERE c.id = v_child_id
        AND c.family_id = (
          SELECT family_id FROM parents WHERE user_id = auth.uid() LIMIT 1
        )
    ) THEN
      RAISE EXCEPTION 'Not authorized'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE task_completions
  SET planned_time_window = p_planned_time_window,
      start_mode = p_start_mode
  WHERE id = p_completion_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_completion_context(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_completion_context(uuid, text, text) TO authenticated, service_role;
```

- [ ] **Step 5: Implement the client API**

In `src/lib/taskActions.ts`:

```ts
import type {
  CheckpointRewards,
  CompletionStartMode,
  LongTermGoal,
  PreferredTimeWindow,
  SkillMilestone,
  Task,
} from '../types/database';

export async function recordCompletionContext(
  completionId: string,
  plannedTimeWindow: PreferredTimeWindow,
  startMode: CompletionStartMode,
): Promise<void> {
  const { error } = await supabase.rpc('record_completion_context', {
    p_completion_id: completionId,
    p_planned_time_window: plannedTimeWindow,
    p_start_mode: startMode,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit the data contract**

```powershell
git add src/types/database.ts src/lib/taskActions.ts src/lib/__tests__/taskActions.test.ts supabase/migrations/20260727000000_add_long_term_reading_context.sql
git commit -m "feat: record long-term completion context"
```

### Task 2: Build One Presentation Model For Every Goal Type

**Files:**
- Create: `src/screens/child/longTermGoalPresentation.ts`
- Create: `src/screens/child/__tests__/longTermGoalPresentation.test.ts`

- [ ] **Step 1: Write failing presentation tests**

Create `src/screens/child/__tests__/longTermGoalPresentation.test.ts` with factories for `Task`, `LongTermGoal`, and completion records, then assert:

```ts
it('models the reading demo as 20 sessions across four weeks', () => {
  const result = buildGoalPresentation(
    makeTask({ name: '自主閱讀計畫', base_time_min: 15 }),
    makeGoal({
      goal_type: 'habit',
      total_days: 20,
      current_day: 3,
      active_days: [1, 2, 3, 4, 5],
      preferred_time_window: 'after_dinner',
      checkpoint_rewards: { '5': 10 },
    }),
    makeCompletions([
      ['2026-07-27T19:00:00+08:00', 'reminded'],
      ['2026-07-28T19:00:00+08:00', 'self_started'],
      ['2026-07-29T19:00:00+08:00', 'self_started'],
    ]),
    dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
  );

  expect(result.headerTitle).toBe('自主閱讀計畫');
  expect(result.overallLabel).toBe('3 / 20 次');
  expect(result.overallPercent).toBe(15);
  expect(result.todayAction).toBe('自己選一本喜歡的書，閱讀 15 分鐘');
  expect(result.weekSummary).toBe('這週已閱讀 3 次，其中 2 次是自己開始的。');
  expect(result.nextReward).toEqual({ threshold: 5, coin: 10 });
});

it('uses the same view model shape for a skill goal', () => {
  const result = buildGoalPresentation(
    makeTask({ name: '鋼琴家之路', long_term_type: 'skill' }),
    makeGoal({
      goal_type: 'skill',
      current_level: 2,
      level_count: 4,
      level_definitions: [
        { id: '1', name: '基礎指法', coin: 10 },
        { id: '2', name: '簡單曲目', coin: 20 },
        { id: '3', name: '雙手合奏', coin: 30 },
        { id: '4', name: '完整演奏', coin: 40 },
      ],
    }),
    [],
    dayjs.tz('2026-07-30T12:00:00', 'Asia/Taipei'),
  );

  expect(result.headerTitle).toBe('鋼琴家之路');
  expect(result.overallLabel).toBe('第 2 / 4 階段');
  expect(result.sectionOrder).toEqual(['hero', 'today', 'week', 'rewards', 'review']);
});
```

- [ ] **Step 2: Run the tests and verify RED**

```powershell
npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand
```

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the presentation types and helpers**

Create `src/screens/child/longTermGoalPresentation.ts` with:

```ts
export type GoalCompletionRecord = Pick<
  TaskCompletion,
  'id' | 'completed_at' | 'planned_time_window' | 'start_mode'
>;

export type GoalDayStatus = {
  day: number;
  label: string;
  state: 'completed' | 'self_started' | 'today' | 'future' | 'missed';
};

export type GoalPresentation = {
  headerTitle: string;
  weekLabel: string;
  categoryLabel: string;
  overallLabel: string;
  overallPercent: number;
  focusText: string;
  nextText: string;
  todayTitle: string;
  todayAction: string;
  preferredTimeWindow: PreferredTimeWindow | null;
  canCompleteToday: boolean;
  isReadingPlan: boolean;
  weekDays: GoalDayStatus[];
  weekSummary: string;
  nextReward: { threshold: number; coin: number } | null;
  finalRewardText: string;
  reviewTitle: string;
  reviewPrompt: string;
  sectionOrder: ['hero', 'today', 'week', 'rewards', 'review'];
};
```

Implement `buildGoalPresentation(task, goal, completions, now)` so:

- reading-plan habit goals use completion count, `total_days`, Monday–Friday day states, and `base_time_min`;
- ordinary habit goals use the same shape with task-specific neutral copy;
- skill goals map `current_level` and `level_definitions` into the same Hero/reward/review slots without rendering unsupported recording actions;
- family goals use `current_day / target_completions`;
- active-day gating uses `goal.active_days`;
- `nextReward` reads the next numeric key in `checkpoint_rewards`.

- [ ] **Step 4: Run the presentation tests and verify GREEN**

```powershell
npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit presentation logic**

```powershell
git add src/screens/child/longTermGoalPresentation.ts src/screens/child/__tests__/longTermGoalPresentation.test.ts
git commit -m "feat: unify long-term goal presentation logic"
```

### Task 3: Render The Compact Shared Detail View

**Files:**
- Create: `src/components/child/LongTermGoalDetailView.tsx`
- Create: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`

- [ ] **Step 1: Write failing component tests**

Render the shared view with a reading presentation and assert:

```ts
expect(screen.getByText('3 / 20 次')).toBeTruthy();
expect(screen.getByText('第一週：先找到適合自己的閱讀節奏')).toBeTruthy();
expect(screen.getByText('今天預計：晚餐後')).toBeTruthy();
expect(screen.queryByText('晚餐後', { exact: true })).toBeNull();
expect(screen.queryByText('睡前', { exact: true })).toBeNull();

fireEvent.press(screen.getByText('今天要調整'));
expect(screen.getByText('晚餐後', { exact: true })).toBeTruthy();
expect(screen.getByText('睡前', { exact: true })).toBeTruthy();

fireEvent.press(screen.getByText('完成今天閱讀'));
expect(onComplete).toHaveBeenCalledTimes(1);
```

Add a second test with a skill presentation and assert the same section test IDs:

```ts
for (const id of ['goal-hero', 'goal-today', 'goal-week', 'goal-rewards', 'goal-review']) {
  expect(screen.getByTestId(id)).toBeTruthy();
}
expect(screen.queryByText('錄一段給自己聽')).toBeNull();
```

- [ ] **Step 2: Run the component tests and verify RED**

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the compact view**

Create `LongTermGoalDetailView.tsx` with focused internal components named
`GoalHero`, `TodayStepCard`, `WeekProgressCard`, `JourneyRewardsCard`, and
`ReviewCard`. Compose them through this public interface:

```tsx
type Props = {
  presentation: GoalPresentation;
  isCompletedToday: boolean;
  checking: boolean;
  onComplete: () => void;
  onSelectTimeWindow: (window: PreferredTimeWindow) => void;
  onRecordStartMode: (mode: CompletionStartMode) => void;
};

export default function LongTermGoalDetailView({
  presentation,
  isCompletedToday,
  checking,
  onComplete,
  onSelectTimeWindow,
  onRecordStartMode,
}: Props) {
  return (
    <ScrollView
      testID="long-term-detail-scroll"
      style={[styles.scroll, webMouseDraggableScroll]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <GoalHero presentation={presentation} />
      <TodayStepCard
        presentation={presentation}
        isCompletedToday={isCompletedToday}
        checking={checking}
        onComplete={onComplete}
        onSelectTimeWindow={onSelectTimeWindow}
        onRecordStartMode={onRecordStartMode}
      />
      <WeekProgressCard days={presentation.weekDays} summary={presentation.weekSummary} />
      <JourneyRewardsCard presentation={presentation} />
      <ReviewCard presentation={presentation} />
    </ScrollView>
  );
}
```

Use:

```tsx
<Image
  source={require('../../../../assets/images/child/treehouse-night.png')}
  style={styles.treehouse}
  resizeMode="contain"
/>
```

Stable mobile dimensions:

```ts
header: { minHeight: 68 }
hero: { minHeight: 194, marginHorizontal: 14, borderRadius: 22 }
card: { padding: 15, borderRadius: 18 }
content: { paddingHorizontal: 14, paddingBottom: 112, gap: 12 }
```

Do not render a completion button when `presentation.canCompleteToday` is false. Do not render context choices until completion succeeds.

- [ ] **Step 4: Run component tests and verify GREEN**

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the shared view**

```powershell
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx
git commit -m "feat: add compact unified long-term detail view"
```

### Task 4: Wire Real Completion Data Into The Screen

**Files:**
- Modify: `src/screens/child/LongTermDetailScreen.tsx`
- Modify: `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`

- [ ] **Step 1: Replace screen expectations with failing unified-view tests**

Update Supabase mocks so `task_completions` returns weekly rows with `id`, `completed_at`, `planned_time_window`, and `start_mode`. Assert:

```ts
expect(await screen.findByText('自主閱讀計畫')).toBeTruthy();
expect(screen.getByText('3 / 20 次')).toBeTruthy();
expect(screen.getByText('這週已閱讀 3 次，其中 2 次是自己開始的。')).toBeTruthy();
expect(screen.getByTestId('goal-hero')).toBeTruthy();
expect(screen.getByTestId('goal-today')).toBeTruthy();
expect(screen.getByTestId('goal-week')).toBeTruthy();
expect(screen.getByTestId('goal-rewards')).toBeTruthy();
expect(screen.getByTestId('goal-review')).toBeTruthy();
expect(screen.getByTestId('bottom-nav')).toBeTruthy();
```

For a skill goal, assert the exact same five test IDs and confirm `鋼琴家之路` renders without `SkillGoalView`-only actions.

- [ ] **Step 2: Run screen tests and verify RED**

```powershell
npx.cmd jest src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand
```

Expected: FAIL because the screen still branches to separate view functions.

- [ ] **Step 3: Refactor screen loading and actions**

In `LongTermDetailScreen.tsx`:

- preserve the existing `webScreen` wrapper and `webMouseDraggableScroll`;
- load goal, task, and completion context from `goal.started_at` through tomorrow;
- derive `GoalPresentation` with `buildGoalPresentation`;
- replace `HabitGoalView`, `SkillGoalView`, and `FamilyRoleView` with one `LongTermGoalDetailView`;
- keep `BottomNav`;
- complete habits/family goals through `completeTask`;
- store returned `completionId`;
- call `recordCompletionContext` only after the optional follow-up answer;
- refresh completions after a successful completion;
- show a retryable alert if context saving fails without undoing completion.

The final render branch is:

```tsx
{presentation ? (
  <LongTermGoalDetailView
    presentation={presentation}
    isCompletedToday={isCheckedIn}
    checking={checking}
    onComplete={handleCheckIn}
    onSelectTimeWindow={setSelectedTimeWindow}
    onRecordStartMode={handleRecordStartMode}
  />
) : null}
```

- [ ] **Step 4: Run screen and component tests**

```powershell
npx.cmd jest src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the screen integration**

```powershell
git add src/screens/child/LongTermDetailScreen.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx
git commit -m "feat: use one long-term goal detail screen"
```

### Task 5: Add The Idempotent 承恩 Reading Demo

**Files:**
- Create: `supabase/migrations/20260727000001_seed_cheng_en_reading_demo.sql`
- Create: `src/lib/__tests__/readingDemoMigration.test.ts`

- [ ] **Step 1: Write a failing migration contract test**

Create a source-based migration test that reads the SQL and asserts:

```ts
expect(sql).toContain("c.nickname = '承恩'");
expect(sql).toContain("'自主閱讀計畫'");
expect(sql).toContain("ARRAY[1,2,3,4,5]");
expect(sql).toContain("'after_dinner'");
expect(sql).toContain("'{\"5\": 10}'::jsonb");
expect(sql).toContain('WHERE NOT EXISTS');
```

- [ ] **Step 2: Run the migration test and verify RED**

```powershell
npx.cmd jest src/lib/__tests__/readingDemoMigration.test.ts --runInBand
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the idempotent Demo migration**

Create `supabase/migrations/20260727000001_seed_cheng_en_reading_demo.sql`:

```sql
DO $$
DECLARE
  v_child record;
  v_task_id uuid;
BEGIN
  FOR v_child IN
    SELECT c.id, c.family_id
    FROM public.children c
    WHERE c.nickname = '承恩'
  LOOP
    SELECT t.id INTO v_task_id
    FROM public.tasks t
    WHERE t.family_id = v_child.family_id
      AND t.name = '自主閱讀計畫'
    ORDER BY t.created_at
    LIMIT 1;

    IF v_task_id IS NULL THEN
      INSERT INTO public.tasks (
        family_id,
        name,
        category,
        day_type,
        recurrence_days,
        long_term_type,
        is_long_term,
        base_time_min,
        difficulty,
        coin_override,
        is_system_default,
        allow_repeat,
        min_age,
        max_age,
        is_active,
        time_saving_min
      ) VALUES (
        v_child.family_id,
        '自主閱讀計畫',
        'D',
        'custom',
        ARRAY[1,2,3,4,5],
        'habit',
        true,
        15,
        1,
        null,
        false,
        false,
        6,
        9,
        true,
        0
      )
      RETURNING id INTO v_task_id;
    ELSE
      UPDATE public.tasks
      SET recurrence_days = ARRAY[1,2,3,4,5],
          is_long_term = true,
          long_term_type = 'habit',
          base_time_min = 15,
          allow_repeat = false,
          is_active = true
      WHERE id = v_task_id;
    END IF;

    INSERT INTO public.child_tasks (child_id, task_id, is_active)
    SELECT v_child.id, v_task_id, true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.child_tasks ct
      WHERE ct.child_id = v_child.id
        AND ct.task_id = v_task_id
    );

    IF EXISTS (
      SELECT 1
      FROM public.long_term_goals g
      WHERE g.child_id = v_child.id
        AND g.task_id = v_task_id
    ) THEN
      UPDATE public.long_term_goals
      SET total_days = 20,
          active_days = ARRAY[1,2,3,4,5],
          preferred_time_window = 'after_dinner',
          checkpoint_rewards = '{"5": 10}'::jsonb,
          status = 'active'
      WHERE child_id = v_child.id
        AND task_id = v_task_id;
    ELSE
      INSERT INTO public.long_term_goals (
        child_id,
        task_id,
        goal_type,
        total_days,
        current_day,
        status,
        checkpoint_rewards,
        motivation_note,
        started_at,
        active_days,
        preferred_time_window,
        interrupt_count
      ) VALUES (
        v_child.id,
        v_task_id,
        'habit',
        20,
        0,
        'active',
        '{"5": 10}'::jsonb,
        '自己選一本喜歡的書，閱讀 15 分鐘',
        current_date,
        ARRAY[1,2,3,4,5],
        'after_dinner',
        0
      );
    END IF;
  END LOOP;
END;
$$;
```

- [ ] **Step 4: Run the migration contract test and verify GREEN**

```powershell
npx.cmd jest src/lib/__tests__/readingDemoMigration.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the Demo seed**

```powershell
git add supabase/migrations/20260727000001_seed_cheng_en_reading_demo.sql src/lib/__tests__/readingDemoMigration.test.ts
git commit -m "feat: seed Cheng-en reading demo"
```

### Task 6: Verify, Apply, And Preview

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1–5.

- [ ] **Step 1: Run all focused tests**

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts src/screens/child/__tests__/longTermGoalPresentation.test.ts src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/lib/__tests__/readingDemoMigration.test.ts --runInBand
```

Expected: all suites PASS.

- [ ] **Step 2: Run TypeScript**

```powershell
npx.cmd tsc --noEmit
```

Expected: no new errors in files changed by this plan. Record unrelated pre-existing errors separately if the repository baseline is already red.

- [ ] **Step 3: Apply linked Supabase migrations**

Inspect the pending migration list, then run:

```powershell
npx.cmd supabase migration list
npx.cmd supabase db push
```

Expected: the two `20260727` migrations apply once. If the linked project or authentication is unavailable, stop and report the exact blocker without claiming the Demo row exists.

- [ ] **Step 4: Start the web preview**

```powershell
npx.cmd expo start --web --offline --port 8082
```

Expected: Expo reports `http://localhost:8082`.

- [ ] **Step 5: Visual checks**

Verify at widths 360px, 390px, and 768px:

- real treehouse image renders;
- Header, Hero copy, progress bar, five weekday columns, reward rows, and bottom nav do not overlap;
- cards are visibly more compact than the previous implementation;
- mouse wheel and drag scrolling work on web;
- reading and skill routes render the same section order;
- the reading Demo is visible on 承恩's Home screen and opens the detail page.

- [ ] **Step 6: Final regression run**

```powershell
npx.cmd jest src/screens/child/__tests__ src/components/child/__tests__ src/lib/__tests__/taskActions.test.ts --runInBand
```

Expected: all related tests PASS.
