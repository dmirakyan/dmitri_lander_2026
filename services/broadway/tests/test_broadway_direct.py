from datetime import datetime
from app.providers import broadway_direct_result_matches
from app.policy import Offer,NY


def test_status_row_dates_and_show_names_match_without_substring_false_positives():
    entry={'show':'The Lion King','performance':'2026-10-29T19:00:00-04:00'}
    row='THE LION KING (NY) - 10/29/26, 7:00 pm\tYou won!\tPAY NOW'
    assert broadway_direct_result_matches(row,entry)
    assert broadway_direct_result_matches(row.replace('/26,','/2026,'),entry)
    for invalid in (row.replace('7:00','8:00'),row.replace('10/29','10/30'),row.replace('/26,','/25,'),row.replace('THE LION KING','THE LION KING TOUR')):
        assert not broadway_direct_result_matches(invalid,entry)


def test_provider_nyc_suffix_does_not_create_a_duplicate_entry_key():
    fields={'provider':'broadway_direct','show':'Wicked','performance':datetime(2026,10,29,19,tzinfo=NY),'drawing':'display-label','url':'https://lottery.broadwaydirect.com/show/wicked/','price':55,'total_price_including_fees':True,'tickets':2,'broadway':True,'evidence':'observed row'}
    original=Offer(**fields)
    labelled=Offer(**{**fields,'show':'WICKED (NY)'})
    assert labelled.identity==original.identity
    assert Offer(**{**fields,'show':'Wicked Tour'}).identity!=original.identity


def test_only_observed_direct_entry_links_select_a_performance():
    from app.providers import broadway_direct_entry_link
    url='https://lottery.broadwaydirect.com/enter-lottery/?lottery=1096570&window=popup'
    result=broadway_direct_entry_link('ENTER NOW\nFOR SIX (NY) ON 10/29/26, 7:00 PM',url)
    assert result['performance']=='2026-10-29T19:00:00-04:00'
    assert result['drawing']=='1096570' and result['url']==url
    assert broadway_direct_entry_link('Upcoming',url) is None
    assert broadway_direct_entry_link('Enter Now for SIX (NY) on 10/29/26, 7:00 pm',url.replace('lottery.broadwaydirect.com','example.com')) is None
