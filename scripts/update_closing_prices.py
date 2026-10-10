"""Download public TWSE/TPEx closes only. No accounts or portfolio data."""
import datetime as dt
import json
import math
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

SOURCES = {
    'TWSE': ('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', 'Code', 'ClosingPrice'),
    'TPEX': ('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', 'SecuritiesCompanyCode', 'Close'),
}
OUTPUT = Path(__file__).resolve().parents[1] / 'data/closing-prices.json'

def parse_date(value):
    text = str(value).strip().replace('/', '').replace('-', '')
    if not text.isdigit() or len(text) not in (7, 8):
        raise ValueError('Invalid trading date')
    year = int(text[:-4]) + (1911 if len(text) == 7 else 0)
    day = dt.date(year, int(text[-4:-2]), int(text[-2:]))
    if day > dt.datetime.now(ZoneInfo('Asia/Taipei')).date():
        raise ValueError('Future trading date')
    return day.isoformat()

def normalize_rows(market, rows):
    if not isinstance(rows, list) or len(rows) < 100:
        raise ValueError('Incomplete official response')
    _, code_key, price_key = SOURCES[market]
    quotes = {}
    for row in rows:
        code = str(row.get(code_key, '')).strip().upper()
        # Ordinary shares and 00-prefixed ETFs; exclude warrants.
        if not re.fullmatch(r'(?:\d{4}|00\d{3,4}[A-Z]?)', code):
            continue
        raw_price = str(row.get(price_key, '')).strip().replace(',', '')
        if raw_price in ('', '--', '-', '---', 'None'):
            continue
        price = float(raw_price)
        if not math.isfinite(price) or price <= 0:
            continue
        date = parse_date(row.get('Date', ''))
        quote = {'ticker': code, 'price_date': date, 'close_price': price, 'market': market}
        if code in quotes and quotes[code] != quote:
            raise ValueError('Conflicting official symbol')
        quotes[code] = quote
    if len(quotes) < 100:
        raise ValueError('Too few valid closes')
    return quotes

def fetch_market(market):
    for attempt in range(3):
        try:
            request = urllib.request.Request(SOURCES[market][0], headers={'User-Agent': 'Mozilla/5.0 (LeiStockClosingPrices)', 'Accept': 'application/json', 'Connection': 'close'})
            with urllib.request.urlopen(request, timeout=40) as response:
                return normalize_rows(market, json.load(response))
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2)

def merge_market(previous, incoming):
    result = dict(previous)
    for ticker, quote in incoming.items():
        if ticker not in result or quote['price_date'] >= result[ticker]['price_date']:
            result[ticker] = quote
    return result

def main():
    old = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {'quotes': [], 'sources': {}}
    all_quotes = {q['ticker']: q for q in old['quotes']}
    status = {}
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {market: pool.submit(fetch_market, market) for market in SOURCES}
        for market, future in futures.items():
            try:
                incoming = future.result()
                old_market = {k: q for k, q in all_quotes.items() if q['market'] == market}
                if old_market and max(q['price_date'] for q in incoming.values()) < max(q['price_date'] for q in old_market.values()):
                    raise ValueError('Official response regressed')
                all_quotes = merge_market(all_quotes, incoming)
                status[market] = {'url': SOURCES[market][0], 'price_date': max(q['price_date'] for q in incoming.values()), 'status': 'ok'}
            except Exception as error:
                status[market] = {**old.get('sources', {}).get(market, {}), 'url': SOURCES[market][0], 'status': 'retained', 'error': type(error).__name__}
                print(market + ': retained previous prices (' + type(error).__name__ + ')')
    if not all_quotes:
        raise RuntimeError('No official prices available; previous file left unchanged')
    if old.get('quotes') == sorted(all_quotes.values(), key=lambda q: q['ticker']) and old.get('sources') == status:
        print('No changes in official closing prices')
        return
    result = {'schema_version': 1, 'updated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'sources': status, 'quotes': sorted(all_quotes.values(), key=lambda q: q['ticker'])}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    temp.replace(OUTPUT)
    print('Official close snapshot: ' + str(len(result['quotes'])) + ' symbols; ' + str({k: v.get('price_date') for k, v in status.items()}))

if __name__ == '__main__':
    main()
