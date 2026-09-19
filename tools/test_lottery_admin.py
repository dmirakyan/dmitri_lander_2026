import copy
import unittest
from lottery_admin import update_profile

class PreferencesTests(unittest.TestCase):
    def setUp(self):
        self.profile = {'email':'unchanged@example.com','attendance_preferences':{'weekdays':{},'weekends':{}},'calendar':{},'show_preferences':{}}
        self.values = dict(ticket_count=2,max_price_per_ticket_usd=100,weekday_start='18:00',weekend_matinees=True,weekend_evenings=True,next_day_allowed=True,skip_trips_away=True,skip_ordinary_conflicts=False,prioritized=['Wicked'],excluded=[])
    def test_updates_preferences_without_changing_identity(self):
        p=update_profile(copy.deepcopy(self.profile),self.values)
        self.assertEqual(p['email'],self.profile['email'])
        self.assertEqual(p['show_preferences']['prioritized'],['Wicked'])
        self.assertEqual(p['attendance_preferences']['weekdays']['earliest_start'],'18:00')
        self.assertFalse(p['calendar']['skip_ordinary_conflicts'])
    def test_rejects_invalid_values(self):
        for key,value in [('ticket_count',3),('ticket_count',True),('max_price_per_ticket_usd',float('nan')),('max_price_per_ticket_usd',-1),('weekday_start','25:30'),('skip_trips_away','false'),('excluded','Wicked')]:
            with self.subTest(key=key,value=value), self.assertRaises(ValueError):
                update_profile(copy.deepcopy(self.profile),dict(self.values,**{key:value}))
    def test_rejects_conflicting_show_lists(self):
        with self.assertRaises(ValueError):
            update_profile(copy.deepcopy(self.profile),dict(self.values,excluded=['wicked']))

if __name__=='__main__': unittest.main()
