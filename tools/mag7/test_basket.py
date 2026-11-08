import unittest
from decimal import Decimal
from basket import select_targets, target_tickers, reviewed_budget
from strategy import UNIVERSE


class BasketTests(unittest.TestCase):
    def test_worst_two_preserve_rank_order(self):
        rows=[{'ticker':t} for t in ['GOOGL','AMZN','META','NVDA','TSLA','AAPL','MSFT']]
        self.assertEqual(select_targets(rows,2),[{'ticker':'GOOGL','weight':.5},{'ticker':'AMZN','weight':.5}])
        with self.assertRaises(ValueError): select_targets(rows[:-1],2)

    def test_legacy_and_invalid_allocations(self):
        self.assertEqual(target_tickers([], 'GOOGL'),{'GOOGL'})
        for bad in [[{'ticker':'GOOGL','weight':.5}],
                    [{'ticker':'GOOGL','weight':.5},{'ticker':'GOOGL','weight':.5}],
                    [{'ticker':'OPEN','weight':1}]]:
            with self.assertRaises(ValueError): target_tickers(bad,'GOOGL')

    def test_account_and_ticker_budgets_are_separate(self):
        entries=[{'account_alias':'taxable','status':'reviewed','buy_dollars':20000,
                  'buy_allocations':{'GOOGL':10000,'AMZN':10000}},
                 {'account_alias':'ira','status':'reviewed','buy_dollars':50000,
                  'buy_allocations':{'GOOGL':25000,'AMZN':25000}}]
        self.assertEqual(reviewed_budget(entries,'taxable','AMZN',True),(Decimal(20000),Decimal(10000)))
        self.assertEqual(reviewed_budget(entries,'taxable','META',True),(Decimal(20000),Decimal(0)))
        entries[0]['status']='owner_selected_pending_execution_review'
        self.assertEqual(reviewed_budget(entries,'taxable','AMZN',True),(0,0))

    def test_missing_or_excessive_stock_budgets_fail_closed(self):
        entry={'account_alias':'taxable','status':'reviewed','buy_dollars':20000}
        with self.assertRaises(ValueError): reviewed_budget([entry],'taxable','AMZN',True)
        entry['buy_allocations']={'GOOGL':20000,'AMZN':10000}
        with self.assertRaises(ValueError): reviewed_budget([entry],'taxable','AMZN',True)

if __name__=='__main__': unittest.main()
