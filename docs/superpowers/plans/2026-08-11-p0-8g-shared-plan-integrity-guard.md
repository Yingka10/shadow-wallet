# P0-8G Shared Plan Integrity Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent legacy parent and Weekly Report paths from mutating an active Shared Plan while preserving ordinary tasks and all completion runtime behavior.

**Architecture:** A repeat-safe forward migration defines the active-Proposal predicate and material-specific guards at the database boundary. Client helpers normalize the typed refusal and parent screens use the same active-link truth for proactive, informational UX; no adjustment workflow is created.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, TypeScript, React Native, Jest.

---

### Task 1: Lock the database contract with failing migration tests

**Files:**
- Create: `src/lib/__tests__/sharedPlanIntegrityGuardMigration.test.ts`
- Create: `supabase/migrations/20260816000000_shared_plan_integrity_guard.sql`

- [ ] **Step 1: Write failing tests for exact guard scope**

Add assertions that the migration defines `is_active_shared_plan_task_v1`, uses active `child_proposals.task_id`, protects the enumerated task fields, status/delete and assignment deactivation/delete, and does not touch wallets, transactions, or `complete_task`. After merging P0-5B final integration, assert the latest Plan Version guard gains exactly the five staging-proven immutable gaps without freezing lifecycle writes.

- [ ] **Step 2: Verify RED**

Run:

```powershell
npx.cmd jest src/lib/__tests__/sharedPlanIntegrityGuardMigration.test.ts --runInBand
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add the repeat-safe migration**

Implement the helper and triggers with `IS DISTINCT FROM` checks. Recreate the two schedule RPCs from their latest master bodies, adding this pre-write result:

```sql
IF public.is_active_shared_plan_task_v1(p_task_id) THEN
  RETURN jsonb_build_object(
    'error', 'SHARED_PLAN_REQUIRES_RENEGOTIATION'
  );
END IF;
```

Add restrictive `child_tasks` policies whose update check permits active rows but rejects a resulting inactive shared assignment.

After P0-5B final integration reaches master, merge master (do not rebase) and forward-redefine `child_proposal_plan_version_guard()` from that final version. Add `preferred_time`, `preferred_time_custom`, `estimated_minutes`, `adopted_from_plan_version_id`, and `requires_child_review`; retain the accepted write-once activation and confirmed reward evidence semantics.

- [ ] **Step 4: Verify GREEN**

Run the focused migration test and existing schedule/reward migration suites.

### Task 2: Add the typed client guard contract

**Files:**
- Create: `src/lib/sharedPlanIntegrity.ts`
- Create: `src/lib/__tests__/sharedPlanIntegrity.test.ts`
- Modify: `src/lib/taskActions.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write failing tests**

Specify:

```typescript
expect(sharedPlanGuardMessage).toBe('這是一起確認的計畫，調整內容需要再一起確認。');
expect(isSharedPlanGuardCode('SHARED_PLAN_REQUIRES_RENEGOTIATION')).toBe(true);
```

Mock schedule RPC results and require both update helpers to throw the product message without returning success.

- [ ] **Step 2: Verify RED**

Run both new/client task-action tests and confirm failures are caused by the missing helper and mapping.

- [ ] **Step 3: Implement the minimal helper**

Export the code, message, error predicate, and an authenticated family-visible lookup:

```typescript
export async function isActiveSharedPlanTask(taskId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('child_proposals')
    .select('id')
    .eq('task_id', taskId)
    .eq('status', 'active')
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
```

Map RPC result errors and database exceptions to one stable UI error.

- [ ] **Step 4: Verify GREEN**

Run the two focused suites.

### Task 3: Guard Weekly Report evidence ordering

**Files:**
- Modify: `src/hooks/__tests__/useParentWeeklyReport.suggestions.test.ts`
- Modify: `src/hooks/useParentWeeklyReport.ts`
- Modify: `src/screens/parent/tablet/ParentWeeklyTablet.tsx`

- [ ] **Step 1: Write failing tests**

Prove guarded adoption and revert reject before `weekly_reports.ai_suggestions` is patched, while ordinary adoption/revert retains existing behavior.

- [ ] **Step 2: Verify RED**

Run the Weekly Report focused suite and confirm the guarded expectation fails.

- [ ] **Step 3: Implement minimal behavior**

Keep mutation-before-evidence ordering. Let the typed error propagate to `ReviewPromptCard`, which renders the product message and leaves the action available for future review. Do not create an adjustment request or mark the suggestion adopted.

- [ ] **Step 4: Verify GREEN**

Run the focused suite.

### Task 4: Guard Parent Edit, Detail, and long-term lifecycle UX

**Files:**
- Create: `src/screens/parent/__tests__/sharedPlanTaskGuards.test.tsx`
- Modify: `src/screens/parent/ParentTaskEditScreen.tsx`
- Modify: `src/screens/parent/ParentTaskDetailScreen.tsx`
- Modify: `src/lib/taskActions.ts`

- [ ] **Step 1: Write failing component/helper tests**

Prove a linked active Shared Plan cannot save material edits, deactivate, delete, pause, or delete its goal and displays the informational copy. Prove an ordinary task still invokes its existing mutations.

- [ ] **Step 2: Verify RED**

Run the new suite and relevant `taskActions` tests.

- [ ] **Step 3: Implement proactive UX and defensive mapping**

Load active linkage alongside task data, disable shared-plan destructive/material controls, and show only informational copy. Catch server refusal in legacy lifecycle helpers. Do not add an adjustment button.

- [ ] **Step 4: Verify GREEN**

Run the focused suites.

### Task 5: Audit-only Plan Version evidence and complete verification

**Files:**
- Create: `src/lib/__tests__/p0_8gPlanVersionAudit.test.ts`

- [ ] **Step 1: Add an audit contract test**

Read the latest master Plan Version guard and document whether `preferred_time`, `preferred_time_custom`, and `estimated_minutes` are immutable. The test must not require the P0-8G migration to redefine that trigger.

- [ ] **Step 2: Run required verification**

Run P0-8G focused tests, P0-5A, P0-6, P0-7.1, Parent Task/Weekly Report/long-term regressions, `npx.cmd tsc --noEmit`, and `git diff --check`. Run the full Jest regression if its cost remains reasonable.

- [ ] **Step 3: Self-review and local commits**

Confirm no Proposal adjustment/version RPC, wallet, transaction, future activation, or staging files changed. Commit intentionally, fetch origin once more, inspect master overlap, and push the feature branch exactly once without merge or force-push.
