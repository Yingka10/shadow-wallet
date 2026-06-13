-- Grant table-level permissions for long_term_goals
-- (previously only written via Edge Function service role; now also written directly from client)
grant select, insert, update on public.long_term_goals to authenticated;

-- Grant table-level permissions for child_tasks
-- (needed by createLongTermGoal which directly inserts child_task rows)
grant select, insert, update on public.child_tasks to authenticated;

-- Grant table-level permissions for tasks
-- (needed by createLongTermGoal which directly inserts task rows)
grant select, insert, update on public.tasks to authenticated;

-- ── RLS policies for long_term_goals ─────────────────────────────────────────

drop policy if exists "parents can insert long term goals for family children" on long_term_goals;
create policy "parents can insert long term goals for family children"
  on long_term_goals for insert
  with check (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

drop policy if exists "family members can view long term goals" on long_term_goals;
create policy "family members can view long term goals"
  on long_term_goals for select
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

drop policy if exists "family members can update long term goals" on long_term_goals;
create policy "family members can update long term goals"
  on long_term_goals for update
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

-- ── RLS policies for tasks ────────────────────────────────────────────────────

-- Parents can insert custom tasks for their family
drop policy if exists "parents can insert tasks for their family" on tasks;
create policy "parents can insert tasks for their family"
  on tasks for insert
  with check (family_id = my_family_id());

-- Family members can read tasks that belong to their family
-- (needed for INSERT...SELECT to return the new task id)
drop policy if exists "family members can view their family tasks" on tasks;
create policy "family members can view their family tasks"
  on tasks for select
  using (
    family_id = my_family_id()
    or is_system_default = true
  );

-- ── RLS policies for child_tasks ─────────────────────────────────────────────

-- Parents can insert child_task assignments for children in their family
drop policy if exists "parents can insert child task assignments" on child_tasks;
create policy "parents can insert child task assignments"
  on child_tasks for insert
  with check (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

-- Family members can read child_task assignments for their children
drop policy if exists "family members can view child task assignments" on child_tasks;
create policy "family members can view child task assignments"
  on child_tasks for select
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );

-- Family members can update child_task assignments (e.g. deactivate)
drop policy if exists "family members can update child task assignments" on child_tasks;
create policy "family members can update child task assignments"
  on child_tasks for update
  using (
    child_id in (
      select id from children where family_id = my_family_id()
    )
  );
