import secrets
import httpx
from playwright.async_api import async_playwright
from .providers import START
from .budget import browser_allowance

async def open_login(store,provider):
    if provider not in START:raise ValueError('Unknown provider')
    config=store.get('config',{})
    if not all(config.get(k) for k in ('browserbase_api_key','browserbase_project_id')):raise ValueError('Connect Browserbase first')
    await browser_allowance(store,config)
    owner='login-'+secrets.token_hex(10)
    if not store.lease('runner',owner,1200):raise ValueError('A batch or login session is already running')
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            headers={'X-BB-API-Key':config['browserbase_api_key']}
            context_id=store.get('bb-context:'+provider,{}).get('context_id')
            if not context_id:
                r=await client.post('https://api.browserbase.com/v1/contexts',headers=headers,json={'projectId':config['browserbase_project_id']});r.raise_for_status();context_id=r.json()['id']
                store.put('bb-context:'+provider,{'context_id':context_id})
            r=await client.post('https://api.browserbase.com/v1/sessions',headers=headers,json={'projectId':config['browserbase_project_id'],'proxies':True,'timeout':1200,'keepAlive':True,'browserSettings':{'context':{'id':context_id,'persist':True},'solveCaptchas':True,'recordSession':False,'logSession':False}})
            r.raise_for_status();session=r.json()
            store.put('login:'+provider,{'owner':owner,'session_id':session['id']})
            async with async_playwright() as p:
                browser=await p.chromium.connect_over_cdp(session['connectUrl'])
                page=browser.contexts[0].pages[0] if browser.contexts[0].pages else await browser.contexts[0].new_page()
                await page.goto(START[provider],wait_until='domcontentloaded',timeout=45000)
                await browser.close()
            r=await client.get('https://api.browserbase.com/v1/sessions/'+session['id']+'/debug',headers=headers);r.raise_for_status()
            return {'url':r.json()['debuggerFullscreenUrl'],'expires_in_seconds':1200}
    except Exception:
        store.release('runner',owner);raise

async def close_login(store,provider):
    record=store.get('login:'+provider)
    if not record:return
    config=store.get('config',{})
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post('https://api.browserbase.com/v1/sessions/'+record['session_id'],headers={'X-BB-API-Key':config['browserbase_api_key']},json={'projectId':config['browserbase_project_id'],'status':'REQUEST_RELEASE'})
        r.raise_for_status()
    store.release('runner',record['owner'])
    store.put('login:'+provider,{'owner':record['owner'],'session_id':record['session_id'],'closed':True})
