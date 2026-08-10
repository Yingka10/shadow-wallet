# P0-7 Long-Term Honest Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make child long-term progress reflect real scheduled completions without milestone inference or streak-reset language.

**Architecture:** Keep Supabase loading and the shared detail layout intact. Centralize trustworthy completion filtering and per-goal-kind presentation in `longTermGoalPresentation.ts`, then make the detail view omit the milestone section when the presentation has no trustworthy milestones.

**Tech Stack:** React Native, TypeScript, Day.js timezone, Jest, Testing Library.

---

### Task 1: Lock honest rhythm calculations with failing tests

**Files:**
- Modify: `src/screens/child/__tests__/longTermGoalPresentation.test.ts`
- Modify: `src/screens/child/longTermGoalPresentation.ts`

- [ ] **Step 1: Write failing presentation tests**

Add cases whose inputs use real completion timestamps and assert: a four-day schedule reports `3／4`; a missed scheduled day retains the other completed days; same-day duplicates count once; off-schedule completions do not count; and start/end dates are inclusive in Asia/Taipei.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand`

Expected: the new accumulated-count and reading milestone assertions fail against the current raw `completions.length` and generated milestone behavior.

- [ ] **Step 3: Implement the minimum trustworthy completion selector**

Create one helper that converts completion timestamps to Asia/Taipei dates, filters by scheduled weekday and inclusive plan boundaries, and keeps one record per calendar date. Use its all-plan output for accumulated rhythm progress and its current-week subset for weekly progress.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand`

Expected: all presentation tests pass.

### Task 2: Separate milestone truth by goal kind

**Files:**
- Modify: `src/screens/child/__tests__/longTermGoalPresentation.test.ts`
- Modify: `src/screens/child/longTermGoalPresentation.ts`

- [ ] **Step 1: Write failing kind-specific tests**

Assert reading has `milestones: []`, `nextReward: null`, no milestone-completion wording, and a next step grounded in `motivation_note` or a neutral fallback. Assert habit/family do not derive completed reward checkpoints from `current_day`, while skill levels and challenge values retain their explicit progress behavior.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand`

Expected: reading and completion-inference assertions fail.

- [ ] **Step 3: Implement per-kind presentation branches**

Return no checkpoint timeline for reading. Keep habit/family checkpoint configuration neutral and preserve explicit skill/challenge state. Use `motivation_note` for reading action when present and the task name plus supportive copy otherwise.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts --runInBand`

Expected: all presentation tests pass.

### Task 3: Hide unsupported timeline UI and preserve supported kinds

**Files:**
- Modify: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`
- Modify: `src/components/child/LongTermGoalDetailView.tsx`
- Modify: `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`

- [ ] **Step 1: Write failing component and screen tests**

Assert a reading presentation with no milestones has no `goal-rewards` section, while skill/challenge presentations with explicit milestones still render it. Update the reading screen integration assertion to reject fake checkpoint UI while retaining weekly progress.

- [ ] **Step 2: Run focused UI tests and confirm RED**

Run: `npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand`

Expected: the reading timeline is still rendered.

- [ ] **Step 3: Conditionally render the timeline**

Render `MilestoneTimeline` only when `presentation.milestones.length > 0`; do not alter the rest of the layout or sheets.

- [ ] **Step 4: Run focused UI tests and confirm GREEN**

Run: `npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand`

Expected: both suites pass.

### Task 4: Verify scope and commit

**Files:**
- Verify all files changed in Tasks 1–3 and these design/plan documents.

- [ ] **Step 1: Run all related tests**

Run: `npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/components/child/__tests__/LongTermGoalDetailSheets.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx src/lib/__tests__/taipeiDate.test.ts src/lib/__tests__/longTermTaskProgress.test.ts --runInBand`

Expected: all suites pass with zero failures.

- [ ] **Step 2: Run TypeScript**

Run: `npx.cmd tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Inspect scope**

Run: `git diff --check` and `git status --short`

Expected: no whitespace errors and no proposal/version, parent home, weekly report, wallet, migration, package, or lockfile changes.

- [ ] **Step 4: Commit the completed package**

Run: `git add docs/superpowers/specs/2026-08-10-p0-7-long-term-honest-progress-design.md docs/superpowers/plans/2026-08-10-p0-7-long-term-honest-progress.md src/screens/child/longTermGoalPresentation.ts src/screens/child/__tests__/longTermGoalPresentation.test.ts src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx && git commit -m "fix: make long-term progress evidence-based"`

Expected: one local commit on `fix/p0-7-long-term-honest-progress`; no push or merge.

### Task 5: Stop read-time habit rollback

**Files:**
- Create: `src/hooks/__tests__/useTodayTasks.test.ts`
- Modify: `src/hooks/useTodayTasks.ts`
- Modify: `src/lib/taskActions.ts`

- [x] **Step 1: Write the failing hook regression test**

Render `useTodayTasks('child-1')` with Supabase returning one active habit goal whose
`current_day` is already positive and no completion for today. Mock the legacy
`applyHabitResume` boundary and assert that initial load and `refresh()` never call it.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npx.cmd jest src/hooks/__tests__/useTodayTasks.test.ts --runInBand`

Expected: FAIL because the existing fetch loop calls `applyHabitResume` for the habit.

- [x] **Step 3: Remove the runtime invocation**

Delete the `applyHabitResume` import and the habit-resume loop from `useTodayTasks`.
Keep `applyHabitResume` itself and its legacy unit tests unchanged; do not add another
write path or alter completion, wallet, checkpoint, proposal, or version behavior.
Mark the retained helper as deprecated legacy behavior without changing its implementation.

- [x] **Step 4: Run focused and P0-7 regression verification**

Run the new hook suite, the six existing P0-7 suites, `npx.cmd tsc --noEmit`, and
`git diff --check`. Expected: all commands exit 0.

- [ ] **Step 5: Commit and update the existing remote branch**

Commit only the plan, hook, retained-helper documentation, and hook regression test, then push
`fix/p0-7-long-term-honest-progress` without merging.
