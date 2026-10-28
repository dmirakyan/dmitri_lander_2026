from .errors import FlowBlocked
import asyncio
import base64
import httpx
from contextlib import asynccontextmanager
from urllib.parse import urlparse
from playwright.async_api import async_playwright

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
                async with httpx.AsyncClient(timeout=40) as client:
                    headers={'X-BB-API-Key':self.config['browserbase_api_key']}
                    context_id=self.store.get('bb-context:'+self.provider,{}).get('context_id')
                    if not context_id:
                        result=await client.post('https://api.browserbase.com/v1/contexts',headers=headers,json={'projectId':self.config['browserbase_project_id']})

                        if result.status_code>=400:raise FlowBlocked(f'Browserbase context API returned HTTP {result.status_code}; check key, project, and plan')
                        context_id=result.json()['id']
                        self.store.put('bb-context:'+self.provider,{'context_id':context_id})
                    result=await client.post('https://api.browserbase.com/v1/sessions',headers=headers,json={'projectId':self.config['browserbase_project_id'],'proxies':True,'timeout':1800,'browserSettings':{'context':{'id':context_id,'persist':True},'solveCaptchas':True,'recordSession':False,'logSession':False}})

                    if result.status_code>=400:raise FlowBlocked(f'Browserbase session API returned HTTP {result.status_code}; check key, project, and plan')
                    session=result.json();remote_id=session['id']
                browser=await p.chromium.connect_over_cdp(session['connectUrl'])
            else:
                browser=await p.chromium.launch(headless=True,args=['--disable-dev-shm-usage'])
            state=self.store.get('browser:'+self.provider)
            context=browser.contexts[0] if remote else await browser.new_context(storage_state=state.get('storage') if state else None, viewport={'width':1440,'height':1000},locale='en-US',timezone_id='America/New_York')
            if state and state.get('session'):
                await context.add_init_script(script='for(const [k,v] of Object.entries('+__import__('json').dumps(state['session'])+')){if(location.origin===k){for(const [sk,sv] of Object.entries(v))sessionStorage.setItem(sk,sv)}}')
            page=await context.new_page()
            try:yield page
            finally:
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
