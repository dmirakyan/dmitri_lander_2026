"""Run locally with DATABASE_URL and DATA_ENCRYPTION_KEY; never commit the inputs.
Imports historical truth without submitting, scheduling, or overwriting existing records.
"""
import argparse,json,pathlib,re
from datetime import datetime
from app.store import Store,key
from app.policy import NY

def migrate(source,store):
    profile=json.loads((source/'profile.json').read_text())
    store.once('profile',profile)
    store.once('settings',{'enabled':False})
    store.once('migration:legacy',{'scheduler_disabled':False,'source':'Codex Broadway heartbeat'})
    providers={'Broadway Direct':'broadway_direct','Telecharge':'telecharge','Lucky Seat':'lucky_seat'}
    imported=0;archived=0
    for path in sorted((source/'ledger').glob('*.json')):
        day=json.loads(path.read_text())
        if store.once('legacy:'+path.stem,day):archived+=1
        for entry in day.get('entries',[]):
            if entry.get('status') not in ('confirmed','uncertain','pending_verification'):continue
            provider=providers.get(entry.get('provider'))
            if not provider:raise ValueError('Unrecognized historical provider')
            performance=datetime.fromisoformat(entry['performance_datetime']).astimezone(NY).isoformat()
            identity=key(f'{provider}|{entry["show"].casefold().strip()}|{performance}')
            normalized={'provider':provider,'show':entry['show'],'performance':performance,'drawing':str(entry.get('drawing_id') or entry.get('drawing_date') or day['date']),'status':entry['status'],'tickets':entry.get('ticket_count',entry.get('quantity',2)),'price':entry.get('price_per_ticket_usd',entry.get('price_per_ticket',entry.get('displayed_price_usd',0))),'total_price_including_fees':entry.get('fees_included',False),'broadway':True,'url':entry.get('provider_url',''),'evidence':str(entry.get('confirmation_evidence') or entry.get('confirmation') or 'Imported historical confirmation'),'legacy_source':path.name}
            if store.once('entry:'+identity,normalized):imported+=1
    return {'archived_daily_ledgers':archived,'imported_entries':imported}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=pathlib.Path);args=parser.parse_args()
    print(json.dumps(migrate(args.source,Store())))
