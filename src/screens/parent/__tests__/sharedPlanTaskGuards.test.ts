import { readFileSync } from 'fs';
import { join } from 'path';

function source(file: string): string {
  return readFileSync(join(process.cwd(), 'src', 'screens', 'parent', file), 'utf8')
    .replace(/\r\n/g, '\n');
}

function functionSlice(contents: string, startMarker: string, endMarker: string): string {
  const start = contents.indexOf(startMarker);
  const end = contents.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end);
}

describe('parent Shared Plan legacy route guards', () => {
  it('guards task editor save and assignment toggle using active Proposal linkage', () => {
    const contents = source('ParentTaskEditScreen.tsx');
    const save = functionSlice(contents, 'async function handleSave()', 'async function handleToggleActive()');
    const toggle = functionSlice(contents, 'async function handleToggleActive()', 'const isLongTerm');

    expect(contents).toContain('isActiveSharedPlanTask(taskId)');
    expect(save).toContain('assertSharedPlanMutationAllowed(isSharedPlan)');
    expect(toggle).toContain('assertSharedPlanMutationAllowed(isSharedPlan)');
    expect(contents).toContain('SHARED_PLAN_GUARD_MESSAGE');
    expect(contents).not.toContain('提出調整');
  });

  it('guards task detail material save and assignment deactivate without blocking completion', () => {
    const contents = source('ParentTaskDetailScreen.tsx');
    const edit = functionSlice(contents, 'const handleEditSave', 'const handleDelete');
    const remove = functionSlice(contents, 'const handleDelete', 'if (loading)');
    const complete = functionSlice(contents, 'const handleMarkDone', 'const handleCancelDone');

    expect(contents).toContain('isActiveSharedPlanTask(taskId)');
    expect(edit).toContain('assertSharedPlanMutationAllowed(isSharedPlan)');
    expect(remove).toContain('assertSharedPlanMutationAllowed(isSharedPlan)');
    expect(complete).not.toContain('assertSharedPlanMutationAllowed');
    expect(contents).toContain('SHARED_PLAN_GUARD_MESSAGE');
    expect(contents).not.toContain('提出調整');
  });
});
