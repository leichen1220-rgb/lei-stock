import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('closes', Path(__file__).resolve().parents[1] / 'scripts/update_closing_prices.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class ClosingPricesTest(unittest.TestCase):
    def test_dates(self):
        self.assertEqual(m.parse_date('1151008'), '2026-10-08')
        self.assertEqual(m.parse_date('115/10/08'), '2026-10-08')
        with self.assertRaises(ValueError): m.parse_date('1150230')
        with self.assertRaises(ValueError): m.parse_date('9991231')
    def test_exact_codes_and_missing_close(self):
        rows = [{'Code': str(i), 'Date': '1151008', 'ClosingPrice': '12.5'} for i in range(1000, 1100)]
        rows += [{'Code': '006201', 'Date': '1151008', 'ClosingPrice': '70'}, {'Code': '6201', 'Date': '1151008', 'ClosingPrice': '50'}, {'Code': '00933B', 'Date': '1151008', 'ClosingPrice': '--'}, {'Code': '123456', 'Date': '1151008', 'ClosingPrice': '1'}]
        q = m.normalize_rows('TWSE', rows)
        self.assertEqual(q['006201']['close_price'], 70)
        self.assertEqual(q['6201']['close_price'], 50)
        self.assertNotIn('00933B', q)
        self.assertNotIn('123456', q)
        with self.assertRaises(ValueError): m.normalize_rows('TWSE', [])
    def test_no_regression_or_fabrication(self):
        old = {'0056': {'price_date': '2026-10-08', 'close_price': 30}, '00933B': {'price_date': '2026-10-07', 'close_price': 12}}
        incoming = {'0056': {'price_date': '2026-10-07', 'close_price': 29}}
        self.assertEqual(m.merge_market(old, incoming), old)
    def test_csv_content_dates_and_exact_codes(self):
        text = '\ufeff日期,證券代號,收盤價\r\n'
        text += ''.join('1151008,%s,12.5\r\n' % i for i in range(1000, 1100))
        text += '1151008,006201,"1,234.50"\r\n1151008,6201,50\r\n1151008,00933B,--\r\n'
        quotes = m.parse_twse_csv(text)
        self.assertEqual(quotes['006201']['close_price'], 1234.5)
        self.assertEqual(quotes['6201']['close_price'], 50)
        self.assertEqual(quotes['6201']['price_date'], '2026-10-08')
        self.assertNotIn('00933B', quotes)
        for invalid in ('<html>blocked</html>', '日期,證券代號,收盤價\n1151008,0056,30'):
            with self.assertRaises(ValueError): m.parse_twse_csv(invalid)
    def test_select_newer_and_equal_date_preference(self):
        old = {'0056': {'price_date': '2026-10-07', 'close_price': 30}}
        new = {'0056': {'price_date': '2026-10-08', 'close_price': 31}}
        self.assertEqual(m.select_latest_source([('csv', new), ('api', old)]), (new, 'csv'))
        self.assertEqual(m.select_latest_source([('csv', old), ('api', new)]), (new, 'api'))
        self.assertEqual(m.select_latest_source([('csv', new), ('api', new)]), (new, 'csv'))
    def test_one_failed_source_uses_other(self):
        quotes = {'0056': {'price_date': '2026-10-08', 'close_price': 31}}
        def fetch(market, url, csv_format=False):
            if csv_format: raise ValueError('CSV unavailable')
            return quotes
        with patch.object(m, 'fetch_source', side_effect=fetch):
            self.assertEqual(m.fetch_market('TWSE'), (quotes, m.SOURCES['TWSE'][0]))
        with patch.object(m, 'fetch_source', side_effect=ValueError('Both unavailable')):
            with self.assertRaises(ValueError): m.fetch_market('TWSE')
if __name__ == '__main__': unittest.main()
