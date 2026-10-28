import json
import time
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from app.api import create_app
from app.store import Store,key


def test_public_projection_and_passwordless_owner_boundary(tmp_path,monkeypatch):
    monkeypatch.setenv('ORIGIN_SECRET','edge-secret')
    store=Store('sqlite:///'+str(tmp_path/'public.db'),Fernet.generate_key())
    store.put('config',{'openai_api_key':'SECRET_API','calendar_urls':['https://example.com/SECRET_FEED'],'luckyseat_email':'SECRET_EMAIL'})
    store.put('profile',{'full_name':'SECRET_NAME','attendance_preferences':{'unavailable_date_ranges':[{'start':'2099-01-01','end':'2099-01-09','reason':'SECRET_TRAVEL'}]}})
    store.put('integration:telecharge',{'status':'blocked','reason':'SECRET_EXCEPTION','evidence':'SECRET_EVIDENCE'})
    store.put('run:test',{'run_id':'test','status':'partial','mode':'inspect','created_at':time.time(),'outcomes':[{'provider':'telecharge','show':'Example Show','status':'blocked','reason':'SECRET_REASON'}]})
    store.put('report:test',{'status':'blocked','text':'SECRET_REPORT','message_id':'SECRET_MESSAGE'})
    store.put('entry:test',{'provider':'telecharge','show':'Example Show','performance':'2099-01-01T19:00:00-05:00','tickets':2,'status':'confirmed','verification':'SECRET_PROOF'})
    store.put('auth:owner',{'hash':key('owner-link-token')})
    with TestClient(create_app(store,start_scheduler=False,adapters={}),base_url='https://dmitri.im') as client:
        assert client.get('/public/status').status_code==404
        client.headers['x-broadway-origin']='edge-secret'
        public=client.get('/public/status')
        assert public.status_code==200 and public.json()['access']=='public'
        assert 'Example Show' in public.text and 'SECRET_' not in public.text
        assert public.json()['config_public']=={}
        assert client.get('/status').status_code==401
        assert client.get('/preferences').status_code==401
        assert client.get('/entries').status_code==401
        client.headers['origin']='https://dmitri.im'
        for path,payload in [('/toggle',{'enabled':False}),('/config',{}),('/runs',{'mode':'inspect'}),('/preferences',{})]:
            assert client.post(path,json=payload).status_code==401
        assert client.post('/auth/owner',json={'token':'wrong'}).status_code==401
        client.headers['origin']='https://other.example'
        assert client.post('/auth/owner',json={'token':'owner-link-token'}).status_code==403
        client.headers['origin']='https://dmitri.im'
        response=client.post('/auth/owner',json={'token':'owner-link-token'})
        assert response.status_code==200
        assert 'HttpOnly' in response.headers['set-cookie'] and 'Secure' in response.headers['set-cookie']
        client.headers['cookie']='__Secure-broadway='+response.cookies.get('__Secure-broadway')
        assert client.get('/status').status_code==200
        assert client.post('/toggle',json={'enabled':False}).status_code==200
        assert 'owner-link-token' not in client.get('/status').text
