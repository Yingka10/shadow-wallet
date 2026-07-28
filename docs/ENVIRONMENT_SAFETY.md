# 環境安全｜連到哪一個 Supabase

> 本文件不含任何網址、金鑰、密碼或真實 project ref。
> 需要那些值時請看本機的 `.env.local`（已被 `.gitignore` 擋住）或 Supabase Dashboard。

---

## 為什麼需要這份文件

staging 與正式專案的 App 畫面**完全一樣**。同樣的版面、同樣的任務卡、同樣能登入。
在哪一邊操作，過去只能靠自己記得。

第七階段 D 的驗收期間發生過兩次相關事故：

1. `.env.local` 指向 staging、`.env` 指向 production，而 Expo 讓前者蓋過後者。
   驗收完把 `.env.local` 改名後，App **無聲地連回正式專案** —— 沒有任何提示。
2. 反過來也發生了：`.env.local` 還在時去測原本的系統，正式帳號登不進去，
   看起來像帳號壞了，實際上是連到了只有 QA 帳號的 staging。

兩次都不是程式錯誤，是「連哪裡」這件事沒有被寫下來、也沒有被檢查。

---

## 三種環境

| APP_ENV | 用途 | Supabase 專案 | 資料 |
|---|---|---|---|
| `development` | 本機開發 | 自己的測試專案 | 可隨意破壞 |
| `staging` | 驗收、Demo 排練、E2E | staging 專案 | QA 假資料，可重置 |
| `production` | 正式使用 | 正式專案 | **真實家庭資料** |
| `test` | 自動化測試 | 不連線（注入假值） | 無 |

`production` **不是本機開發的 fallback**。它由部署環境明確提供。

---

## 環境變數

| 變數 | 必填 | 說明 |
|---|---|---|
| `EXPO_PUBLIC_APP_ENV` | ✅ | `development` / `staging` / `production` / `test`。**缺這個 App 會拒絕啟動** |
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | 專案**根** URL。不要填 `/rest/v1`、`/auth/v1` 這類 endpoint |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| `EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF` | development / staging 必填 | 你**預期**連到的 project ref。與 URL 解析出來的不一致時 App 停止連線 |
| `EXPO_PUBLIC_ENV_BADGE_MODE` | | `show` / `hide` / `auto`（預設 `auto`） |

### 檔案分工

| 檔案 | 內容 | 進 Git？ |
|---|---|---|
| `.env.example` | 只有變數名稱與 placeholder | ✅ |
| `.env.local` | 本機開發／staging 的實際值 | ❌ 已 ignore |
| `.env.production.local` | 需要時由部署或本機人工提供 | ❌ 已 ignore |
| `.env` | **不應再放真實 production 值** | ❌ 已 ignore |

`.env` 之所以危險，是因為它是 Expo 的最後一層 fallback：任何一層失敗都會落到它。
把正式專案放在最後一層，等於把「設定出錯」的預設結果訂成「連正式資料庫」。

---

## App 啟動時的檢查

`src/lib/environment/supabaseEnvironment.ts` 是純函式，`src/lib/environment/index.ts`
是唯一讀 `process.env` 的地方，`src/lib/supabase.ts` 在 `createClient` **之前**驗證。

驗證項目：

1. `APP_ENV` 必須明確宣告，且是四個合法值之一
2. `SUPABASE_URL` 必須是專案根 URL（拒絕 `/rest/v1`、`/auth/v1`、`/functions/v1`、query、fragment）
3. 必須解析得出 project ref
4. `development` / `staging` 必須宣告 expected ref，且與 URL 的 ref 相同
5. `production` 必須明確宣告，不會由其他值推導出來

任何一項失敗：

- **不建立 Supabase client**（改用一碰就丟錯的替身，確保沒有請求送到別的地方）
- App 顯示整頁的「Supabase 環境設定不完整，App 未連線。」
- console 印出錯誤類型與說明 —— **不印 anon key、不印密碼、不印連線字串**
- **不會**退回 `.env` 的 production，也不會自動挑一個專案

畫面上不顯示 URL 與 ref：那一頁最可能被截圖。細節留在 console。

---

## 環境標示

| APP_ENV | 標示 |
|---|---|
| `staging` | `STAGING` |
| `development` | `DEV` |
| `production` / `test` | 不顯示 |

小尺寸、`pointerEvents="none"`（不擋抽屜與側欄）、不是紅色警告
（staging 不是錯誤狀態，畫成警示只會讓人學會忽略它）、不可點擊、
意思由文字承擔而不是顏色。螢幕閱讀器讀到「目前使用測試環境」。

`EXPO_PUBLIC_ENV_BADGE_MODE=hide` 可以在正式 Demo 截圖時關掉標示。
**關掉的只有標示，驗證照跑** —— 有測試盯著這一點。

---

## 常見操作

### 取得 project ref

Supabase Dashboard → 專案 → Settings → General，或從專案 URL 的第一段子網域。
Ref 不是密碼，但它是**本機環境狀態**，所以不寫進版控。

### 連到 staging

```bash
supabase link --project-ref <STAGING_REF>
```

`supabase/.temp/` 記錄這個選擇，**已從 Git 移除追蹤**（`git rm -r --cached`）並加入
`.gitignore`。每個人 link 到自己的目標，不會互相產生 diff，也不會把別人的目標帶進 PR。

App 這一邊改 `.env.local`：

```
EXPO_PUBLIC_APP_ENV=staging
EXPO_PUBLIC_SUPABASE_URL=https://<STAGING_REF>.supabase.co
EXPO_PUBLIC_EXPECTED_SUPABASE_PROJECT_REF=<STAGING_REF>
```

### 切回 production

把 `.env.local` 改名（例如 `.env.staging.local`，`.gitignore` 的 `.env*.local` 一樣擋著），
再提供正式值。**環境變數是編進 bundle 的**，所以一定要清 cache 重啟：

```bash
npx expo start -c
```

少了 `-c`，改了設定也不會生效 —— 這正是「以為切過去了其實沒有」的來源。

### CLI 目前連哪裡

```bash
cat supabase/.temp/project-ref
supabase migration list --linked
```

---

## 規則

- 任何寫入遠端資料庫的指令，執行前先印出目標 project ref 並比對
- `production` 不做為 fallback，設定不完整就讓它失敗
- 真實值只存在本機 ignored 檔案與部署環境，不進 Git、不進文件、不進測試
- 環境值只在 `src/lib/environment/index.ts` 讀取一次，其他地方不再讀 `process.env`
