from .errors import FlowBlocked
"""Normal widget first, then the user's existing paid 2Captcha integration.
A delivered token is never counted as a confirmed entry or site-accepted solve.
"""
import asyncio
import time
import httpx
from .budget import reserve, settle


class Captcha:
    def __init__(self, store, api_key):
        self.store, self.api_key = store, api_key

    async def request(self, endpoint, **body):
        async with httpx.AsyncClient(timeout=35) as client:
            result = (await client.post('https://api.2captcha.com/'+endpoint, json={'clientKey':self.api_key, **body})).json()
        if result.get('errorId'):
            raise FlowBlocked('CAPTCHA service: '+result.get('errorCode','unknown error'))
        return result

    async def widgets(self, page):
        # Explicit render widgets can expose the key only in their iframe.
        return await page.evaluate('''() => {
          const widgets=[...document.querySelectorAll('[data-sitekey]')].map(e=>({sitekey:e.dataset.sitekey,kind:e.className.includes('turnstile')?'turnstile':'recaptcha',action:e.dataset.action,cdata:e.dataset.cdata}));
          for(const frame of document.querySelectorAll('iframe[src]')) {
            const url=new URL(frame.src,location.href);
            if(['www.google.com','www.recaptcha.net'].includes(url.hostname) && url.pathname==='/recaptcha/api2/anchor' && url.searchParams.get('k'))
              widgets.push({sitekey:url.searchParams.get('k'),kind:'recaptcha',invisible:url.searchParams.get('size')==='invisible'});
          }
          return [...new Map(widgets.map(w=>[w.kind+':'+w.sitekey,w])).values()];
        }''')

    async def solve(self, page, run_id, challenge_id):
        widgets = await self.widgets(page)
        if not widgets:
            return {'status':'not_detected'}
        for widget in widgets:
            if await page.locator('textarea[name="g-recaptcha-response"],input[name="cf-turnstile-response"]').evaluate_all('(els)=>els.some(e=>e.value.length>20)'):
                return {'status':'normal_widget_ready'}
            if widget['kind']=='recaptcha' and not widget.get('invisible'):
                # Try the normal checkbox before paying for a solver task.
                for frame in page.frames:
                    from urllib.parse import urlparse,parse_qs
                    url=urlparse(frame.url)
                    if url.hostname in ('www.google.com','www.recaptcha.net') and url.path=='/recaptcha/api2/anchor' and parse_qs(url.query).get('k')==[widget['sitekey']]:
                        try:
                            await frame.get_by_role('checkbox').check(timeout=3000)
                            await page.wait_for_function('''() => [...document.querySelectorAll('textarea[name="g-recaptcha-response"]')].some(e=>e.value.length>20)''',timeout=10000)
                            return {'status':'normal_widget_ready'}
                        except Exception:pass
            if not self.api_key:
                return {'status':'blocked','reason':'CAPTCHA key missing'}
            task_key = f'captcha:{run_id}:{challenge_id}:{widget["sitekey"]}'
            saved = self.store.get(task_key)
            if saved and saved['status'] == 'creating':
                return {'status':'blocked','reason':'CAPTCHA task creation outcome uncertain; refusing duplicate charge'}
            if not saved:
                kind = 'TurnstileTaskProxyless' if widget['kind']=='turnstile' else 'RecaptchaV2TaskProxyless'
                task = {'type':kind,'websiteURL':page.url,'websiteKey':widget['sitekey']}
                if widget.get('invisible'): task['isInvisible']=True
                if widget.get('action'): task['action']=widget['action']
                if widget.get('cdata'): task['data']=widget['cdata']
                reservation=reserve(self.store,'captcha',0.02)
                self.store.put(task_key, {'status':'creating','reservation':reservation})
                created = await self.request('createTask',task=task)
                saved = {'status':'polling','taskId':created['taskId'],'reservation':reservation}
                self.store.put(task_key,saved)
            for _ in range(24):
                await asyncio.sleep(5)
                result = await self.request('getTaskResult',taskId=saved['taskId'])
                if result['status']=='ready':
                    if saved.get('reservation'):
                        settle(self.store,saved['reservation'],float(result.get('cost',0.02)))
                        saved.pop('reservation',None)
                        self.store.put(task_key,saved)
                    solution = result['solution']
                    token = solution.get('token') or solution.get('gRecaptchaResponse')
                    if not token: raise FlowBlocked('CAPTCHA solver returned no token')
                    await page.evaluate('''({token,kind}) => {
                      const selector=kind==='turnstile'?'input[name="cf-turnstile-response"]':'textarea[name="g-recaptcha-response"]';
                      document.querySelectorAll(selector).forEach(e=>{e.value=token;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
                      document.querySelectorAll('[data-callback]').forEach(e=>{let fn=window[e.dataset.callback];if(typeof fn==='function')fn(token)});
                    }''', {'token':token,'kind':widget['kind']})
                    self.store.put(task_key, {'status':'token_applied_awaiting_site_acceptance','taskId':saved['taskId'],'at':time.time()})
                    return {'status':'token_applied_awaiting_site_acceptance'}
            return {'status':'blocked','reason':'CAPTCHA solve still pending','taskId':saved['taskId']}
        return {'status':'not_detected'}
