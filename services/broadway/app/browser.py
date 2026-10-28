from .errors import FlowBlocked
import asyncio
import base64
import time
import httpx
from contextlib import asynccontextmanager, suppress
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from .budget import browser_allowance

HOSTS = {
 'broadway_direct':{'lottery.broadwaydirect.com'},
 'telecharge':{'rush.telecharge.com','my.socialtoaster.com'},
 'lucky_seat':{'www.luckyseat.com','luckyseat.com'},
}


def allowed_url(provider,url):
    p=urlparse(url)
    return p.scheme=='https' and p.hostname in HOSTS[provider] and not p.username and not p.password and p.port in (None,443)


class Browser:
    def __init__(self,store,provider,config):
        self.store,self.provider,self.config=store,provider,config

    @asynccontextmanager
    async def session(self):
        async with async_playwright() as p:
            remote_id=None
            remote=self.config.get('browser_mode')=='browserbase'
            if remote:
                if not self.config.get('browserbase_api_key') or not self.config.get('browserbase_project_id'):
                    raise FlowBlocked('Browserbase credentials are not configured')
                await browser_allowance(self.store,self.config)
                async with httpx.AsyncClient(timeout=40) as client:
                    headers={'X-BB-API-Key':self.config['browserbase_api_key']}
                    context_id=self.store.get('bb-context:'+self.provider,{}).get('context_id')
                    if not context_id:
                        result=await client.post('https://api.browserbase.com/v1/contexts',headers=headers,json={'projectId':self.config['browserbase_project_id']})

                        if result.status_code>=400:raise FlowBlocked(f'Browserbase context API returned HTTP {result.status_code}; check key, project, and plan')
                        context_id=result.json()['id']
                        self.store.put('bb-context:'+self.provider,{'context_id':context_id})
                    result=await client.post('https://api.browserbase.com/v1/sessions',headers=headers,json={'projectId':self.config['browserbase_project_id'],'proxies':True,'timeout':900,'browserSettings':{'context':{'id':context_id,'persist':True},'solveCaptchas':True,'recordSession':False,'logSession':False}})

                    if result.status_code>=400:
                        reason='Finish Browserbase Developer checkout to enable proxies and CAPTCHA solving' if result.status_code==402 else f'Browserbase session API returned HTTP {result.status_code}; check key, project, and plan'
                        self.store.put('integration:browser',{'status':'blocked','reason':reason,'checked_at':time.time()})
                        raise FlowBlocked(reason)
                    session=result.json();remote_id=session['id']
                try:
                    browser=await p.chromium.connect_over_cdp(session['connectUrl'])
                except Exception:
                    async with httpx.AsyncClient(timeout=20) as client:
                        await client.post('https://api.browserbase.com/v1/sessions/'+remote_id,headers=headers,json={'projectId':self.config['browserbase_project_id'],'status':'REQUEST_RELEASE'})
                    raise
                self.store.put('integration:browser',{'status':'verified','reason':'Hosted browser connection succeeded; provider acceptance is tracked separately','checked_at':time.time()})
            else:
                browser=await p.chromium.launch(headless=True,args=['--disable-dev-shm-usage'])
            state=self.store.get('browser:'+self.provider)
            context=browser.contexts[0] if remote else await browser.new_context(storage_state=state.get('storage') if state else None, viewport={'width':1440,'height':1000},locale='en-US',timezone_id='America/New_York')
            if state and state.get('session'):
                await context.add_init_script(script='for(const [k,v] of Object.entries('+__import__('json').dumps(state['session'])+')){if(location.origin===k){for(const [sk,sv] of Object.entries(v))sessionStorage.setItem(sk,sv)}}')
            async def trim_assets(route):
                request=route.request
                host=urlparse(request.url).hostname or ''
                challenge=any(domain in host for domain in ('recaptcha','hcaptcha','google.com','gstatic.com','cloudflare.com'))
                if request.resource_type in ('media','font') or (request.resource_type=='image' and not challenge):
                    await route.abort()
                else:
                    await route.continue_()
            if remote:
                await context.route('**/*',trim_assets)
            async def monitor():
                while True:
                    await asyncio.sleep(5)
                    try:
                        await browser_allowance(self.store,self.config)
                        async with httpx.AsyncClient(timeout=10) as client:
                            usage=await client.get('https://api.browserbase.com/v1/sessions/'+remote_id,headers={'X-BB-API-Key':self.config['browserbase_api_key']})
                            usage.raise_for_status()
                            if usage.json().get('proxyBytes',0)>=8_000_000:
                                raise FlowBlocked('Session proxy limit reached; stopped to protect monthly budget')
                    except Exception:
                        await browser.close()
                        return
            guard=asyncio.create_task(monitor()) if remote else None
            page=await context.new_page()
            try:yield page
            finally:
                if guard:
                    guard.cancel()
                    with suppress(asyncio.CancelledError): await guard
                try:
                    session={}
                    for pg in context.pages:
                        if allowed_url(self.provider,pg.url):
                            origin=urlparse(pg.url).scheme+'://'+urlparse(pg.url).netloc
                            session[origin]=await pg.evaluate('Object.fromEntries(Object.entries(sessionStorage))')
                    self.store.put('browser:'+self.provider,{'storage':await context.storage_state(indexed_db=True),'session':session})
                finally:
                    await browser.close()
                    if remote_id:
                        async with httpx.AsyncClient(timeout=20) as client:
                            await client.post('https://api.browserbase.com/v1/sessions/'+remote_id,headers={'X-BB-API-Key':self.config['browserbase_api_key']},json={'projectId':self.config['browserbase_project_id'],'status':'REQUEST_RELEASE'})

    async def evidence(self,page,run_id,label):
        screenshot=await page.screenshot(full_page=True,timeout=15000)
        evidence_id=f'evidence:{run_id}:{self.provider}:{label}'
        self.store.put(evidence_id,{'url':page.url,'text':(await page.locator('body').inner_text())[:50000],'image':base64.b64encode(screenshot).decode()})
        return evidence_id
