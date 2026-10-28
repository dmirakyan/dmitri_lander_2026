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

    async def solve(self, page, run_id, challenge_id):
        widgets = await page.evaluate('''() => [...document.querySelectorAll('[data-sitekey]')].map(e=>({sitekey:e.dataset.sitekey,kind:e.className.includes('turnstile')?'turnstile':'recaptcha',action:e.dataset.action,cdata:e.dataset.cdata}))''')
        if not widgets:
            return {'status':'not_detected'}
        for widget in widgets:
            if await page.locator('textarea[name="g-recaptcha-response"],input[name="cf-turnstile-response"]').evaluate_all('(els)=>els.some(e=>e.value.length>20)'):
                return {'status':'normal_widget_ready'}
            if not self.api_key:
                return {'status':'blocked','reason':'CAPTCHA key missing'}
            task_key = f'captcha:{run_id}:{challenge_id}:{widget["sitekey"]}'
            saved = self.store.get(task_key)
            if saved and saved['status'] == 'creating':
                return {'status':'blocked','reason':'CAPTCHA task creation outcome uncertain; refusing duplicate charge'}
            if not saved:
                kind = 'TurnstileTaskProxyless' if widget['kind']=='turnstile' else 'RecaptchaV2TaskProxyless'
                task = {'type':kind,'websiteURL':page.url,'websiteKey':widget['sitekey']}
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
