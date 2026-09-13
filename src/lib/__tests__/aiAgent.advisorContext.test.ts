const mockInvoke = jest.fn();

jest.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

import { chatWithAdvisor, type AdvisorChatInput } from '../aiAgent';

describe('chatWithAdvisor recent family context', () => {
  it('passes the structured cross-week context to ai-proxy unchanged', async () => {
    mockInvoke.mockResolvedValue({
      data: { reply: '最近兩週都有閱讀紀錄。', suggestedAction: null },
      error: null,
    });
    const input: AdvisorChatInput = {
      childName: '承恩',
      question: '最近閱讀有比較穩定嗎？',
      doneToday: 1,
      totalToday: 2,
      longTermSummary: [],
      recentFamilyContext: {
        completedWeeks: [{
          weekStart: '2026-09-07',
          weekEnd: '2026-09-13',
          tasks: [{
            taskName: '四週閱讀計畫',
            completedCount: 2,
            selfStartedCount: 1,
            remindedCount: 1,
          }],
        }],
        latestSharedPlanChange: null,
      },
    };

    await chatWithAdvisor(input);

    expect(mockInvoke).toHaveBeenCalledWith('ai-proxy', {
      body: { type: 'advisorChat', payload: input },
    });
  });
});
