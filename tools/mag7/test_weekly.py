import unittest
from weekly import valuation

def fill(ticker, side, quantity, price, fees=0, account='Taxable'):
    return dict(ticker=ticker,side=side,quantity=quantity,price=price,fees=fees,account_alias=account)

class WeeklyValuationTests(unittest.TestCase):
    def test_contributions_are_not_profit(self):
        initial = valuation([fill('GOOGL','buy',10,100)], {'GOOGL':110})
        added = valuation([fill('GOOGL','buy',10,100),fill('GOOGL','buy',5,110)], {'GOOGL':110})
        self.assertEqual(initial['price_pnl'],100)
        self.assertEqual(added['price_pnl'],100)
        self.assertEqual(added['market_value'],1650)

    def test_rotation_retains_realized_gain_and_fees(self):
        r=valuation([fill('GOOGL','buy',10,100,1),fill('GOOGL','sell',10,120,1),fill('META','buy',4,300,1)],{'META':310})
        self.assertEqual(r['market_value'],1240)
        self.assertEqual(r['price_pnl'],237)
        self.assertEqual([h['ticker'] for h in r['holdings']],['META'])

    def test_fully_sold_position(self):
        r=valuation([fill('GOOGL','buy',10,100),fill('GOOGL','sell',10,90)],{})
        self.assertEqual(r['price_pnl'],-100)
        self.assertEqual(r['market_value'],0)

    def test_accounts_cannot_cover_each_others_missing_shares(self):
        with self.assertRaises(ValueError):
            valuation([fill('GOOGL','buy',10,100),fill('GOOGL','sell',1,100,account='IRA')],{'GOOGL':100})

    def test_missing_price_blocks_report(self):
        with self.assertRaises(KeyError):
            valuation([fill('GOOGL','buy',10,100)],{})
