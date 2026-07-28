# Remove Reading Reminder Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the post-reading reminder question and its two buttons while continuing to save the selected reading time window.

**Architecture:** `LongTermGoalDetailView` becomes presentation-only after completion and no longer owns reminder-state UI. `LongTermDetailScreen` saves the selected time window immediately after `completeTask` returns a completion ID. The existing nullable `start_mode` database column remains for compatibility, and the RPC receives `null`.

**Tech Stack:** React Native, TypeScript, Supabase RPC, Jest Expo, Testing Library React Native.

---

### Task 1: Remove Reminder UI From The Shared Detail View

**Files:**
- Modify: `src/components/child/__tests__/LongTermGoalDetailView.test.tsx`
- Modify: `src/components/child/LongTermGoalDetailView.tsx`

- [ ] **Step 1: Replace the follow-up behavior test**

After pressing `完成今天閱讀`, assert that the completed state appears and all reminder UI is absent:

```tsx
fireEvent.press(screen.getByText('完成今天閱讀'));

expect(await screen.findByText('今天的閱讀已記下')).toBeTruthy();
expect(screen.queryByText('開始閱讀前，有人提醒嗎？')).toBeNull();
expect(screen.queryByText('我自己開始的')).toBeNull();
expect(screen.queryByText('提醒後開始')).toBeNull();
```

Remove `onRecordStartMode` from the test render helper and component props.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: FAIL because the current component still renders the reminder question after completion.

- [ ] **Step 3: Remove the reminder UI and callback**

In `LongTermGoalDetailView.tsx`:

- remove the `CompletionStartMode` import;
- remove `onRecordStartMode` from `Props`, `TodayStepCardProps`, destructuring, and call sites;
- remove `recordedStartMode`, `handleStartMode`, and the entire `followup` block;
- remove unused follow-up styles.

Keep the existing completed button text:

```tsx
<Text style={styles.completeButtonText}>今天的閱讀已記下</Text>
```

- [ ] **Step 4: Run the component test and verify GREEN**

Run:

```powershell
npx.cmd jest src/components/child/__tests__/LongTermGoalDetailView.test.tsx --runInBand
```

Expected: PASS.

### Task 2: Save The Reading Time Without Start Mode

**Files:**
- Modify: `src/lib/__tests__/taskActions.test.ts`
- Modify: `src/lib/taskActions.ts`
- Modify: `src/screens/child/__tests__/LongTermDetailScreen.test.tsx`
- Modify: `src/screens/child/LongTermDetailScreen.tsx`

- [ ] **Step 1: Update the RPC contract test**

Call the action with a nullable start mode:

```ts
await recordCompletionContext('completion-1', 'after_dinner', null);

expect(mockRpc).toHaveBeenCalledWith('record_completion_context', {
  p_completion_id: 'completion-1',
  p_planned_time_window: 'after_dinner',
  p_start_mode: null,
});
```

- [ ] **Step 2: Update the screen integration test**

After pressing `完成今天閱讀`, assert immediate time-window persistence and no reminder UI:

```tsx
fireEvent.press(await screen.findByText('完成今天閱讀'));

await waitFor(() => {
  expect(mockRecordCompletionContext).toHaveBeenCalledWith(
    'completion-thu',
    'after_dinner',
    null,
  );
});
expect(screen.queryByText('開始閱讀前，有人提醒嗎？')).toBeNull();
```

- [ ] **Step 3: Run both tests and verify RED**

Run:

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand
```

Expected: FAIL because `recordCompletionContext` rejects `null` at the TypeScript boundary and the Screen still waits for the removed follow-up callback.

- [ ] **Step 4: Make start mode nullable in the action**

Change the function signature:

```ts
export async function recordCompletionContext(
  completionId: string,
  plannedTimeWindow: PreferredTimeWindow,
  startMode: CompletionStartMode | null,
): Promise<void>
```

The existing RPC and column already accept `null`; no schema migration is required.

- [ ] **Step 5: Persist time after completion**

In `LongTermDetailScreen.tsx`:

- remove `pendingCompletionId`;
- remove `handleRecordStartMode`;
- after `completeTask` succeeds, call `recordCompletionContext(result.completionId, selectedTimeWindow, null)` when a time is selected;
- update the local completion row with `planned_time_window` and `start_mode: null`;
- catch time-context failure separately so the completed task remains completed;
- stop passing `onRecordStartMode` to the shared component.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npx.cmd jest src/lib/__tests__/taskActions.test.ts src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx --runInBand
```

Expected: PASS with no reminder question or buttons.

- [ ] **Step 7: Run regression verification**

Run:

```powershell
npx.cmd jest src/screens/child/__tests__/longTermGoalPresentation.test.ts src/lib/__tests__/readingDemoMigration.test.ts src/lib/__tests__/readingDemoFinalizerMigration.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/components/child/LongTermGoalDetailView.tsx src/components/child/__tests__/LongTermGoalDetailView.test.tsx src/lib/taskActions.ts src/lib/__tests__/taskActions.test.ts src/screens/child/LongTermDetailScreen.tsx src/screens/child/__tests__/LongTermDetailScreen.test.tsx
git commit -m "fix: remove reading reminder question"
```
