import asyncio
import ipaddress
import socket
from datetime import datetime, timedelta
from urllib.parse import urlparse
import httpx
from icalendar import Calendar
import recurring_ical_events
from .policy import NY


async def public_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('Use a public HTTPS calendar URL')
    addresses = await asyncio.to_thread(socket.getaddrinfo, parsed.hostname, 443)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Calendar URL must resolve to public addresses')
    return url


async def calendar_blackouts(config):
    """Read private ICS feeds. Only explicitly marked travel overrides normal conflicts."""
    urls = config.get('calendar_urls', [])
    if not urls: raise RuntimeError('Calendar feeds are not connected')
    now = datetime.now(NY)
    ranges=[]
    async with httpx.AsyncClient(timeout=30,follow_redirects=False) as client:
        for url in urls:
            await public_url(url)
            response=await client.get(url)
            response.raise_for_status()
            if len(response.content)>5_000_000: raise RuntimeError('Calendar response exceeds size limit')
            cal=Calendar.from_ical(response.content)
            for event in recurring_ical_events.of(cal).between(now,now+timedelta(days=30)):
                title=str(event.get('SUMMARY','')).casefold()
                # Unaccepted invitations and generic venue-free events never imply travel.
                if str(event.get('STATUS','')).upper()=='CANCELLED': continue
                attendees=event.get('ATTENDEE',[])
                if not isinstance(attendees,list):attendees=[attendees]
                if any(str(a.params.get('PARTSTAT','')).upper() in ('DECLINED','NEEDS-ACTION') for a in attendees if str(a).casefold().endswith(config.get('calendar_email','').casefold())):continue
                if not any(marker in title for marker in ('[away]','[travel]','out of nyc','flight to','flight from')):continue
                start=event.decoded('DTSTART');end=event.decoded('DTEND',start)
                sd=start.astimezone(NY).date() if isinstance(start,datetime) else start
                ed=end.astimezone(NY).date() if isinstance(end,datetime) else end-timedelta(days=1)
                ranges.append({'start':sd.isoformat(),'end':max(sd,ed).isoformat(),'reason':'Calendar travel'})
    return ranges


async def send_report(store,run,config):
    """Resend idempotency keys permit safe retries after an interrupted response."""
    report_id='report:'+run['run_id']
    saved=store.get(report_id,{})
    if saved.get('status')=='sent':return
    lines=[f'Broadway batch {run["run_id"]}',f'Status: {run["status"]}', '']
    for item in run.get('outcomes',[]):
        lines.append(f'{item.get("provider","")} | {item.get("show","")} | {item.get("performance","")} | {item["status"]} | {item.get("reason","")}')
    report='\n'.join(lines)
    store.put(report_id,{'status':'pending','text':report,'run_id':run['run_id']})
    if not config.get('resend_api_key') or not config.get('report_from'):
        store.put(report_id,{'status':'blocked','reason':'Email sender is not connected','text':report,'run_id':run['run_id']});return
    store.put(report_id,{'status':'sending','text':report,'run_id':run['run_id']})
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r=await client.post('https://api.resend.com/emails',headers={'Authorization':'Bearer '+config['resend_api_key'],'Idempotency-Key':run['run_id']},json={'from':config['report_from'],'to':[config['report_to']], 'subject':f'Broadway lottery batch — {run["run_id"]}','text':report})
            r.raise_for_status();message_id=r.json()['id']
        store.put(report_id,{'status':'sent','text':report,'run_id':run['run_id'],'message_id':message_id})
    except Exception:
        store.put(report_id,{'status':'uncertain','reason':'Email delivery response failed; retry uses the same idempotency key','text':report,'run_id':run['run_id']})
