# P0-6 Reward Guard Hardening Implementation Plan

> **For Codex:** Use the executing-plans skill and complete each task with its
> verification before moving on.

**Goal:** Close cross-family completion, inactive/unassigned task, forged goal,
checkpoint over-mint, and duplicate-collision gaps in the existing completion
path while preserving current valid rewards and long-term progress.

**Architecture:** The Edge Function forwards the caller JWT to a user-scoped
Supabase client. A new forward migration replaces the latest-master
`complete_task` body with ordered authorization/integrity guards, adds a narrow
legacy assignment backfill, and restates RPC ACLs. Tests inspect the migration
contract and exercise a pure Edge handler.

**Tech Stack:** PostgreSQL/PLpgSQL migrations, Supabase Edge Function
TypeScript, Jest, TypeScript.

---

### Task 1: Add failing migration contract tests

**Files:**
- Create: `src/lib/__tests__/rewardGuardHardeningMigration.test.ts`

1. Assert the forward migration exists and is later than current master.
2. Assert child/task family checks precede writes.
3. Assert active task and active assignment guards.
4. Assert `p_goal_id` row lock plus child/task/status validation precedes writes.
5. Assert checkpoint coin requires `coin_eligible`, bounded positive amount,
   and excludes `weekly_frequency`.
6. Assert only `idx_unique_task_per_day` maps to `already_completed`.
7. Assert narrow active goal/task assignment backfill.
8. Assert complete ACL restatement for all three functions.
9. Run the new test and confirm RED because the migration is absent.

### Task 2: Add failing Edge handler tests

**Files:**
- Create: `supabase/functions/complete-task/handler.ts`
- Create: `supabase/functions/complete-task/__tests__/handler.test.ts`

1. Define the handler dependency interface and request/result types only.
2. Test missing auth, caller-scoped success, typed duplicate, wrong-family 403,
   and generic database error behavior.
3. Assert the exact caller JWT reaches the injected RPC dependency.
4. Run the handler test and confirm RED until implementation is added.

### Task 3: Implement the caller-scoped Edge path

**Files:**
- Modify: `supabase/functions/complete-task/handler.ts`
- Modify: `supabase/functions/complete-task/index.ts`

1. Implement validation, Taipei timestamp creation, RPC invocation, and typed
   response mapping in the pure handler.
2. Build a Supabase client with anon key plus the request Authorization header.
3. Remove service-role JWT verification and service-role completion RPC usage.
4. Run handler tests and TypeScript typecheck.

### Task 4: Implement the forward database migration

**Files:**
- Create: `supabase/migrations/20260814000000_reward_guard_hardening.sql`

1. Copy the latest-master function definition as the base.
2. Add the narrow active goal/task assignment backfill.
3. Add ordered family, activity, assignment, and locked goal guards.
4. Preserve existing reward calculation and frequency semantics.
5. Scope unique-violation translation to `idx_unique_task_per_day`.
6. Gate checkpoint coin by canonical task policy/range and exclude flexible
   weekly rhythm.
7. Restate ACLs for `settle_weekly_interest`, `complete_task`, and
   `mark_task_atomic`.
8. Run migration contract tests and existing reward tests.

### Task 5: Add staging verification asset

**Files:**
- Create: `supabase/verify/staging/p0-6-reward-guard.sql`

1. Document explicit staging project selection requirement.
2. Add read-only/preflight assertions for ACL and assignment anomalies.
3. Add transactional test cases for allowed completion and each denied path,
   with rollback and zero-side-effect checks.
4. Do not claim the asset ran unless a safe explicitly selected staging project
   is available.

### Task 6: Review and verify the package

1. Run Edge and migration focused tests.
2. Run completion/reward/long-term/wallet regressions.
3. Run `npx.cmd tsc --noEmit`.
4. Run `git diff --check`.
5. Run full Jest regression if cost remains reasonable.
6. Inspect changes for forbidden P0-5/Proposal/weekly-report/wallet-policy scope.
7. Fetch origin and report any master movement/domain overlap without rebasing.
8. Commit intentionally and push `fix/p0-6-reward-guard` once; do not merge.
