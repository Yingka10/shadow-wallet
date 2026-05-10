import type { TaskCategory } from '../types/database';

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
const MODEL = 'gemini-2.0-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = (await res.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates[0]?.content.parts[0]?.text ?? '';
}

export type ClassifyTaskResult = {
  category: TaskCategory;
  base_time_min: number;
  difficulty: number;
  reason: string;
};

/**
 * Classifies a task name into Task-A/B/C/D and estimates base_time_min and difficulty.
 * Falls back to category='B', base_time_min=5, difficulty=1.0 on any error.
 */
export async function classifyTask(taskName: string): Promise<ClassifyTaskResult> {
  const prompt = `你是一個兒童教養任務分類助手。
根據以下任務名稱，判斷它屬於哪個類別，並估算完成時間和難度。
任務名稱：${taskName}
類別定義：
A = 基本生活自理（刷牙、整理書包）
B = 家庭本分（倒垃圾、洗碗）
C = 超出本分貢獻（照顧弟妹、主動幫忙）
D = 學習成長里程碑（連續練習、學習新技能）
回傳 JSON：{"category":"B","base_time_min":5,"difficulty":1.0,"reason":"這是家庭成員的基本分工"}
只回傳 JSON，不要其他文字。`;

  const fallback: ClassifyTaskResult = {
    category: 'B',
    base_time_min: 5,
    difficulty: 1.0,
    reason: '預設分類',
  };

  try {
    console.log('[aiAgent.classifyTask] input:', taskName);
    const raw = await callGemini(prompt);
    console.log('[aiAgent.classifyTask] output:', raw);
    // Strip markdown code fences if Gemini wraps the JSON
    const cleaned = raw.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned) as ClassifyTaskResult;
    if (!['A', 'B', 'C', 'D'].includes(parsed.category)) return fallback;
    return parsed;
  } catch (err) {
    console.warn('[aiAgent.classifyTask] fallback due to error:', err);
    return fallback;
  }
}

/**
 * Generates a gentle suggestion for a parent when a child fails a task 3+ days in a row.
 * Falls back to a template string on any error.
 */
export async function generateDegradeSuggestion(
  taskName: string,
  age: number,
  days: number,
): Promise<string> {
  const prompt = `任務名稱：${taskName}
孩子年齡：${age}歲
連續未完成天數：${days}天
請給家長一個簡短的建議（50字以內），說明可以怎麼調整這個任務，語氣要溫和不批判。
只回傳建議文字，不要其他格式。`;

  const fallback = `「${taskName}」連續 ${days} 天未完成，可以試著和孩子討論是否調整難度或時間。`;

  try {
    console.log('[aiAgent.generateDegradeSuggestion] input:', { taskName, age, days });
    const text = await callGemini(prompt);
    console.log('[aiAgent.generateDegradeSuggestion] output:', text);
    return text.trim() || fallback;
  } catch (err) {
    console.warn('[aiAgent.generateDegradeSuggestion] fallback due to error:', err);
    return fallback;
  }
}

export type WeeklyInsightSummary = {
  completionRate: number;
  totalTimeSavedMin: number;
  overrideCount: number;
};

/**
 * Generates a natural-language weekly insight for the parent report.
 * Stub — full implementation in Flow 3.
 */
export async function generateWeeklyInsight(
  _summary: WeeklyInsightSummary,
): Promise<string> {
  // Flow 3 will implement the full prompt.
  return '本週洞察即將推出。';
}
