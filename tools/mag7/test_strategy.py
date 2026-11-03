import unittest
from datetime import date
from strategy import UNIVERSE, rank_signals, month_end_offset, first_session_after, parse_chart

class StrategyTests(unittest.TestCase):
    def series(self):
        dates=[date(2026,10,31),date(2026,7,31),date(2026,4,30),date(2025,10,31)]
        return {t:{d:{'close':100+i*5 if d==dates[0] else 100,
                      'adjusted_close':100+i*5 if d==dates[0] else 100} for d in dates}
                for i,t in enumerate(UNIVERSE)}

    def test_selects_worst_not_best(self):
        _,r=rank_signals(self.series(),date(2026,10,31),lambda d:d)
        self.assertEqual(r[0]['ticker'],'AAPL')
        self.assertEqual(r[0]['average_rank'],7)
        self.assertEqual(r[-1]['average_rank'],1)

    def test_ties_average_ranks_and_deterministic_selection(self):
        s=self.series()
        for rows in s.values():
            for p in rows.values(): p['adjusted_close']=100
        _,r=rank_signals(s,date(2026,10,31),lambda d:d)
        self.assertTrue(all(x['average_rank']==4 for x in r))
        self.assertEqual(r[0]['ticker'],'AAPL')

    def test_missing_data_fails_closed(self):
        s=self.series();del s['AAPL'][date(2026,4,30)]
        with self.assertRaises(ValueError):rank_signals(s,date(2026,10,31),lambda d:d)
        del s['AAPL']
        with self.assertRaises(ValueError):rank_signals(s,date(2026,10,31),lambda d:d)

    def test_future_prices_do_not_change_signal(self):
        s=self.series();_,before=rank_signals(s,date(2026,10,31),lambda d:d)
        s['AAPL'][date(2026,11,2)]={'close':999,'adjusted_close':999}
        _,after=rank_signals(s,date(2026,10,31),lambda d:d)
        self.assertEqual(before,after)

    def test_adjusted_prices_used(self):
        s=self.series();s['AAPL'][date(2026,10,31)]['close']=1
        s['AAPL'][date(2026,10,31)]['adjusted_close']=200
        _,r=rank_signals(s,date(2026,10,31),lambda d:d)
        self.assertEqual(r[-1]['ticker'],'AAPL')

    def test_calendar_month_ends_and_holidays(self):
        self.assertEqual(month_end_offset(date(2026,5,31),3),date(2026,2,28))
        self.assertEqual(first_session_after(date(2026,10,31)),date(2026,11,2))
        self.assertEqual(first_session_after(date(2026,12,31)),date(2027,1,4))

if __name__=='__main__': unittest.main()
