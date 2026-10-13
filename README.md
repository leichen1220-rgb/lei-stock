# lei-stock

## 收盤資料（V1.1.1）

上市股票及 ETF 同時讀取證交所原始 CSV 與 OpenAPI，以內容的交易日期選擇較新來源，同日優先 CSV。上櫃使用櫃買 OpenAPI。單一來源失敗仍可使用另一來源；全部失敗或資料倒退則保留先前價格與原日期。

- 原始 CSV：https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data
- OpenAPI：https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
- 櫃買：https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes

政府資料開放平臺的個股日成交資料標示每 1 日更新，但未查到此 OpenAPI 固定發布時刻的官方承諾。下載檔名與下載時間不作為報價日期。2026-10-12 下午實測原始 CSV 內容為 1151012，OpenAPI 為 1151008，故不能假設兩者同步。

GitHub 排程於台灣時間每日 07:43、週一至週五 14:43–19:43 每小時抓取，實際執行可能延後。「更新收盤價」重新讀取已發布快照，不會立即觸發背景抓取，也不是盤中即時行情。


## 脫敏公開持股（V1.2.0）

固定網址：`https://leichen1220-rgb.github.io/lei-stock/portfolio.json`。
**首次成功發布後才會建立此檔案。尚未設定後端時網址為 404，不能當成空持股。**

- 網站持股總覽與後端共用 `supabase/functions/_shared/portfolio-core.js` 的股數加總。只有現股及股票股利影響股數；以十進位加總避免浮點殘值。保留代號原文、小數股數，剔除股數恰為 0 者；負持股或缺少名稱會阻止發布。
- 登入後成功同步（包括新增、修改、刪除交易及股票名稱儲存）會呼叫 `portfolio-publisher`。可在持股總覽的「公開持股同步」重新發布。未登入不呼叫，讀取失敗不發布。直接在資料庫或其他工具修改，需下次網站同步後才發布；沒有背景掃描私人交易的排程。
- 函式驗證登入 JWT，限制一個設定好的帳號，並帶同一個使用者 JWT 和 owner 條件，透過原本 RLS 讀取最少欄位。沒有 service-role key、沒有新增資料表／SQL／RLS 或匿名 SELECT。拒絕客戶端提供持股、路徑或帳號。
- 寫入 GitHub 的檔案內容一律重新建立 `{code,name,shares}`，沒有其他欄位、時間戳或包裝物件。GitHub 憑證僅在 Supabase 函式 secrets，瀏覽器及公開 JSON 沒有憑證。
- 每次發布先取 GitHub 檔案 SHA，再讀最新持股。衝突會重新讀取；內容相同不寫入；失敗保留上次檔案。私人帳本儲存不受發布失敗影響。
- GitHub Pages 發布及 CDN 更新可能需數分鐘，不能由本專案設定 Pages 的 HTTP 快取標頭。程式讀取時使用 `cache: 'no-store'` 並附 `?v=當下時間戳`，例如 `portfolio.json?v=1791794711108`，避開重用舊網址快取。JSON 本身是純陣列，Content-Type 由 Pages 依 .json 提供。
- 公開 repo 的 Git 歷史會保留歷次三欄持股快照；不只當下持股可見。此公開功能不應加入任何私人交易欄位。

### 一次性後端啟用

1. GitHub Settings → Developer settings → Fine-grained personal access tokens：建立只可存取 `leichen1220-rgb/lei-stock` 的 token，repository Contents 設 Read and write。不要把 token 貼進聊天、程式碼或前端。
2. 股票網站登入後，持股總覽 → 公開持股同步 → 首次設定資訊 →「複製後端帳號限制設定」。取得 `PUBLIC_PORTFOLIO_OWNER_ID` 的值。
3. Supabase **目前這個共用專案** `vhkupxpaojlzfokmdfup` → Edge Functions → Secrets：設定 `PORTFOLIO_GITHUB_TOKEN`（步驟 1）和 `PUBLIC_PORTFOLIO_OWNER_ID`（步驟 2）。`SUPABASE_URL` 及 `SUPABASE_ANON_KEY` 使用 Supabase 函式內建環境變數，無需把交易登入密碼交給 GitHub。
4. 在電腦取得最新 repo，登入並只部署這一個函式（不要執行 db push，也不需要套用任何 SQL）：

   ```sh
   git clone https://github.com/leichen1220-rgb/lei-stock.git
   cd lei-stock
   npx supabase login
   npx supabase functions deploy portfolio-publisher --project-ref vhkupxpaojlzfokmdfup
   ```

   若已有 repo，先更新既有 repo 即可。平台 JWT 驗證保持開啟；函式內再驗證 JWT 和唯一帳號限制。此部署不修改劇單或股票資料表權限。
5. 回股票網站重新整理並登入，在持股總覽按「重新發布持股」。成功後等 Pages 完成發布，開公開網址加新時間戳，確認純 JSON 與網站持股一致。

測試：`node --test tests/*.test.cjs`，含匿名／其他帳號拒絕、僅三欄、欄位洩漏檢查、十進位抵銷、股數小數、ETF 前導零、寫入衝突重讀與相同內容不提交。尚未部署時，測試以模擬 Supabase／GitHub 驗證流程；不能冒稱遠端已啟用。

`.nojekyll` 確保 Pages 原樣提供共用程式與 JSON，避免 Jekyll 略過 `_shared` 目錄。


## 每股配息（V1.2.1）

交易明細顯示每股配息；沒有儲存的每股配息時，以股息總額（扣匯費前）除以除權息日前股數推算，標示「推算」。當天現股買賣會讓配息資格不明，因此不猜測；同日股票股利不納入本次現金股息的推算基礎。原 Excel 的每股配息先前沒有獨立匯入，歷史推算不是公告值或已核對值。

在 Supabase SQL Editor 執行 `sql/08_dividend_rate.sql` 一次後重新整理，即可在新增／編輯交易記錄每股配息及配息股數。新增兩個 nullable 私人欄位，不改任何交易、RLS 或匿名權限。輸入每股配息和配息股數後會帶出總額，總額仍可依實際通知更正；清空選填欄位不會清掉原總額。匯出 Excel 與 JSON 備份保留兩個欄位；公開 portfolio.json 仍僅有 code、name、shares。Excel 未記錄率仍用原表累計股數推算，實領金額公式直接使用已存總額扣匯費，避免重算率改變歷史收支。


### V1.2.2 實領股息

交易明細外層的股息欄改為實領股息＝原總額－匯費，篩選／排序也使用同一實領金額；原總額仍可從進階篩選選擇。編輯仍保留每股配息、配息股數、原總額與匯費。匯費空白顯示待填匯費，明確輸入 0 則實領等於總額；不把未填當作已確定免匯費。
