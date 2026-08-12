// Shadow Wallet — 孩子提案 / 版本契約（P0-1）
//
// P0-2／3／4／6／8 一律從這裡 import，不要直接指向內部檔案 ——
// 內部拆檔會變，這個介面不會。

export * from './types';
export * from './transitions';
export * from './planDraft';
export * from './directConfirm';
export * from './materialDiff';
export * from './reviewCommands';
export {
  SupabaseChildProposalService,
  CREATE_CHILD_PROPOSAL_RPC,
  ADD_CHILD_PROPOSAL_PLAN_VERSION_RPC,
  TRANSITION_CHILD_PROPOSAL_RPC,
  RECORD_CHILD_PROPOSAL_TRIAL_RPC,
  CREATE_CHILD_PROPOSAL_ADJUSTMENT_RPC,
  CONFIRM_CHILD_PROPOSAL_RPC,
} from './childProposalService';
