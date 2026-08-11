# P0-4 家長首頁 Proposal Card 設計

## 目標

家長首頁針對目前選中的孩子，顯示同家庭、狀態為 `proposed` 的最新 1–3 筆孩子提案。此區是唯讀的對話提示，不提供核准、拒絕、轉換、試行或 AI 建議。

## 資料與可信度

- 直接讀取 P0-1 `child_proposals`，以 `family_id`、`child_id`、`status = proposed` 篩選，依 `created_at` 新到舊，最多三筆。
- 卡片只顯示提案列實際存在的孩子原話、動機、節奏與回饋偏好。
- `hopes_for_coin` 顯示為「孩子希望有成長幣回饋」，不宣稱已核准或已有幣值。
- cadence 欄位不足時顯示「還沒決定，想一起討論」，不推導計畫或 AI 建議。

## 架構

1. 在既有 `SupabaseChildProposalService` 增加唯讀列表方法。
2. `useParentProposals` 管理 loading、error、refresh 與換孩子時的過期請求保護。
3. 純 presentation helper 負責 cadence、回饋偏好及卡片 view model。
4. `ParentProposalSection` 負責 loading、empty、error、卡片渲染。
5. `ParentHomeTablet` 將此區放在主欄最前方，並在 focus 與選中孩子改變時刷新。

## 狀態與文案

- loading：安靜的載入提示。
- empty：整個 section 隱藏，不在首頁留下沒有待處理事項的空卡。
- error：顯示讀取失敗與重試，不阻斷整個首頁。
- proposed：中性標籤「孩子想和你聊聊」，不使用審核或行政語言。

## 不在範圍

不修改 proposal/version schema、狀態機、wallet、weekly report、parent home 其他資料政策；不建立 task、不寫 trial、不呼叫 AI、不提前做 P0-5。
