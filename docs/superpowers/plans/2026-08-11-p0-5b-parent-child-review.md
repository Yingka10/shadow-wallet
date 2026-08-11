# P0-5B Parent Material Edit → Child Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓家長可修改 Child Proposal 的 cadence、preferred time 與 completion description，交由孩子看 structured diff 並接受、要求再談或由家長關閉，且只有接受時才原子建立 canonical task。

**Architecture:** 新增一支 repeat-safe forward migration，提供四支窄用途 orchestration RPC；既有 `transition_child_proposal_v1` 仍是唯一 activation semantics。TypeScript domain 提供 typed commands/results、structured material diff 與 Supabase service，Parent/Child hooks 保持 selected-child stale guard，UI 只 render structured authority。

**Tech Stack:** PostgreSQL/PLpgSQL + Supabase RPC、React Native/TypeScript、React hooks、Jest + Testing Library、dayjs Asia/Taipei。

---

## File map

- Create `supabase/migrations/20260815000000_child_proposal_review_flow.sql`: 四支 orchestration RPC、ACL、column comment。
- Create `src/lib/__tests__/childProposalReviewFlowMigration.test.ts`: migration static contract、repeat safety、atomicity與範圍守衛。
- Modify `src/lib/childProposal/types.ts`: commands/results、review row、failure codes與 `parent_confirmed_at` contract。
- Modify `src/types/database.ts`: 四支 RPC database signatures，保留既有 Proposal types。
- Create `src/lib/childProposal/materialDiff.ts` and test: natural structured diff。
- Create `src/lib/childProposal/reviewCommands.ts` and test: editable patch normalization與 fresh reward decision builder。
- Modify `src/lib/childProposal/childProposalService.ts`, `index.ts`, tests: Parent reader、Child reader、四個 typed calls。
- Modify `src/hooks/useParentProposals.ts` and tests: revise/close action state與refresh。
- Create `src/hooks/useChildProposalReview.ts` and test: selected-child reader/action stale guards。
- Modify `src/screens/parent/tablet/home/parentProposalPresentation.ts` and tests: AI/review/revisit structured states。
- Create `src/screens/parent/tablet/home/ParentProposalEditSheet.tsx`, `ParentProposalUnsuitableSheet.tsx` and tests。
- Modify `src/screens/parent/tablet/home/ParentProposalSection.tsx`, its tests, and `src/screens/parent/tablet/ParentHomeTablet.tsx`: wire Parent actions。
- Create `src/components/child/ChildPlanReviewCard.tsx` and test。
- Modify `src/screens/child/HomeScreen.tsx` and test: render child review near proposal entry。
- Optional create `supabase/verify/staging/child_proposal_review_flow.py`: asset only, explicitly UNRUN。

### Task 1: Migration contract tests

**Files:**
- Create: `src/lib/__tests__/childProposalReviewFlowMigration.test.ts`
- Reference: `supabase/migrations/20260810000000_child_proposal_contract_v1.sql`
- Reference: `supabase/migrations/20260813000000_child_proposal_direct_confirm.sql`

- [ ] **Step 1: Write the failing migration contract suite**

Load `20260815000000_child_proposal_review_flow.sql` and add helpers that extract a `CREATE OR REPLACE FUNCTION ... AS $$ ... $$` body. Assert:

```ts
expect(CODE).toContain('revise_child_proposal_plan_v1');
expect(CODE).toContain('accept_child_proposal_plan_v1');
expect(CODE).toContain('request_child_proposal_changes_v1');
expect(CODE).toContain('close_child_proposal_unsuitable_v1');
expect(revise).toMatch(/FROM child_proposals[\s\S]*FOR UPDATE/);
expect(revise).toContain('child_proposal_plan_versions_one_adoption_per_source');
expect(revise).toContain("'NO_MATERIAL_CHANGE'");
expect(accept).toContain('public.transition_child_proposal_v1');
expect(accept).not.toMatch(/SET[\s\S]*(effective_at|child_accepted_at|confirmed_reward_policy)/);
expect(CODE).toContain('COMMENT ON COLUMN child_proposal_plan_versions.parent_confirmed_at');
expect(CODE).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*GRANT EXECUTE ON FUNCTION/);
```

Also assert exact editable keys are read, readonly values are copied from source aliases, review versions have null dates/effective/accept, close distinguishes missing JSON key from explicit null, request retry inspects the latest matching status event, accept handles active replay before normal-state rejection, and no migration text references wallet/transactions/P0-6 functions.

- [ ] **Step 2: Run the suite and verify RED**

Run: `npx.cmd jest --runInBand src/lib/__tests__/childProposalReviewFlowMigration.test.ts`

Expected: FAIL because the migration file does not exist.

### Task 2: Four orchestration RPCs

**Files:**
- Create: `supabase/migrations/20260815000000_child_proposal_review_flow.sql`
- Test: `src/lib/__tests__/childProposalReviewFlowMigration.test.ts`

- [ ] **Step 1: Implement `revise_child_proposal_plan_v1` minimally**

Use one `SECURITY DEFINER SET search_path = public` function. Parse and require `schemaVersion`, `proposalId`, `expectedPlanVersionId`, and an object `materialEdits`. Lock proposal, call `assert_child_in_caller_family`, require proposed/task null/exact current, fetch source version by proposal/id, normalize and validate:

```sql
IF v_mode = 'weekly_frequency' THEN
  IF v_weekly_frequency NOT BETWEEN 1 AND 7 OR v_days IS NOT NULL THEN ... END IF;
ELSIF v_mode = 'fixed_days' THEN
  IF v_weekly_frequency IS NOT NULL OR v_days IS NULL OR cardinality(v_days) = 0
     OR EXISTS (SELECT 1 FROM unnest(v_days) d WHERE d NOT BETWEEN 0 AND 6) THEN ... END IF;
ELSE
  RETURN validation failure;
END IF;
```

Compare normalized cadence/time/completion with `IS NOT DISTINCT FROM`; return `NO_MATERIAL_CHANGE` before any write. Insert by explicit column list, taking editable values from the normalized patch and every readonly/reward/provenance field from source; set `adopted_from_plan_version_id = v_expected_plan_id`, review timestamps/flags exactly as spec. Make current, call transition, verify state. Catch only `child_proposal_plan_versions_one_adoption_per_source`, re-read replay evidence, otherwise return `STALE_PLAN_VERSION` with `REVISION_ALREADY_EXISTS`.

- [ ] **Step 2: Implement accept orchestration**

Mirror the P0-5A transaction/subtransaction pattern without modifying P0-5A. Handle active replay first. For review state, validate current parent version, canonical fields and rewardDecision evidence. Compute:

```sql
v_start_date := (clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date;
v_end_date := CASE WHEN v_plan.duration_type = 'long_term'
  THEN v_start_date + (v_plan.duration_days - 1)
  ELSE v_start_date END;
```

Update only current version `start_date/end_date`, call `create_parent_task_v1`, then call `transition_child_proposal_v1` with actor child and task id. Never directly set effective/child accepted/confirmed fields. Raise a controlled exception on nested failure so all canonical/date writes roll back, convert it to typed result outside the subtransaction, and verify transition-owned snapshots.

- [ ] **Step 3: Implement request-changes and close RPCs**

Request changes locks and validates current parent review version, calls transition to proposed, and detects replay only from the latest matching `needs_child_review → proposed` child status event for the same plan. Close requires `p_command ? 'expectedPlanVersionId'`, compares explicit null/UUID exactly with current, requires nonblank reason, supports proposed/review, calls transition, preserves task null and originals, and recognizes only exact same closed reason/version as replay.

- [ ] **Step 4: Add tracked comment and ACLs**

Add `COMMENT ON COLUMN` with the exact parent-decision/non-effective meaning. End with explicit `REVOKE ALL ... FROM PUBLIC, anon` and `GRANT EXECUTE ... TO authenticated` for all four functions. Use only `CREATE OR REPLACE`, comments and ACL statements so repair/reapply is safe.

- [ ] **Step 5: Run migration suite GREEN and commit**

Run: `npx.cmd jest --runInBand src/lib/__tests__/childProposalReviewFlowMigration.test.ts`

Expected: PASS.

Commit: `feat: add child proposal review RPCs`

### Task 3: Typed material diff and command builders

**Files:**
- Create: `src/lib/childProposal/materialDiff.ts`
- Create: `src/lib/childProposal/__tests__/materialDiff.test.ts`
- Create: `src/lib/childProposal/reviewCommands.ts`
- Create: `src/lib/childProposal/__tests__/reviewCommands.test.ts`
- Modify: `src/lib/childProposal/types.ts`
- Modify: `src/lib/childProposal/index.ts`

- [ ] **Step 1: Write RED tests for natural diffs**

Cover weekly 4→3, normalized fixed days, preferred preset, custom time, completion description, no-op, and ignored readonly/title/summary/duration/reward differences. Desired API:

```ts
expect(materialDiff(source, current)).toEqual([{
  field: 'cadence', label: '每週安排', before: '一週 4 次', after: '一週 3 次',
}]);
```

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest --runInBand src/lib/childProposal/__tests__/materialDiff.test.ts`

Expected: FAIL because module is missing.

- [ ] **Step 3: Implement typed diff**

Export `ChildProposalMaterialField`, `ChildProposalMaterialDiff`, `formatPlanCadence`, `formatPreferredTime`, and `materialDiff`. Normalize/sort/dedupe fixed days; never inspect title/summary/snapshot/reward/duration.

- [ ] **Step 4: Write RED tests for command builders**

Define tests for `buildRevisionCommand(card, edits)`, `buildAcceptReviewCommand(review, childAgeGroup)`, explicit-null close command, and request-change reason. Assert readonly input is impossible in the public edit type and fresh accept rewardDecision equals P0-5A evaluator output.

- [ ] **Step 5: Implement types/builders and GREEN**

Add failure codes `NO_MATERIAL_CHANGE`, `PLAN_NOT_CONFIRMABLE`, `PROPOSAL_NOT_IN_REVIEW`; add typed success/results, `ParentProposalMaterialEdits`, `ChildProposalReviewData`, and commands. Reuse the canonical base/reward builder logic already used by `buildDirectConfirmCommand`; do not create pricing math.

Run both new suites and existing direct-confirm builder suite. Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: add typed proposal review material contracts`

### Task 4: Supabase service and readers

**Files:**
- Modify: `src/lib/childProposal/childProposalService.ts`
- Modify: `src/lib/childProposal/__tests__/childProposalService.test.ts`
- Modify: `src/lib/childProposal/__tests__/childProposalReadService.test.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write RED service tests**

Assert Parent query uses `.in('status', ['proposed', 'needs_child_review'])`; child review query filters family/child/review status, fetches exact current version and exact `adopted_from_plan_version_id` source; missing/mismatched rows are omitted rather than guessed. Assert each action calls exactly one named RPC with a typed command and parses success/replay/failure.

- [ ] **Step 2: Verify RED**

Run the two service suites. Expected: FAIL on missing methods and old proposed-only query.

- [ ] **Step 3: Implement service and DB types**

Extend the RPC name union and failure parser. Add:

```ts
revisePlan(card, edits): Promise<ReviseChildProposalResult>
acceptReview(review, childAgeGroup): Promise<AcceptChildProposalResult>
requestChanges(review, reason?): Promise<RequestChildProposalChangesResult>
closeUnsuitable(card, reason): Promise<CloseChildProposalResult>
listNeedsReviewForChild({ familyId, childId, limit }): Promise<ChildProposalReviewData[]>
```

Use shared typed RPC response parsing; UI never assembles JSON. Add exact generated-style signatures to `database.ts` without replacing existing Proposal/P0-5A declarations.

- [ ] **Step 4: Run GREEN and commit**

Run service/read tests plus P0-5A direct confirm tests. Expected: PASS.

Commit: `feat: add proposal review service operations`

### Task 5: Parent hook and structured presentation

**Files:**
- Modify: `src/hooks/useParentProposals.ts`
- Modify: `src/hooks/__tests__/useParentProposals.test.ts`
- Modify: `src/screens/parent/tablet/home/parentProposalPresentation.ts`
- Modify: `src/screens/parent/tablet/home/__tests__/parentProposalPresentation.test.ts`

- [ ] **Step 1: Write RED hook/presentation tests**

Cover revise and close pending/error/success/refresh, child-switch action reset, AI proposed actions, needs-review waiting, parent-current revisit state, no direct confirm for parent versions, and no current-authority use of copied summary.

- [ ] **Step 2: Verify RED**

Run both suites. Expected: FAIL for absent action API/state and missing presentation kinds.

- [ ] **Step 3: Implement minimal hook/presentation**

Return `reviseProposal`, `closeProposal`, `actingProposalId`, `actionError` while keeping confirm API. Presentation exposes a discriminated `state: 'fresh_ai' | 'waiting_child' | 'child_revisit' | 'unready'` and renders cadence/time/completion/reward from structured fields only.

- [ ] **Step 4: Run GREEN and commit**

Run hook/presentation plus P0-4 Parent presentation regressions. Expected: PASS.

Commit: `feat: expose parent proposal review states`

### Task 6: Parent edit and unsuitable UI

**Files:**
- Create: `src/screens/parent/tablet/home/ParentProposalEditSheet.tsx`
- Create: `src/screens/parent/tablet/home/ParentProposalUnsuitableSheet.tsx`
- Create: `src/screens/parent/tablet/home/__tests__/ParentProposalEditSheet.test.tsx`
- Create: `src/screens/parent/tablet/home/__tests__/ParentProposalUnsuitableSheet.test.tsx`
- Modify: `src/screens/parent/tablet/home/ParentProposalSection.tsx`
- Modify: `src/screens/parent/tablet/home/__tests__/ParentProposalSection.test.tsx`
- Modify: `src/screens/parent/tablet/ParentHomeTablet.tsx`

- [ ] **Step 1: Write RED component tests**

Assert the edit sheet contains only cadence/fixed days/preferred/custom/completion controls and save copy; assert duration/reward/title/category/progress/estimated controls are absent. Assert three reason presets, custom-only text input, required reason, pending disable and typed error. Assert section exposes correct actions for all three states.

- [ ] **Step 2: Verify RED**

Run the three Parent component suites. Expected: FAIL because sheets/actions do not exist.

- [ ] **Step 3: Implement sheets and section wiring**

Use existing React Native `Modal`, `TouchableOpacity`, `TextInput` and Parent theme patterns. Keep local form state in sheet, submit typed edits/reason to callbacks, and keep errors visible. Do not show copied summary as current plan after parent revision.

- [ ] **Step 4: Wire ParentHomeTablet**

Pass hook actions/state to `ParentProposalSection`; after successful action rely on hook refresh, and refresh dashboard/long-term only after direct-confirm/accept task creation—not after review/close.

- [ ] **Step 5: Run GREEN and Parent Home regression; commit**

Run Parent UI suites and `ParentHomeTablet.taskDrawer.test.tsx`. Expected: PASS.

Commit: `feat: add parent proposal edit and close UI`

### Task 7: Child review hook

**Files:**
- Create: `src/hooks/useChildProposalReview.ts`
- Create: `src/hooks/__tests__/useChildProposalReview.test.ts`

- [ ] **Step 1: Write RED hook tests**

Inject a typed reader and cover initial load, error/retry, accept/request actions, typed errors, refresh after success, selected-child stale read response, and stale action completion not overwriting a newly selected child.

- [ ] **Step 2: Verify RED**

Run: `npx.cmd jest --runInBand src/hooks/__tests__/useChildProposalReview.test.ts`

Expected: FAIL because hook is missing.

- [ ] **Step 3: Implement hook**

Use a monotonically increasing request generation ref for reads and actions. Clear items/action state when child/family changes. Expose `reviews`, `loading`, `error`, `refresh`, `accept`, `requestChanges`, `actingProposalId`, `actionError`, `successMessage`.

- [ ] **Step 4: Run GREEN and commit**

Commit: `feat: add child proposal review hook`

### Task 8: Child review card and Home integration

**Files:**
- Create: `src/components/child/ChildPlanReviewCard.tsx`
- Create: `src/components/child/__tests__/ChildPlanReviewCard.test.tsx`
- Modify: `src/screens/child/HomeScreen.tsx`
- Modify: `src/screens/child/__tests__/HomeScreen.test.tsx`

- [ ] **Step 1: Write RED card tests**

Render a 4→3 review and assert title/subtitle, structured before/after labels, CTA copies, pending disable/error/retry. Assert no admin words and no copied plan summary.

- [ ] **Step 2: Verify RED**

Run card suite. Expected: FAIL because component is missing.

- [ ] **Step 3: Implement card**

Render `materialDiff(sourcePlanVersion, currentPlanVersion)` using GrowBook child card tokens. If no material diff is available, show an honest refresh/error state instead of fabricated content.

- [ ] **Step 4: Write RED Home integration test**

Mock `useChildProposalReview`, assert the card appears immediately above/near `child-proposal-entry`, actions call typed hook methods, and load/error states do not hide the normal entry.

- [ ] **Step 5: Implement Home wiring and GREEN**

Resolve selected child/family from the existing Home data, call hook unconditionally, render the first review card near proposal entry, and preserve all existing task/wallet behaviors.

Run card and Home suites. Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `feat: add child proposal review card`

### Task 9: Focused and domain regression

**Files:**
- Modify only defects demonstrated by a new failing regression test.

- [ ] **Step 1: Run P0-5B focused suites**

Run migration, material diff, builders, service/read, Parent hook/presentation/sheets/section, Child hook/card/Home suites with `--runInBand`. Expected: all PASS.

- [ ] **Step 2: Run required domain regressions**

Run P0-1 contract/transitions, P0-3 plan draft/structure, P0-5A migration/direct confirm, Parent Home, Child Proposal, P0-7.1 weekly rhythm, canonical task/reward and Task Drawer suites. Expected: all PASS.

- [ ] **Step 3: Typecheck and diff check**

Run `npx.cmd tsc --noEmit` and `git diff --check`. Expected: exit 0.

- [ ] **Step 4: Run full regression**

Run `npx.cmd jest --runInBand`. Expected: exit 0, except only a proven documented baseline issue may be reported; do not silently accept new failures.

- [ ] **Step 5: Self-review and commit fixes**

Audit the ten package self-review questions in the approved request. Any issue must first gain a failing test, then minimal fix, then GREEN. Commit: `test: harden proposal review regressions` if changes exist.

### Task 10: Latest-master integration and one push

**Files:**
- No planned feature edits.

- [ ] **Step 1: Fetch and inspect master**

Run `git fetch origin`, list commits/files since the implementation baseline. Stop if any overlap hits Child Proposal/Plan Version/P0-5A/Parent or Child proposal UI/create task/migration timestamp. If only P0-6/non-overlap, continue.

- [ ] **Step 2: Merge latest master into feature branch**

Use a normal merge commit—no rebase, no force. Do not modify P0-6 files.

- [ ] **Step 3: Repeat all focused/regression/typecheck/diff/full verification**

Expected: all required commands exit 0.

- [ ] **Step 4: Push once and stop**

Push `feat/p0-5b-parent-child-review` normally. Do not merge master and do not start P0-8.
