"""Integration checks; credential file supplied locally, never copied into the site."""
import argparse, json, secrets, uuid, datetime, hashlib
from pathlib import Path
import requests, psycopg
from dotenv import dotenv_values
p=argparse.ArgumentParser();p.add_argument('--env',required=True);a=p.parse_args()
e=dotenv_values(a.env)
config=json.loads(Path('dates/config.js').read_text().split('window.DATE_CONFIG = ',1)[1].rstrip(';\n'))
url=config['url']+'/rest/v1'; headers={'apikey':config['key'],'Authorization':'Bearer '+config['key'],'Content-Type':'application/json'}
token=secrets.token_hex(32);other=secrets.token_hex(32)
now=datetime.datetime.now(datetime.timezone.utc)
def action(actor,choice,offset=0):return {'event_id':str(uuid.uuid4()),'actor':actor,'idea_id':'test-idea','choice':choice,'client_at':(now+datetime.timedelta(seconds=offset)).isoformat()}
def sync(t,actions=[]):
 r=requests.post(url+'/rpc/date_night_sync',headers=headers,json={'p_token':t,'p_actions':actions},timeout=15)
 assert r.status_code==200, 'Sync status '+str(r.status_code)
 return r.json()['votes']
try:
 d=action('dmitri','yes');t=action('tulin','yes',1)
 assert sync(token)==[]
 assert len(sync(token,[d,t]))==2
 assert len(sync(token,[d,t]))==2
 assert sync(other)==[]
 assert [v['choice'] for v in sync(token,[action('dmitri','none',2)]) if v['actor']=='dmitri']==['none']
 assert [v['choice'] for v in sync(token,[action('dmitri','pass',-1)]) if v['actor']=='dmitri']==['none']
 assert requests.post(url+'/rpc/date_night_sync',headers=headers,json={'p_token':'guess','p_actions':[]},timeout=15).status_code>=400
 assert requests.post(url+'/rpc/date_night_sync',headers=headers,json={'p_token':token,'p_actions':[action('someone','yes')]},timeout=15).status_code>=400
 for table in ('date_night_votes','date_night_events'):
  r=requests.get(url+'/'+table+'?select=*',headers=headers,timeout=15)
  assert r.status_code in (401,403), 'Direct table read was not denied'
 with psycopg.connect(e['POSTGRES_URL'],sslmode='require',connect_timeout=10) as c:
  count=c.execute('select count(*) from public.date_night_events where board_hash=%s',(hashlib.sha256(token.encode()).digest(),)).fetchone()[0]
  assert count==4, 'Retry created duplicate event'
 print('PASS: persistence, two-person votes, undo, stale-write protection, retry deduplication, board isolation, validation, and direct-table access denied.')
finally:
 with psycopg.connect(e['POSTGRES_URL'],sslmode='require',connect_timeout=10) as c:
  for table in ('date_night_votes','date_night_events'):
   c.execute('delete from public.'+table+' where board_hash = any(%s)',([hashlib.sha256(x.encode()).digest() for x in (token,other)],))
 print('Removed only integration-test rows.')
