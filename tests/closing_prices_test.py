import importlib.util
import unittest
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
if __name__ == '__main__': unittest.main()
