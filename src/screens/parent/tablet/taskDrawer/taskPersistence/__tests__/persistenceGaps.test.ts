// 第六階段 B — persistence gap 清單
//
// 這份清單是下一階段 migration 規格的單一來源，所以它要跟命令型別對得起來：
// 命令上有的欄位都要被分類過，沒有的欄位不該出現在清單上。

import fs from 'fs';
import path from 'path';
import { getTaskPersistenceGaps, groupGapsBySupport } from '../persistenceGaps';

describe('gap 清單本身', () => {
  const gaps = getTaskPersistenceGaps();

  it('不是空的，而且欄位路徑不重複', () => {
    expect(gaps.length).toBeGreaterThan(0);
    const fields = gaps.map(g => g.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('每一項都有可以據以動作的理由', () => {
    for (const gap of gaps) {
      expect({ field: gap.field, hasReason: gap.reason.trim().length > 0 })
        .toEqual({ field: gap.field, hasReason: true });
    }
  });

  it('需要動 schema 的一定給了建議位置', () => {
    for (const gap of gaps) {
      if (gap.support !== 'schema_required') continue;
      expect({ field: gap.field, proposed: !!gap.proposedTarget })
        .toEqual({ field: gap.field, proposed: true });
    }
  });

  it('已支援或需轉換的一定指得出目前的落點', () => {
    for (const gap of gaps) {
      if (gap.support !== 'supported' && gap.support !== 'transform_required') continue;
      expect({ field: gap.field, current: !!gap.currentTarget })
        .toEqual({ field: gap.field, current: true });
    }
  });

  it('回傳的是複本，外面改不到內部資料', () => {
    const first = getTaskPersistenceGaps();
    first[0].reason = '被改掉了';
    expect(getTaskPersistenceGaps()[0].reason).not.toBe('被改掉了');
  });

  it('四種支援程度都用得到，不是有分類但只用其中一種', () => {
    const grouped = groupGapsBySupport();
    expect(grouped.supported.length).toBeGreaterThan(0);
    expect(grouped.transform_required.length).toBeGreaterThan(0);
    expect(grouped.schema_required.length).toBeGreaterThan(0);
    expect(grouped.not_planned.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 與命令型別對齊
// ---------------------------------------------------------------------------

describe('與 CreateParentTaskCommand 對齊', () => {
  const gaps = getTaskPersistenceGaps();

  it('規格點名的每一個欄位都被分類過', () => {
    // §7C 明列、必須有結論的欄位。
    const REQUIRED_COVERAGE = [
      'task.purposeCategory',
      'task.durationType',
      'task.planMode',
      'task.source',
      'task.rewardPolicy',
      'task.completionPolicy',
      'task.originalExpectation',
      'content.selectedOptions',
      'content.customOptionValues',
      'schedule.scheduledDate',
      'schedule.startDate',
      'schedule.preferredTime',
      'schedule.estimatedMinutes',
      'schedule.reminderMode',
      'schedule.mode',
      'schedule.weeklyFrequency',
      'review.firstReviewAfterDays',
      'review.weekendReviewEnabled',
      'plan.milestones',
      'plan.supportSteps',
      'role.responsibilities',
      'metadata.taskPolicyVersion',
      'preset.familyId',
      'preset.variantId',
    ];
    const covered = new Set(gaps.map(g => g.field));
    for (const field of REQUIRED_COVERAGE) {
      expect({ field, covered: covered.has(field) }).toEqual({ field, covered: true });
    }
  });

  it('沒有把「全部存 JSONB」當成唯一答案', () => {
    const jsonbOnly = gaps.filter(g => /jsonb/i.test(g.proposedTarget ?? ''));
    const subTables = gaps.filter(g => /子表|table/i.test(g.proposedTarget ?? ''));
    expect(subTables.length).toBeGreaterThan(jsonbOnly.length);
  });

  it('family_id 的結論指向孩子所屬家庭，不是任意一筆', () => {
    const familyGap = gaps.find(g => g.field === 'familyId');
    expect(familyGap).toBeDefined();
    expect(familyGap!.reason).toContain('limit(1)');
    expect(familyGap!.proposedTarget).toContain('children.family_id');
  });

  it('weeklyFrequency 沒有被判成「不打算保存」', () => {
    const gap = gaps.find(g => g.field === 'schedule.weeklyFrequency');
    expect(gap?.support).toBe('schema_required');
  });
});

// ---------------------------------------------------------------------------
// 不進 UI 路徑
// ---------------------------------------------------------------------------

describe('只給 migration 用，不進畫面', () => {
  const DRAWER_ROOT = path.resolve(__dirname, '../..');

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'taskPersistence') continue;
        sourceFiles(full, out);
        continue;
      }
      if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  /**
   * 只留下執行期真的會載入模組的 import。
   * `import type { X } from '...'` 編譯後整行消失，不會把模組拉進 bundle ——
   * 這道檢查要擋的是「畫面真的載入了持久化層」，不是「畫面提到了它的型別」。
   */
  function runtimeSource(source: string): string {
    return source.replace(/import\s+type\s+[\s\S]*?from\s+'[^']*';/g, '');
  }

  it('抽屜的畫面程式碼沒有任何一支 import 到 persistenceGaps', () => {
    const offenders = sourceFiles(DRAWER_ROOT).filter(file =>
      /persistenceGaps|taskPersistence/.test(runtimeSource(fs.readFileSync(file, 'utf8'))),
    );
    expect(offenders.map(f => path.relative(DRAWER_ROOT, f))).toEqual([]);
  });

  it('persistenceGaps 連型別都沒有被畫面提到', () => {
    const offenders = sourceFiles(DRAWER_ROOT).filter(file =>
      /persistenceGaps/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(offenders.map(f => path.relative(DRAWER_ROOT, f))).toEqual([]);
  });
});
