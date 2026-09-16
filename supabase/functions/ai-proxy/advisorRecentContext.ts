export type AdvisorRecentFamilyContext = {
  completedWeeks?: Array<{
    weekStart?: unknown;
    weekEnd?: unknown;
    tasks?: Array<{
      taskName?: unknown;
      completedCount?: unknown;
      selfStartedCount?: unknown;
      remindedCount?: unknown;
    }>;
  }>;
  weeklyMemories?: Array<{
    weekStart?: unknown;
    salientLines?: Array<{
      key?: unknown;
      label?: unknown;
      status?: unknown;
      facts?: unknown;
    }>;
    allStable?: unknown;
  }>;
  latestSharedPlanChange?: {
    taskName?: unknown;
    changedAt?: unknown;
    changes?: unknown;
  } | null;
};

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, 99)
    : 0;
}

/**
 * ai-proxy 邊界再次收斂大小與型別。Client 傳來的是參考資料，不因為 TypeScript
 * 宣告過就直接信任；異常列直接省略，不讓一筆壞資料污染整份 prompt。
 */
export function formatAdvisorRecentContext(
  context: AdvisorRecentFamilyContext | undefined,
): string {
  if (!context) return '';

  const weekSections = (Array.isArray(context.completedWeeks) ? context.completedWeeks : [])
    .slice(-4)
    .map(week => {
      const weekStart = safeText(week?.weekStart, 10);
      const weekEnd = safeText(week?.weekEnd, 10);
      if (!weekStart || !weekEnd || !Array.isArray(week?.tasks)) return null;
      const taskLines = week.tasks
        .slice(0, 8)
        .map(task => {
          const taskName = safeText(task?.taskName, 40);
          if (!taskName) return null;
          const completed = safeCount(task.completedCount);
          const selfStarted = safeCount(task.selfStartedCount);
          const reminded = safeCount(task.remindedCount);
          const startMode = selfStarted + reminded > 0
            ? `；其中自行開始 ${selfStarted} 次、提醒後開始 ${reminded} 次`
            : '';
          return `  - ${taskName}：完成 ${completed} 次${startMode}`;
        })
        .filter((line): line is string => line != null);
      if (taskLines.length === 0) return null;
      return `- ${weekStart}～${weekEnd}\n${taskLines.join('\n')}`;
    })
    .filter((section): section is string => section != null);

  const memorySections = (Array.isArray(context.weeklyMemories) ? context.weeklyMemories : [])
    .slice(-8)
    .map(memory => {
      const weekStart = safeText(memory?.weekStart, 10);
      if (!weekStart) return null;
      if (memory?.allStable === true) return `- ${weekStart}\n  - 各成長線大致穩定`;
      if (!Array.isArray(memory?.salientLines)) return null;
      const lineSections = memory.salientLines
        .slice(0, 2)
        .map(line => {
          const key = safeText(line?.key, 1);
          const label = safeText(line?.label, 40);
          const status = line?.status === 'needs_discussion'
            ? '需要一起討論'
            : line?.status === 'watch'
              ? '先觀察'
              : null;
          if (!key || !['A', 'B', 'C', 'D'].includes(key) || !label || !status) return null;
          const facts = Array.isArray(line?.facts)
            ? line.facts
                .slice(0, 3)
                .map(fact => safeText(fact, 120))
                .filter((fact): fact is string => fact != null)
            : [];
          if (facts.length === 0) return null;
          return `  - ${label}：${status}\n${facts.map(fact => `    - ${fact}`).join('\n')}`;
        })
        .filter((line): line is string => line != null);
      return lineSections.length > 0 ? `- ${weekStart}\n${lineSections.join('\n')}` : null;
    })
    .filter((section): section is string => section != null);

  const change = context.latestSharedPlanChange;
  const changeTaskName = safeText(change?.taskName, 40);
  const changedAt = safeText(change?.changedAt, 35);
  const changes = Array.isArray(change?.changes)
    ? change.changes
        .slice(0, 3)
        .map(item => safeText(item, 80))
        .filter((item): item is string => item != null)
    : [];

  const sections: string[] = [];
  if (weekSections.length > 0) {
    sections.push(`【最近幾個已結束週期的完成紀錄（由舊到新）】\n${weekSections.join('\n')}`);
  }
  if (memorySections.length > 0) {
    sections.push(`【較早的跨週脈絡（由舊到新，僅用來辨識變化）】\n${memorySections.join('\n')}`);
  }
  if (changeTaskName && changedAt && changes.length > 0) {
    sections.push(
      `【最近一次已確認的共同版本變動】\n- ${changeTaskName}（${changedAt}）\n`
      + changes.map(item => `  - ${item}`).join('\n'),
    );
  }
  return sections.length > 0 ? `\n${sections.join('\n')}\n` : '';
}
