# Long-Term Unified Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace name-based long-term layouts with one structured, progression-driven child shell while preserving completion and shared-plan P0 behavior.

**Architecture:** `longTermGoalPresentation.ts` owns structured category, progression, honest weekly semantics, and display capabilities. The view uses one Hero → Today → Progress → Review → More shell; only Progress varies by progression. Sheets use a display capability for time-window UI, while Screen hook context remains the sole authority for shared-plan RPC submission.

**Tech Stack:** React Native, TypeScript, Jest + React Native Testing Library, Day.js (Taipei time).

---

## File map

| File | Responsibility |
| --- | --- |
| `src/screens/child/longTermGoalPresentation.ts` | Structured mapper, plan-state, and display semantics. |
| `src/components/child/LongTermGoalDetailView.tsx` | Shared detail shell and Progress interior. |
| `src/components/child/LongTermGoalDetailSheets.tsx` | Capability-gated preferred-time UI and unchanged RPC gate. |
| `src/screens/child/LongTermDetailScreen.tsx` | Existing P0 orchestration; only minimal capability plumbing/helper rename. |
| Six named child test files | Mapper, UI, shared-plan, and Screen regressions. |

### Task 1: Build a structured presentation mapper

**Files:**
- Modify: `src/screens/child/longTermGoalPresentation.ts`
- Test: `src/screens/child/__tests__/longTermGoalPresentation.test.ts`

- [ ] **Step 1: Write failing structured-regression tests**

Add an exact Demo fixture:

```ts
const demoTask = {
  name: '兩週讀完這本書',
  category: 'D',
  schedule_mode: 'weekly_frequency',
  weekly_frequency: 3,
  progress_model: 'weekly_rhythm',
  next_step: '今天先讀 15 分鐘',
};
const demoGoal = { start_date: '2026-08-11', end_date: '2026-08-24' };
```

Assert `progression === 'weekly_rhythm'`, `categoryLabel === '學習與技能'`, `todayAction === '今天先讀 15 分鐘'`, `weekProgressLabel === '本週 2 / 3'`, `completionConditionLabel !== '完成 14 次'`, `planNotice === null`, and the plan is not presentation-completed merely at six records. Add same-fields/different-name fixtures (`自主閱讀計畫` and `兩週讀完這本書`) that return the same progression, warnings, and progress. Add A/B/C/D category assertions and unplanned habit/family assertions for `progression === null`, `planState === 'unplanned'`, and no invented weekday schedule.

- [ ] **Step 2: Verify the new tests fail**

Run:

```powershell
npx.cmd jest --runInBand src/screens/child/__tests__/longTermGoalPresentation.test.ts
```

Expected: RED for name-derived `reading_habit`, incorrect category, 14-completion/capacity diagnostics, and synthetic final-review milestone behavior.

- [ ] **Step 3: Define the mapper types and precedence**

Replace the public architecture switch with:

```ts
export type GoalKind = 'habit' | 'skill' | 'family' | 'challenge';
export type GoalProgressionType =
  | 'weekly_rhythm' | 'fixed_days' | 'staged_skill' | 'accumulation' | 'challenge';

function deriveProgression(task: Task, goal: LongTermGoal): GoalProgressionType | null {
  if (goal.goal_type === 'skill') return 'staged_skill';
  if (goal.goal_type === 'challenge' && hasValidValues(goal)) return 'accumulation';
  if (goal.goal_type === 'challenge') return 'challenge';
  if (task.progress_model === 'weekly_rhythm'
    || task.schedule_mode === 'weekly_frequency') return 'weekly_rhythm';
  return hasFixedWeekdayEvidence(task, goal) ? 'fixed_days' : null;
}
```

Add `progression` and `supportsPreferredTimeWindow` to `GoalPresentation`; remove `isReadingPlan`, `reading_habit`, and every title-based decision. Map DB `responsibility` to UI `family`. Map structured `task.category` A/B/C/D to 生活習慣／家庭參與／自主挑戰／學習與技能; only missing-category rows use the existing non-name fallback.

- [ ] **Step 4: Make weekly semantics terminal-safe**

For canonical duration-based weekly rhythm (explicit progress model, weekly frequency, valid start/end), keep capacity as display metadata only:

```ts
const terminalTarget = durationBasedWeeklyRhythm ? null : target;
const hasReachedTarget = terminalTarget !== null && current >= terminalTarget;
const completionConditionLabel = durationBasedWeeklyRhythm
  ? `\${totalWeeks} 週計畫 · 每週 \${weekTarget} 次`
  : existingCompletionConditionLabel;
const planNotice = durationBasedWeeklyRhythm ? null : existingPlanNotice;
```

Use plan position for Hero and `本週 X / Y` for behavioral progress. Remove generated final-review entries from `buildRhythmMilestones`; retain only persisted/structured checkpoints. Remove the stale `sectionOrder` contract.

- [ ] **Step 5: Verify mapper GREEN and commit**

Run:

```powershell
npx.cmd jest --runInBand src/screens/child/__tests__/longTermGoalPresentation.test.ts
git add src/screens/child/longTermGoalPresentation.ts src/screens/child/__tests__/longTermGoalPresentation.test.ts
git commit -m "feat: derive long-term progression from structured data"
```

Expected: all existing and new mapper tests pass.

### Task 2: Render the shared long-term shell

**Files:**
- Modify: `src/components/child/LongTermGoalDetailView.tsx`
- Test: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`

- [ ] **Step 1: Write failing common-shell tests**

Render weekly rhythm, fixed days, staged skill, accumulation, and challenge fixtures. For each, assert ordered landmarks: Hero/current position, Today/current step, one Progress section, Together Review, and More. Assert Progress interiors: `本週 2 / 3`; real completed/today/upcoming/missed/unscheduled weekdays; stage count; current/target/unit; or checkpoint. Assert no peer milestone/reward major section and retain existing Today font/CTA hierarchy assertions.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest --runInBand src/components/child/__tests__/LongTermGoalDetailView.test.tsx
```

Expected: RED where reading-specific weekly placement and generic milestone/reward sections differ from the common shell.

- [ ] **Step 3: Implement the one-section Progress renderer**

Remove `isFlexibleReadingRhythm` and all `reading_habit` layout branches. Retain shared Hero, Today, completion/retry, correction entry, Review, and More callbacks. Select only Progress interior by mapper output:

```tsx
switch (presentation.progression) {
  case 'weekly_rhythm': return <WeeklyRhythmProgress presentation={presentation} />;
  case 'fixed_days': return <WeekdayProgress days={presentation.weekDays} />;
  case 'staged_skill': return <StageProgress presentation={presentation} />;
  case 'accumulation': return <AccumulationProgress presentation={presentation} />;
  case 'challenge': return <ChallengeProgress presentation={presentation} />;
  default: return <UnplannedProgress label="尚未安排" />;
}
```

Render persisted `presentation.milestones` only inside Progress.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npx.cmd jest --runInBand src/components/child/__tests__/LongTermGoalDetailView.test.tsx
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx
git commit -m "feat: unify long-term detail shell"
```

Expected: common-shell, fixed-day truthfulness, completion retry, and hierarchy tests pass.

### Task 3: Gate time-window UI by capability without widening RPC access

**Files:**
- Modify: `src/components/child/LongTermGoalDetailSheets.tsx`
- Test: `src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx`
- Test: `src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx`

- [ ] **Step 1: Write failing capability tests**

Replace reading-kind setup with `supportsPreferredTimeWindow`. Prove a non-reading-name task with the capability shows the narrow time review and record correction. Prove weekly rhythm without it remains neutral. Retain regressions for same value, no shared plan, invalid selection, pending, submitting, failure preserving draft, submitted-awaiting-confirmation copy, and no-clawback copy.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest --runInBand src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx
```

Expected: RED because reading-kind branches still control the narrow flow.

- [ ] **Step 3: Replace only UI eligibility**

Use `presentation.supportsPreferredTimeWindow` in Record, Review, and adjustment labels. Keep every other review neutral. Preserve actual submission authority:

```ts
const wantsTimeChange = presentation.supportsPreferredTimeWindow
  && draft.nextStep === 'time';
const canSend = Boolean(sharedPlan)
  && wantsTimeChange
  && chosenWindow !== null
  && !sharedPlan!.pending
  && !sharedPlan!.submitting
  && sharedPlan!.currentPreferredTime !== chosenWindow;
```

Do not change `handleSend`, the shared-plan context prop, parent-confirmation text, local-draft fallback, or completed-record preservation.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npx.cmd jest --runInBand src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx
git add src/components/child/LongTermGoalDetailSheets.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx
git commit -m "feat: gate long-term time review by capability"
```

Expected: capability UI and every P0 submission gate pass.

### Task 4: Freeze Screen behavior and add only presentation plumbing

**Files:**
- Modify: `src/screens/child/LongTermDetailScreen.tsx`
- Test: `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`
- Test: `src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx`

- [ ] **Step 1: Write failing Screen integration tests**

Feed the canonical Demo through existing mocks and assert structured Today action, `本週 2 / 3`, category D, no `完成 14 次`, and no capacity warning. Update shared-plan fixtures to establish capability rather than reading kind; preserve focus refresh, no-clawback, completion context, retry, double-submit, and Taipei tests.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest --runInBand src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx
```

Expected: stale name-based fixtures and the new Demo integration test fail.

- [ ] **Step 3: Make only the approved Screen change**

Rename `readingWindowFromTask` to `preferredTimeWindowFromTask` without changing its two accepted values. Keep date normalization, completion/correction queues, generation guards, focus reload, shared-plan refresh, and `sharedPlanTimeAdjustment.onSubmit` unchanged. Pass `hasSharedPlan: Boolean(sharedPlan)` to the mapper only when shared plan is the sole structured evidence for display capability.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npx.cmd jest --runInBand src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx
git add src/screens/child/LongTermDetailScreen.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx
git commit -m "test: cover structured long-term demo flow"
```

Expected: all Screen P0 and shared-plan tests pass.

### Task 5: Verify scope and hand off visual acceptance

**Files:** Verify only; no production edits.

- [ ] **Step 1: Run the required suite**

```powershell
npx.cmd jest --runInBand src/screens/child/__tests__/longTermGoalPresentation.test.ts src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.sharedPlan.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/screens/child/__tests__/LongTermDetailScreen.sharedPlan.test.tsx
```

Expected: all six suites pass.

- [ ] **Step 2: Type-check, whitespace-check, and audit files**

```powershell
npx.cmd tsc --noEmit
git diff --check 264aa562529f0f801769d3acd88609aebde5f6eb...HEAD
git diff --name-only 264aa562529f0f801769d3acd88609aebde5f6eb...HEAD
```

Expected: commands exit 0; no Gemini, AI, Parent Proposal, `src/lib/childProposal`, database type, migration, or function file is changed.

- [ ] **Step 3: Hand off real-device visual acceptance**

Verify the Demo order Hero → Today → Progress → Review → More; Today remains focal; weekly Progress says `本週 X / 3`; no capacity diagnostic appears. Report any legacy ambiguous row without migration or reinterpretation.

