import { supabase } from './supabase';
import type { AgeGroup, BaumrindType, AccountType, WalletType, MotivationLevel } from '../types/database';

// ── 問卷定義 ─────────────────────────────────────────────────

export interface QuestionOption {
  label: string;
  /** 要求程度：1=高，0=低 */
  demand: 0 | 1;
  /** 回應程度：1=高，0=低 */
  responsiveness: 0 | 1;
}

export interface Question {
  id: number;
  scenario: string;
  options: QuestionOption[];
}

/**
 * 6 道情境選擇題，各選項同時帶 demand / responsiveness 分數，
 * 最終加總判斷 Baumrind 教養類型。
 */
export const QUESTIONS: Question[] = [
  {
    id: 1,
    scenario: '孩子連續三天忘記完成某個任務，你通常怎麼做？',
    options: [
      { label: '再等等，讓孩子自己想起來', demand: 0, responsiveness: 0 },
      { label: '提醒一次，但不強制執行', demand: 0, responsiveness: 1 },
      { label: '明確設截止日，說明沒做的後果', demand: 1, responsiveness: 1 },
      { label: '直接取消這個任務', demand: 1, responsiveness: 0 },
    ],
  },
  {
    id: 2,
    scenario: '孩子說「這任務太難了，我不想做」，你的第一反應？',
    options: [
      { label: '立刻幫他換一個簡單的', demand: 0, responsiveness: 0 },
      { label: '聽他說完，一起找出哪裡難', demand: 0, responsiveness: 1 },
      { label: '說有些事就是要做，但可以幫他', demand: 1, responsiveness: 1 },
      { label: '要求他繼續，沒有商量空間', demand: 1, responsiveness: 0 },
    ],
  },
  {
    id: 3,
    scenario: '孩子主動完成了一件困難的任務，你通常怎麼反應？',
    options: [
      { label: '給幣就好，不特別說什麼', demand: 0, responsiveness: 0 },
      { label: '口頭說「做得好」', demand: 0, responsiveness: 1 },
      { label: '問他做這件事的感受，聊一聊', demand: 0, responsiveness: 1 },
      { label: '給額外獎勵或更多幣', demand: 1, responsiveness: 1 },
    ],
  },
  {
    id: 4,
    scenario: '孩子情緒很差、不想做任何事，你會？',
    options: [
      { label: '完全不提任務，讓他自己處理', demand: 0, responsiveness: 0 },
      { label: '讓他休息，情緒好了再說', demand: 0, responsiveness: 1 },
      { label: '說今天可以休息，但明天要補回來', demand: 1, responsiveness: 1 },
      { label: '告訴他情緒是情緒，任務還是要做', demand: 1, responsiveness: 0 },
    ],
  },
  {
    id: 5,
    scenario: '孩子想跟你說話，你正在忙，通常你會？',
    options: [
      { label: '請他等，繼續手邊的事', demand: 0, responsiveness: 0 },
      { label: '先簡短回應，等忙完再認真聊', demand: 0, responsiveness: 1 },
      { label: '放下手邊的事，認真聽他說', demand: 1, responsiveness: 1 },
      { label: '點個頭，但其實沒認真在聽', demand: 0, responsiveness: 0 },
    ],
  },
  {
    id: 6,
    scenario: '孩子跟你討價還價任務的幣值，你會？',
    options: [
      { label: '直接答應，省麻煩', demand: 0, responsiveness: 0 },
      { label: '聽他的理由，覺得合理就調整', demand: 0, responsiveness: 1 },
      { label: '願意討論，但最終由你決定', demand: 1, responsiveness: 1 },
      { label: '不接受討論，說好的就是說好的', demand: 1, responsiveness: 0 },
    ],
  },
];

// ── 答題記錄 ──────────────────────────────────────────────────

export interface SelectedAnswer {
  questionId: number;
  /** 在該題的選項索引，用來判斷 UI 哪個選項被選中 */
  optionIndex: number;
  demand: 0 | 1;
  responsiveness: 0 | 1;
}

// ── 計算函數 ──────────────────────────────────────────────────

export function calcAgeGroup(birthDate: string): AgeGroup {
  const birth = new Date(birthDate);
  const now = new Date();
  const ageMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (ageMonths < 48) return '2-4';
  if (ageMonths < 72) return '4-6';
  if (ageMonths < 108) return '6-9';
  return '9-12';
}

/**
 * 兩個維度加總，各自過半即視為「高」。
 * 高要求 × 高回應 → elite_high_control
 * 高要求 × 低回應 → pragmatic_labor
 * 低要求 × 高回應 → guilt_compensate
 * 低要求 × 低回應 → free_fatigue
 */
export function calcBaumrindType(answers: SelectedAnswer[]): BaumrindType {
  const total = answers.length;
  const demandScore = answers.reduce((s, a) => s + a.demand, 0);
  const responsScore = answers.reduce((s, a) => s + a.responsiveness, 0);
  const threshold = total / 2;
  const highDemand = demandScore >= threshold;
  const highRespons = responsScore >= threshold;
  if (highDemand && highRespons) return 'elite_high_control';
  if (highDemand && !highRespons) return 'pragmatic_labor';
  if (!highDemand && highRespons) return 'guilt_compensate';
  return 'free_fatigue';
}

// ── 帳號建立（第一步驟）─────────────────────────────────────────

/**
 * 在問卷第一步就建立 Auth 帳號，讓後續 DB 寫入有完整 session。
 * @throws Error('EMAIL_TAKEN') 若 Email 已被使用
 */
export async function signUpUser(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already registered') || msg.includes('already been registered') || error.status === 422) {
      throw new Error('EMAIL_TAKEN');
    }
    throw new Error(`建立帳號失敗：${error.message}`);
  }
  if (!data.session) {
    throw new Error(
      '請至 Supabase → Authentication → Settings，關閉「Confirm email」設定後再試一次。'
    );
  }
}

// ── 寫入 Supabase ─────────────────────────────────────────────

export interface AddChildInput {
  familyId: string;
  childNickname: string;
  /** ISO 格式：YYYY-MM-DD */
  childBirthDate: string;
  /** 4 位數字 PIN，孩子登入用 */
  childPin?: string;
}

export interface AddChildResult {
  childId: string;
  ageGroup: AgeGroup;
}

/**
 * 已登入家長新增第二個（或更多）孩子到現有家庭。
 * 不建立 family / parent，只建立 child + child_profile + wallet(s)。
 */
export async function addChildToFamily(input: AddChildInput): Promise<AddChildResult> {
  const { familyId, childNickname, childBirthDate, childPin } = input;

  const ageGroup = calcAgeGroup(childBirthDate);
  const accountType: AccountType = ageGroup === '9-12' ? 'DOUBLE' : 'SINGLE';

  const { data: childData, error: childError } = await supabase
    .from('children')
    .insert({
      family_id: familyId,
      nickname: childNickname,
      birth_date: childBirthDate,
      age_group: ageGroup,
      account_type: accountType,
      ...(childPin ? { pin_code: childPin } : {}),
    })
    .select('id')
    .single();
  if (childError) throw new Error(`建立孩子資料失敗：${childError.message}`);
  const childId = childData.id;

  const { error: profileError } = await supabase.from('child_profiles').insert({
    child_id: childId,
    motivation_level: 'external' as MotivationLevel,
  });
  if (profileError) throw new Error(`建立孩子設定失敗：${profileError.message}`);

  const walletInserts: { child_id: string; wallet_type: WalletType; balance: number }[] = [
    { child_id: childId, wallet_type: 'spending', balance: 0 },
    ...(accountType === 'DOUBLE'
      ? [{ child_id: childId, wallet_type: 'saving' as WalletType, balance: 0 }]
      : []),
  ];
  const { error: walletError } = await supabase.from('wallets').insert(walletInserts);
  if (walletError) throw new Error(`建立錢包失敗：${walletError.message}`);

  return { childId, ageGroup };
}

export interface OnboardingInput {
  parentName: string;
  familyName: string;
  answers: SelectedAnswer[];
  childNickname: string;
  /** ISO 格式：YYYY-MM-DD */
  childBirthDate: string;
  /** 4 位數字 PIN，孩子登入用 */
  childPin?: string;
}

export interface OnboardingResult {
  familyId: string;
  childId: string;
  ageGroup: AgeGroup;
}

/**
 * 執行完整的初始設定流程（帳號建立已在第一步完成）。
 * 五段寫入（family/parent/child/child_profile/wallets）透過 RPC `submit_onboarding`
 * 在單一 transaction 內完成，中途失敗全部回滾（P1-5，取代舊版無 transaction 的多段 insert）。
 */
export async function submitOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
  const { parentName, familyName, answers, childNickname, childBirthDate, childPin } = input;

  // 使用第一步驟 signUpUser() 建立的 session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('請先完成帳號建立步驟');

  const baumrindType = calcBaumrindType(answers);
  const ageGroup = calcAgeGroup(childBirthDate);
  const accountType: AccountType = ageGroup === '9-12' ? 'DOUBLE' : 'SINGLE';

  const { data, error } = await supabase.rpc('submit_onboarding', {
    p_family_name: familyName,
    p_parent_name: parentName,
    p_baumrind_type: baumrindType,
    p_child_nickname: childNickname,
    p_child_birth_date: childBirthDate,
    p_child_age_group: ageGroup,
    p_child_account_type: accountType,
    p_child_pin: childPin ?? null,
  });
  if (error) throw new Error(`初始設定失敗：${error.message}`);

  const result = data as { familyId: string; childId: string };
  return { familyId: result.familyId, childId: result.childId, ageGroup };
}
