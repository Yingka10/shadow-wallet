// task-ai-recommendation — entry point
//
// 這個檔案只做一件事：把 handler 掛上去。
//
// 為什麼 handler 在另一個檔案：`Deno.serve` 在模組載入時就會開 port，
// 測試 import 它會直接佔住通訊埠。常見的做法是用 `import.meta.main` 或
// 一個 test-mode 環境變數把它關掉 —— 但兩者都讓「會不會啟動」取決於
// 執行環境的細節，而那件事在部署前**沒有辦法在本機驗證**。
//
// 拆成兩個檔案就沒有這個問題：entry 永遠啟動，測試永遠 import handler.ts。
//
// ⚠️ 尚未部署、尚未接 UI。部署前檢查見 README.md。

import { handleRequest } from './handler.ts';

Deno.serve(handleRequest);
