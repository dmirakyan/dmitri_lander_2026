"""Exercise the shared RPC with a unique, non-catalog idea; never alter real picks."""
import argparse, json, secrets, uuid, datetime
from pathlib import Path
import requests, psycopg
from dotenv import dotenv_values
p=argparse.ArgumentParser();p.add_argument('--env',required=True);args=p.parse_args()
env=dotenv_values(args.env)
config=json.loads(Path('dates/config.js').read_text().split('window.DATE_CONFIG = ',1)[1].rstrip(';\n'))
url=config['url']+'/rest/v1';headers={'apikey':config['key'],'Authorization':'Bearer '+config['key'],'Content-Type':'application/json'}
idea='test-shared-'+uuid.uuid4().hex
now=datetime.datetime.now(datetime.timezone.utc)
def action(actor,choice,offset=0):return dict(event_id=str(uuid.uuid4()),actor=actor,idea_id=idea,choice=choice,client_at=(now+datetime.timedelta(seconds=offset)).isoformat())
def sync(actions=None,token=None):
 endpoint='date_night_shared_sync' if token is None else 'date_night_sync'
 body={'p_actions':actions or []}
 if token is not None:body['p_token']=token
 r=requests.post(url+'/rpc/'+endpoint,headers=headers,json=body,timeout=15)
 assert r.status_code==200, r.status_code
 return [v for v in r.json()['votes'] if v['idea_id']==idea]
try:
 d=action('dmitri','yes');t=action('tulin','yes',1)
 assert sync()==[]
 assert len(sync([d,t]))==2
 assert len(sync([d,t]))==2
 assert len(sync(token=secrets.token_hex(32)))==2
 assert [v['choice'] for v in sync([action('dmitri','none',2)],token=secrets.token_hex(32)) if v['actor']=='dmitri']==['none']
 assert [v['choice'] for v in sync([action('dmitri','pass',-1)]) if v['actor']=='dmitri']==['none']
 r=requests.post(url+'/rpc/date_night_shared_sync',headers=headers,json={'p_actions':[action('someone','yes')]},timeout=15)
 assert r.status_code>=400
 for table in ('date_night_votes','date_night_events'):
  assert requests.get(url+'/'+table+'?select=*',headers=headers,timeout=15).status_code in (401,403)
 with psycopg.connect(env['POSTGRES_URL'],sslmode='require',connect_timeout=10) as c:
  assert c.execute('select count(*) from public.date_night_events where idea_id=%s',(idea,)).fetchone()[0]==4
 print('PASS: one shared board across unrelated legacy keys, two-person persistence, undo, stale-write protection, idempotent retries, actor validation, direct table denial.')
finally:
 with psycopg.connect(env['POSTGRES_URL'],sslmode='require',connect_timeout=10) as c:
  for table in ('date_night_votes','date_night_events'):
   c.execute('delete from public.'+table+' where idea_id=%s',(idea,))
 print('Removed only the unique test idea and its events.')
