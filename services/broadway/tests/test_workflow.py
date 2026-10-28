from datetime import datetime
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from app.store import Store,key
from app.policy import Offer,NY,eligibility
from app.runner import Runner
from app.agent import Inventory
from app.api import create_app

@pytest.fixture
def store(tmp_path):return Store('sqlite:///'+str(tmp_path/'test.db'),Fernet.generate_key())
@pytest.fixture
def profile():return {'ticket_count':2,'max_price_per_ticket_usd':100,'lottery_action_authorization':{'free_entries':True,'required_lottery_terms':True,'captcha_completion':True},'attendance_preferences':{'weekdays':{'earliest_start':'18:00'},'unavailable_date_ranges':[{'start':'2099-11-02','end':'2099-11-05'}]},'show_preferences':{'excluded':['The Book of Mormon']}}
def offer(**kwargs):
    data={'provider':'broadway_direct','show':'Example Broadway Show','performance':datetime(2099,11,6,19,tzinfo=NY),'drawing':'2099-11-05','url':'https://lottery.broadwaydirect.com/show/example/','price':49,'total_price_including_fees':True,'tickets':2,'broadway':True,'evidence':'Exact provider card'};data.update(kwargs);return Offer(**data)
def test_policy(profile):
    assert eligibility(profile,offer()) is None
    for day in (2,5):assert eligibility(profile,offer(performance=datetime(2099,11,day,19,tzinfo=NY)))=='Away from NYC / unavailable'
    for change in ({'show':'The Book of Mormon'},{'total_price_including_fees':False},{'price':101},{'tickets':1},{'performance':datetime(2099,11,6,19)}):assert eligibility(profile,offer(**change))
def test_encryption_and_lease(store):
    store.put('private',{'password':'never plaintext'})
    from sqlalchemy import text
    with store.engine.connect() as c:assert 'never plaintext' not in c.execute(text('SELECT value FROM state')).scalar()
    assert store.lease('job','one');assert not store.lease('job','two')
    store.release('job','two');assert not store.lease('job','two')
    store.release('job','one');assert store.lease('job','two')
    assert store.once('unique',{'a':1});assert not store.once('unique',{'a':2})
class FakeProvider:
    provider='broadway_direct'
    submissions=0;stop_during_prepare=False;fail_after_submit=False
    def __init__(self,store,*args):self.store=store
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass
    async def discover(self):return Inventory(offers=[offer(provider=self.provider)],closed=[],blockers=[])
    async def prepare(self,offer):
        if self.stop_during_prepare:self.store.put('settings',{'enabled':False})
    async def reconcile(self,entry):return None
    async def submit_and_verify(self,offer,active):
        active();FakeProvider.submissions+=1
        if self.fail_after_submit:raise TimeoutError('response lost')
        return {'status':'confirmed','evidence':'fixture confirmation'}
@pytest.fixture
def runner(store,profile):
    FakeProvider.submissions=0;FakeProvider.stop_during_prepare=False;FakeProvider.fail_after_submit=False
    store.put('settings',{'enabled':True});store.put('profile',profile);store.put('config',{'manual_availability_only':True})
    return Runner(store,{p:type(p,(FakeProvider,),{'provider':p}) for p in ('broadway_direct','telecharge','lucky_seat')})
async def test_duplicate_run_and_restart(runner,store):
    run=runner.enqueue(slot='same-slot');assert runner.enqueue(slot='same-slot')==run
    await runner.execute(run);assert FakeProvider.submissions==3
    second=Runner(store,runner.adapters);await second.execute(second.enqueue(slot='next-slot'))
    assert FakeProvider.submissions==3
async def test_uncertain_is_not_retried(runner,store):
    FakeProvider.fail_after_submit=True
    await runner.execute(runner.enqueue(slot='first'))
    assert FakeProvider.submissions==3 and store.get('entry:'+offer().identity)['status']=='uncertain'
    await runner.execute(runner.enqueue(slot='second'));assert FakeProvider.submissions==3
async def test_off_switch(runner,store):
    FakeProvider.stop_during_prepare=True
    run=runner.enqueue();await runner.execute(run)
    assert FakeProvider.submissions==0 and store.get('run:'+run)['status']=='stopped'
async def test_inspect(runner,store):
    await runner.execute(runner.enqueue(mode='inspect'))
    assert FakeProvider.submissions==0 and not store.list('entry:')
def test_auth_csrf_and_privacy(store,monkeypatch):
    monkeypatch.setenv('ORIGIN_SECRET','origin-test');monkeypatch.setenv('BOOTSTRAP_TOKEN_HASH',key('setup-test'))
    with TestClient(create_app(store,start_scheduler=False,adapters={}),base_url='https://dmitri.im') as c:
        assert c.get('/status').status_code==404
        c.headers['x-broadway-origin']='origin-test';assert c.get('/status').status_code==401
        payload={'bootstrap_token':'setup-test','password':'long secure password'}
        assert c.post('/auth/bootstrap',json=payload).status_code==403
        c.headers['origin']='https://dmitri.im';response=c.post('/auth/bootstrap',json=payload)
        assert response.status_code==200
        assert 'HttpOnly' in response.headers['set-cookie'] and 'Secure' in response.headers['set-cookie']
        c.headers['cookie']='__Secure-broadway='+response.cookies.get('__Secure-broadway')
        assert c.get('/status').status_code==200
        assert c.post('/toggle',json={'enabled':True}).status_code==409
        assert c.post('/auth/bootstrap',json=payload).status_code==409
        c.post('/config',json={'openai_api_key':'test-secret'})
        assert 'test-secret' not in c.get('/status').text
        c.headers['origin']='https://evil.example';assert c.post('/toggle',json={'enabled':False}).status_code==403
