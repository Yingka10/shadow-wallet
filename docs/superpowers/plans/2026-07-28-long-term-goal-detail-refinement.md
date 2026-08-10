# Long-Term Goal Detail Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the child long-term goal detail as a compact, truthful growth-plan page with real weekly status, clear completion states, milestone history, local review and adjustment drafts, and no incorrect bottom navigation.

**Architecture:** Keep Supabase reads and writes in `LongTermDetailScreen`, derive all display state in `longTermGoalPresentation`, and render the page through focused child components. Add one sheet module for plan details, completion records, review drafts, and adjustment drafts; these drafts remain local and explicitly unsent because this iteration cannot add migrations.

**Tech Stack:** React Native, Expo, React Navigation Stack, TypeScript, Day.js with Asia/Taipei timezone, Supabase, react-native-svg, Jest, React Native Testing Library.

---

## File Map

- Modify `src/screens/child/longTermGoalPresentation.ts`
  - Derive week/plan summaries, seven-day schedule states, milestone timeline, plan details, and recent completion rows.
- Modify `src/screens/child/__tests__/longTermGoalPresentation.test.ts`
  - Lock down recurrence, week counts, milestones, real completion history, and removal of unsupported self-start copy.
- Create `src/components/child/LongTermGoalDetailSheets.tsx`
  - Own reusable bottom-sheet presentation and local review/adjustment draft controls.
- Create `src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx`
  - Verify truthful local-only labels, controls, draft retention callbacks, and accessibility.
- Modify `src/components/child/LongTermGoalDetailView.tsx`
  - Render the compact summary, expandable today step, seven-day schedule, flat milestone timeline, weekend review, recent records, and details entry using SVG icons.
- Modify `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`
  - Verify information hierarchy, completion state, expansion, timeline semantics, and absence of emoji/former game labels.
- Modify `src/screens/child/LongTermDetailScreen.tsx`
  - Add the header more menu, coordinate sheets, update completion context, and remove the detail-page BottomNav.
- Modify `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`
  - Verify data loading, completion behavior, more-menu flow, context update, and BottomNav removal.

### Task 1: Truthful Presentation Model

**Files:**
- Modify: `src/screens/child/longTermGoalPresentation.ts`
- Test: `src/screens/child/__tests__/longTermGoalPresentation.test.ts`

- [ ] **Step 1: Replace reading-summary expectations with week-first and seven-day expectations**

Add tests that assert the presentation contains:

```ts
expect(result.planWeekLabel).toBe('第 1 週／共 4 週');
expect(result.weekProgressLabel).toBe('本週完成 3／5 次');
expect(result.weekTarget).toBe(5);
expect(result.weekCompleted).toBe(3);
expect(result.weekDays).toHaveLength(7);
expect(result.weekDays.map(day => day.state)).toEqual([
  'completed',
  'completed',
  'completed',
  'today',
  'upcoming',
  'unscheduled',
  'unscheduled',
]);
expect(result.weekSummary).toBe('這週已閱讀 3 次。少一天沒有關係，找到適合自己的節奏更重要。');
expect(result.weekSummary).not.toContain('自己開始');
```

Add a second test with `active_days: [2, 4]` to prove the schedule is not fixed to Monday through Friday:

```ts
expect(result.weekDays.map(day => [day.day, day.state])).toEqual([
  [1, 'unscheduled'],
  [2, 'missed'],
  [3, 'unscheduled'],
  [4, 'today'],
  [5, 'unscheduled'],
  [6, 'unscheduled'],
  [0, 'unscheduled'],
]);
```

- [ ] **Step 2: Run the focused presentation test and verify RED**

Run:

```powershell
npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand
```

Expected: FAIL because the current model only returns active days, still uses `self_started`, and lacks the week-first fields.

- [ ] **Step 3: Extend the presentation types and seven-day status builder**

Use these public shapes:

```ts
export type GoalDayState =
  | 'completed'
  | 'today'
  | 'upcoming'
  | 'missed'
  | 'unscheduled';

export type GoalDayStatus = {
  day: number;
  label: string;
  isoDate: string;
  isScheduled: boolean;
  state: GoalDayState;
};

export type GoalMilestone = {
  id: string;
  title: string;
  detail: string | null;
  status: 'completed' | 'next' | 'upcoming';
};

export type GoalRecentRecord = {
  id: string;
  dateLabel: string;
  detail: string;
  timeWindowLabel: string | null;
};
```

Extend `GoalPresentation` with:

```ts
planWeekLabel: string;
weekProgressLabel: string;
weekCompleted: number;
weekTarget: number;
totalWeeks: number;
milestones: GoalMilestone[];
recentRecords: GoalRecentRecord[];
planPeriodLabel: string;
completionConditionLabel: string;
adjustableItemsLabel: string;
```

Build all seven days in Monday-to-Sunday order. A day not in `active_days` is `unscheduled`; a scheduled past day without a completion is `missed`; today is `today`; a scheduled future day is `upcoming`.

- [ ] **Step 4: Derive week-first progress, milestones, details, and recent records**

For completion-count goals:

```ts
const weeklyTarget = activeDays.length;
const totalWeeks = Math.max(Math.ceil(target / Math.max(weeklyTarget, 1)), 1);
const currentWeek = Math.min(
  Math.floor(Math.max(current - 1, 0) / Math.max(weeklyTarget, 1)) + 1,
  totalWeeks,
);
```

Use true checkpoint values for the next milestone and true completion timestamps for recent rows. Do not produce book titles, notes, or start modes that are not present in the loaded completion record.

- [ ] **Step 5: Run presentation tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the model**

```powershell
git add src/screens/child/longTermGoalPresentation.ts src/screens/child/__tests__/longTermGoalPresentation.test.ts
git commit -m "feat: derive truthful long-term goal progress"
```

### Task 2: Local Draft and Detail Sheets

**Files:**
- Create: `src/components/child/LongTermGoalDetailSheets.tsx`
- Create: `src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx`

- [ ] **Step 1: Write failing tests for plan details, review draft, and adjustment draft**

Cover these behaviors:

```tsx
fireEvent.press(screen.getByText('開始週末回顧'));
expect(screen.getByText('這份回答目前只保留在這個畫面，尚未送出給家長。')).toBeTruthy();
fireEvent.press(screen.getByText('睡前'));
fireEvent.changeText(screen.getByPlaceholderText('想記下哪一本書或哪一段？'), '神奇樹屋');
fireEvent.press(screen.getByText('保留回顧草稿'));
expect(onSaveReviewDraft).toHaveBeenCalledWith({
  favoriteNote: '神奇樹屋',
  preferredWindow: 'before_bed',
  nextStep: null,
});
```

For adjustment:

```tsx
fireEvent.press(screen.getByText('想調整每週次數'));
fireEvent.press(screen.getByText('保留調整草稿'));
expect(onSaveAdjustmentDraft).toHaveBeenCalledWith('frequency');
expect(screen.queryByText('已通知家長')).toBeNull();
expect(screen.queryByText('已套用')).toBeNull();
```

- [ ] **Step 2: Run the new sheet test and verify RED**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx --runInBand
```

Expected: FAIL because the sheet module does not exist.

- [ ] **Step 3: Create the shared modal sheet frame**

Implement:

```ts
export type LongTermSheet =
  | 'menu'
  | 'details'
  | 'record'
  | 'review'
  | 'adjustment'
  | null;

export type ReviewDraft = {
  favoriteNote: string;
  preferredWindow: PreferredTimeWindow | 'either' | 'unsure' | null;
  nextStep: 'keep' | 'time' | 'frequency' | 'method' | null;
};

export type AdjustmentDraft =
  | 'time'
  | 'frequency'
  | 'method'
  | 'content'
  | 'pause'
  | 'discuss';
```

Use `Modal transparent animationType="fade"` with a dimmed pressable backdrop and a bottom-aligned white surface. Every close control gets an accessibility label and every option uses `accessibilityRole="button"`.

- [ ] **Step 4: Implement truthful sheet content**

Provide:

- menu: details, propose adjustment, pause.
- details: period, type, completion condition, suggested time, adjustable items.
- record: actual completion date, minutes, and time window when available.
- review: optional note, time-window choice, next-step choice, local-only explanation.
- adjustment: six proposal categories and a local-only explanation.

The save buttons call local callbacks and close the sheet. They must use the text `保留回顧草稿` and `保留調整草稿`, never `送出成功`.

- [ ] **Step 5: Run sheet tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the sheet module**

```powershell
git add src/components/child/LongTermGoalDetailSheets.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx
git commit -m "feat: add long-term goal local draft sheets"
```

### Task 3: Compact Detail View

**Files:**
- Modify: `src/components/child/LongTermGoalDetailView.tsx`
- Test: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`

- [ ] **Step 1: Write failing tests for the new page hierarchy**

Assert:

```tsx
expect(screen.getByText('第 1 週／共 4 週')).toBeTruthy();
expect(screen.getByText('本週完成 3／5 次')).toBeTruthy();
expect(screen.queryByText('15%')).toBeNull();
expect(screen.queryByText('下一站')).toBeNull();
expect(screen.getByText('下一個里程碑')).toBeTruthy();
expect(screen.getAllByLabelText(/星期/)).toHaveLength(7);
expect(screen.getByText('最近紀錄')).toBeTruthy();
```

Assert today expansion:

```tsx
fireEvent.press(screen.getByLabelText('展開小步驟說明'));
expect(screen.getByText('小步驟說明')).toBeTruthy();
expect(screen.getByText('找一本你有興趣的書，安靜閱讀 15 分鐘。')).toBeTruthy();
```

Assert completion state:

```tsx
expect(screen.getByText('今天已完成 15 分鐘')).toBeTruthy();
expect(screen.getByText('查看紀錄')).toBeTruthy();
expect(screen.getByText('需要更正')).toBeTruthy();
expect(screen.queryByText('今天的閱讀已記下')).toBeNull();
```

- [ ] **Step 2: Run the detail-view test and verify RED**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: FAIL because the current hero is count-first, sections use emoji, and completion is rendered as a disabled-looking button.

- [ ] **Step 3: Replace emoji headings with token-colored SVG icons**

Create small local icon functions using `react-native-svg`:

- `BookIcon`
- `SproutIcon`
- `CalendarIcon`
- `MilestoneIcon`
- `ConversationIcon`
- `DocumentIcon`
- `CheckIcon`
- `ChevronIcon`

All fills and strokes must use `Colors` tokens. Remove hard-coded hex values from this component.

- [ ] **Step 4: Rebuild the hero and today card**

Hero:

- reduce minimum height from 194 to about 150–156.
- keep `treehouse-night.png` at a smaller fixed size in the lower corner.
- display `planWeekLabel`, `weekProgressLabel`, progress bar, `focusText`, and the next milestone.
- remove the standalone percentage.

Today:

- primary button text: `記錄今天的閱讀`.
- completed state is a pale-green status panel with deep-green text.
- add `查看紀錄` and `需要更正` secondary actions.
- add an expandable explanation with `accessibilityState={{ expanded }}`.

- [ ] **Step 5: Rebuild week, milestones, review, and recent records**

- week uses seven stable cells and full accessibility labels such as `星期一，已完成`.
- milestones use a vertical line/list with completed, next, and upcoming markers.
- review is a real button opening the review sheet.
- recent records render at most three real rows and remain hidden when there are no completions.
- plan details are a quiet row button, not another large card.

- [ ] **Step 6: Run detail-view tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit the detail view**

```powershell
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx
git commit -m "feat: rebuild long-term goal child detail view"
```

### Task 4: Screen Header, Sheet Coordination, and Navigation

**Files:**
- Modify: `src/screens/child/LongTermDetailScreen.tsx`
- Test: `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`

- [ ] **Step 1: Write failing tests for navigation and sheet wiring**

Add a BottomNav mock and assert:

```tsx
expect(screen.queryByTestId('bottom-nav')).toBeNull();
expect(screen.getByLabelText('更多計畫選項')).toBeTruthy();
fireEvent.press(screen.getByLabelText('更多計畫選項'));
expect(screen.getByText('查看計畫詳情')).toBeTruthy();
expect(screen.getByText('提出調整')).toBeTruthy();
expect(screen.getByText('暫停一下')).toBeTruthy();
```

Verify selecting `暫停一下` opens the adjustment draft with pause selected and does not call Supabase update on `long_term_goals`.

- [ ] **Step 2: Run the screen test and verify RED**

Run:

```powershell
npx.cmd jest src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand
```

Expected: FAIL because the screen still renders BottomNav and has no more button or sheets.

- [ ] **Step 3: Remove BottomNav and add the compact header actions**

Delete:

```ts
import BottomNav from '../../components/BottomNav';
type ChildTabId = 'home' | 'wallet' | 'wish' | 'profile';
```

Delete `handleTabPress` and the `<BottomNav ... />` render.

Add a 44x44 more button with `accessibilityLabel="更多計畫選項"` and a three-dot SVG. Keep title as the flexible center element and render week state as a compact badge that does not imitate a CTA.

- [ ] **Step 4: Wire screen-owned sheet state and local drafts**

Add:

```ts
const [activeSheet, setActiveSheet] = useState<LongTermSheet>(null);
const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(EMPTY_REVIEW_DRAFT);
const [adjustmentDraft, setAdjustmentDraft] = useState<AdjustmentDraft | null>(null);
```

Pass callbacks to the detail view and render `LongTermGoalDetailSheets` once at screen level. Local save callbacks only update React state.

- [ ] **Step 5: Update completion record selection**

Track the actual completion selected for `查看紀錄`. `需要更正` opens the record sheet with the existing `planned_time_window`; a changed time window calls:

```ts
await recordCompletionContext(completion.id, nextWindow, null);
```

Then replace only that completion in local state. Do not delete the completion or change its completed timestamp.

- [ ] **Step 6: Run screen and related tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit the screen integration**

```powershell
git add src/screens/child/LongTermDetailScreen.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx
git commit -m "feat: integrate long-term goal detail interactions"
```

### Task 5: Responsive and Regression Verification

**Files:**
- Modify only files already listed when a verified layout or accessibility defect is found.

- [ ] **Step 1: Run the complete long-term goal regression set**

Run:

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/longTermGoalPresentation.test.ts src/lib/__tests__/readingDemoMigration.test.ts src/lib/__tests__/readingDemoFinalizerMigration.test.ts --runInBand
```

Expected: all listed suites PASS.

- [ ] **Step 2: Run TypeScript**

Run:

```powershell
npx.cmd tsc --noEmit
```

Expected: no errors in files changed by this plan. Record separately any pre-existing baseline errors outside the changed files.

- [ ] **Step 3: Start Expo web for visual verification**

Run:

```powershell
npx.cmd expo start --web --port 8084
```

Expected: Expo serves the app at `http://localhost:8084`.

- [ ] **Step 4: Verify desktop and mobile layouts in the in-app browser**

Open the reading goal detail and capture screenshots at:

- 360x800
- 390x844
- 430x932
- desktop web viewport

Check:

- header title, week badge, and more button do not overlap.
- treehouse does not cover copy.
- seven day cells remain stable.
- modal sheets stay within the viewport.
- completion and CTA styles are visibly distinct.
- no BottomNav appears.
- mouse wheel and drag scrolling work on web.

- [ ] **Step 5: Run diff and policy checks**

Run:

```powershell
git diff --check
rg -n "#[0-9A-Fa-f]{6}|🌱|📚|⭐|❤️|📊|🌿" src/components/child/LongTermGoalDetailView.tsx src/components/child/LongTermGoalDetailSheets.tsx src/screens/child/LongTermDetailScreen.tsx
```

Expected: `git diff --check` is clean and the icon/hex scan returns no production UI violations in the changed files.

- [ ] **Step 6: Commit verified refinements if needed**

If visual verification required changes:

```powershell
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/LongTermGoalDetailSheets.tsx src/screens/child/LongTermDetailScreen.tsx
git commit -m "fix: polish long-term goal responsive layout"
```

If no files changed, do not create an empty commit.
