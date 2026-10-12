# lei-stock

## 收盤資料（V1.1.1）

上市股票及 ETF 同時讀取證交所原始 CSV 與 OpenAPI，以內容的交易日期選擇較新來源，同日優先 CSV。上櫃使用櫃買 OpenAPI。單一來源失敗仍可使用另一來源；全部失敗或資料倒退則保留先前價格與原日期。

- 原始 CSV：https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data
- OpenAPI：https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
- 櫃買：https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes

政府資料開放平臺的個股日成交資料標示每 1 日更新，但未查到此 OpenAPI 固定發布時刻的官方承諾。下載檔名與下載時間不作為報價日期。2026-10-12 下午實測原始 CSV 內容為 1151012，OpenAPI 為 1151008，故不能假設兩者同步。

GitHub 排程於台灣時間每日 07:43、週一至週五 14:43–19:43 每小時抓取，實際執行可能延後。「更新收盤價」重新讀取已發布快照，不會立即觸發背景抓取，也不是盤中即時行情。
