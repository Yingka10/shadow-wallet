import { deepEqual, isDraftDirty } from '../dirty';
import { createTaskDraft, type DraftChildContext } from '../createTaskDraft';
import { isGrowthPlanDraft } from '../types';
import { ALL_FAMILIES } from '../../taskCatalog';

const CHILD: DraftChildContext = {
  nickname: '承恩',
  birthDate: '2018-03-05',
  familyId: 'family-1',
};

function readingDraft() {
  const family = ALL_FAMILIES.find(f => f.id === 'learn-reading');
  if (!family) throw new Error('family not found');
  const variant = family.variants.find(v => v.id === 'learn-reading-plan');
  if (!variant) throw new Error('variant not found');
  const draft = createTaskDraft(family, variant, CHILD);
  if (!isGrowthPlanDraft(draft)) throw new Error('expected growth plan draft');
  return draft;
}

describe('deepEqual', () => {
  it('比較純量', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual(1, '1')).toBe(false);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('比較陣列（含順序）', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('比較巢狀物件，且不受鍵順序影響', () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('把 undefined 值的鍵視為不存在', () => {
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });
});

describe('isDraftDirty', () => {
  it('剛建立時不 dirty', () => {
    const draft = readingDraft();
    expect(isDraftDirty(draft, draft)).toBe(false);
    expect(isDraftDirty(draft, { ...draft })).toBe(false);
  });

  it('任一方為 null 時視為未改動', () => {
    const draft = readingDraft();
    expect(isDraftDirty(null, draft)).toBe(false);
    expect(isDraftDirty(draft, null)).toBe(false);
  });

  it('改文字、選項、日期、執行日、期間、提醒都會 dirty', () => {
    const initial = readingDraft();

    expect(isDraftDirty(initial, { ...initial, title: '改過的名稱' })).toBe(true);
    expect(isDraftDirty(initial, { ...initial, originalExpectation: '換一段' })).toBe(true);
    expect(
      isDraftDirty(initial, {
        ...initial,
        selectedOptions: { ...initial.selectedOptions, reading_method: ['self'] },
      }),
    ).toBe(true);
    expect(isDraftDirty(initial, { ...initial, startDate: '2030-01-01' })).toBe(true);
    expect(isDraftDirty(initial, { ...initial, recurrenceDays: [1, 2] })).toBe(true);
    expect(isDraftDirty(initial, { ...initial, durationDays: 42 })).toBe(true);
    expect(isDraftDirty(initial, { ...initial, reminderMode: 'on_task_day' })).toBe(true);
  });

  it('改里程碑會 dirty', () => {
    const initial = readingDraft();
    const milestones = initial.milestones.map((m, i) =>
      i === 0 ? { ...m, title: '換個說法' } : m,
    );
    expect(isDraftDirty(initial, { ...initial, milestones })).toBe(true);
  });

  it('改回原值後不再 dirty（不是一路 true 到底）', () => {
    const initial = readingDraft();
    const changed = { ...initial, title: '改過的名稱' };
    expect(isDraftDirty(initial, changed)).toBe(true);

    const restored = { ...changed, title: initial.title };
    expect(isDraftDirty(initial, restored)).toBe(false);
  });
});
