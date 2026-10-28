from .errors import FlowBlocked
"""Provider UI adapters. No purchases or arbitrary model-directed browser clicks."""
import asyncio
import re
from datetime import datetime
from .agent import inventory,Inventory
from .browser import Browser,allowed_url
from .captcha import Captcha

START={
 'broadway_direct':'https://lottery.broadwaydirect.com/',
 'telecharge':'https://rush.telecharge.com/',
 'lucky_seat':'https://www.luckyseat.com/',
}

class Provider:
    provider=''
    def __init__(self,store,config,profile,run_id):
        self.store,self.config,self.profile,self.run_id=store,config,profile,run_id
        self.browser=Browser(store,self.provider,config)
        self.captcha=Captcha(store,config.get('captcha_api_key'))
    async def __aenter__(self):
        self.session=self.browser.session();self.page=await self.session.__aenter__();self.page.set_default_timeout(12000);return self
    async def __aexit__(self,*args):return await self.session.__aexit__(*args)
    async def goto(self,url):
        if not allowed_url(self.provider,url):raise FlowBlocked('Provider URL is outside the allowed domain')
        await self.page.goto(url,wait_until='domcontentloaded',timeout=45000)
        await self.page.wait_for_timeout(1500)
    async def accessible(self):
        text=await self.page.locator('body').inner_text()
        if any(s in text.casefold() for s in ('403 forbidden','performing security verification','verify you are human','access denied','just a moment')):
            if self.config.get('browser_mode')=='browserbase':
                for _ in range(12):
                    await asyncio.sleep(5)
                    text=await self.page.locator('body').inner_text()
                    if not any(s in text.casefold() for s in ('403 forbidden','performing security verification','verify you are human','access denied','just a moment')):return None
            await self.browser.evidence(self.page,self.run_id,'access-blocked')
            return 'Provider access challenge did not clear; managed browser/session requires attention'
        return None
    async def snapshot(self,root=None):
        root=root or self.page
        text=await root.locator('body').inner_text()
        links=await root.locator('a[href]').evaluate_all('(els)=>els.map(e=>({label:e.innerText,url:e.href}))')
        return {'url':self.page.url,'text':text[:50000],'links':links}
    async def reconcile(self,existing):return None
    async def prepared_proof(self,offer,root=None):
        text=await (root or self.page).locator('body').inner_text()
        if offer.show.casefold() not in text.casefold():raise FlowBlocked('Show does not match the selected page')
        await self.browser.evidence(self.page,self.run_id,'prepared-'+offer.identity)

class BroadwayDirect(Provider):
    provider='broadway_direct'
    async def discover(self):
        await self.goto(START[self.provider])
        if reason:=await self.accessible():return Inventory(offers=[],closed=[],blockers=[reason])
        links=await self.page.locator('a[href]').evaluate_all('(els)=>els.map(e=>({text:e.innerText,url:e.href}))')
        urls=list(dict.fromkeys(x['url'] for x in links if '/show/' in x['url'] and allowed_url(self.provider,x['url'])))
        snapshots=[]
        for url in urls:
            await self.goto(url)
            if reason:=await self.accessible():snapshots.append({'url':url,'blocked':reason});continue
            snapshots.append(await self.snapshot())
        await self.browser.evidence(self.page,self.run_id,'inventory')
        if not snapshots:return Inventory(offers=[],closed=[],blockers=['No official show cards found; provider layout needs review'])
        return await inventory(self.provider,snapshots,self.config,self.store)
    async def fill_profile(self):
        profile=self.profile;names=profile['full_name'].split(' ',1)
        for label,value in [('First Name',names[0]),('Last Name',names[-1]),('Email',profile['email']),('Zip',profile['zip_code'])]:
            field=self.page.get_by_label(re.compile(label,re.I))
            if await field.count()==1:await field.fill(value)
            else:raise FlowBlocked('Required profile field is not uniquely identifiable')
        dob=datetime.fromisoformat(profile['date_of_birth'])
        for label,value in [('Month of Birth',str(dob.month)),('Day of Birth',str(dob.day)),('Year of Birth',str(dob.year)),('Country of Residence','USA'),('Quantity of Tickets Requested',str(profile['ticket_count']))]:
            field=self.page.get_by_label(label,exact=False)
            if await field.count()!=1:raise FlowBlocked('Required selection field is not uniquely identifiable')
            try:await field.select_option(value=value)
            except Exception:await field.select_option(label=value)
    async def prepare(self,offer):
        await self.goto(offer.url)
        trigger=self.page.get_by_role('link',name=re.compile('Enter.*Lottery',re.I))
        if await trigger.count()==1:await trigger.click()
        elif await self.page.get_by_role('button',name=re.compile('Enter.*Lottery',re.I)).count()==1:
            await self.page.get_by_role('button',name=re.compile('Enter.*Lottery',re.I)).click()
        await self.fill_profile()
        terms=self.page.get_by_role('checkbox',name=re.compile('terms|official rules|agree',re.I))
        if await terms.count()!=1:raise FlowBlocked('Required terms checkbox is not uniquely identifiable')
        await terms.check()
        # A form for the wrong performance must never pass just because the show matches.
        form=self.page.locator('form').filter(has=self.page.get_by_role('button',name='Enter',exact=True))
        if await form.count()!=1:raise FlowBlocked('Selected lottery form is ambiguous')
        form_text=await form.inner_text()
        if offer.evidence not in form_text:raise FlowBlocked('Exact performance evidence is not present in the final lottery form')
        await self.prepared_proof(offer)
        result=await self.captcha.solve(self.page,self.run_id,offer.identity)
        if result['status']=='blocked':raise FlowBlocked(result['reason'])
    async def submit_and_verify(self,offer,active):
        active()
        submit=self.page.get_by_role('button',name='Enter',exact=True)
        if await submit.count()!=1:raise FlowBlocked('Final free-entry control is not uniquely identifiable')
        await submit.click()
        await self.page.wait_for_timeout(2500)
        text=await self.page.locator('body').inner_text()
        evidence=await self.browser.evidence(self.page,self.run_id,'outcome-'+offer.identity)
        if re.search('check your email|verify your email',text,re.I):return {'status':'pending_verification','evidence':evidence}
        if re.search('successfully entered|you have been entered|thank you for entering',text,re.I):
            verified=await self.reconcile(offer.model_dump(mode='json'))
            if verified:return {'status':'confirmed','evidence':evidence,'account_evidence':verified}
        return {'status':'uncertain','evidence':evidence}
    async def reconcile(self,existing):
        await self.goto('https://lottery.broadwaydirect.com/check-status/')
        if await self.accessible():return None
        # Status form uses the same identity fields without first name or ticket quantity.
        for label,value in [('Last Name',self.profile['full_name'].split(' ',1)[-1]),('Email',self.profile['email'])]:
            field=self.page.get_by_label(re.compile(label,re.I))
            if await field.count()!=1:return None
            await field.fill(value)
        dob=datetime.fromisoformat(self.profile['date_of_birth'])
        for label,value in [('Month of Birth',str(dob.month)),('Day of Birth',str(dob.day)),('Year of Birth',str(dob.year))]:
            field=self.page.get_by_label(label,exact=False)
            if await field.count()!=1:return None
            await field.select_option(value=value)
        button=self.page.get_by_role('button',name=re.compile('Check.*Status',re.I))
        if await button.count()!=1:return None
        await button.click();await self.page.wait_for_timeout(2000)
        rows=await self.page.locator('tr').all_inner_texts()
        performance=datetime.fromisoformat(existing['performance'])
        for row in rows:
            if existing['show'].casefold() in row.casefold() and performance.strftime('%m/%d/%Y') in row and performance.strftime('%I:%M %p').lstrip('0').lower() in row.lower():
                return await self.browser.evidence(self.page,self.run_id,'reconciled-'+existing.get('id','entry').replace(':','-'))
        return None

class Telecharge(Provider):
    provider='telecharge'
    async def frame(self):
        return self.page.frame_locator('#st-window')
    async def discover(self):
        await self.goto(START[self.provider])
        if reason:=await self.accessible():return Inventory(offers=[],closed=[],blockers=[reason])
        root=await self.frame()
        await root.locator('body').wait_for()
        text=await root.locator('body').inner_text()
        if 'Login with Facebook' in text or ('Log In' in text and self.profile['full_name'].split()[0] not in text):
            return Inventory(offers=[],closed=[],blockers=['Telecharge requires a saved Facebook sign-in in the hosted browser'])
        lottery=root.get_by_text('Lottery',exact=True)
        if await lottery.count()==1:await lottery.click()
        await root.locator('.lottery_show').first.wait_for()
        cards=await root.locator('.lottery_show').all_inner_texts()
        self.cards=cards
        return await inventory(self.provider,{'url':self.page.url,'cards':cards},self.config,self.store)
    async def card(self,offer):
        root=await self.frame()
        card=root.locator('.lottery_show').filter(has_text=offer.show)
        if await card.count()!=1:raise FlowBlocked('Performance card is ambiguous')
        # Matching the exact source quotation guards model extraction against stale/mismatched cards.
        text=await card.inner_text()
        if offer.evidence not in text:raise FlowBlocked('Provider card no longer matches the discovered offer')
        return card
    async def prepare(self,offer):
        card=await self.card(offer)
        if 'Lottery Entered' in await card.inner_text():raise FlowBlocked('Already entered at provider')
        quantity=card.locator('select')
        if await quantity.count()==1:await quantity.select_option(str(offer.tickets))
        elif not re.search(r'\b2\b',await card.inner_text()):raise FlowBlocked('Two-ticket selection could not be established')
        await self.prepared_proof(offer,await self.frame())
    async def submit_and_verify(self,offer,active):
        card=await self.card(offer);active()
        button=card.get_by_text('Enter',exact=True)
        if await button.count()!=1:raise FlowBlocked('Free entry control is ambiguous')
        await button.click()
        await card.get_by_text('Lottery Entered!',exact=False).wait_for(timeout=20000)
        immediate=await self.browser.evidence(self.page,self.run_id,'outcome-'+offer.identity)
        await self.page.reload(wait_until='domcontentloaded')
        root=await self.frame()
        lottery=root.get_by_text('Lottery',exact=True)
        if await lottery.count()==1:await lottery.click()
        card=await self.card(offer)
        if 'Lottery Entered' not in await card.inner_text():return {'status':'uncertain','evidence':immediate}
        return {'status':'confirmed','evidence':await self.browser.evidence(self.page,self.run_id,'persisted-'+offer.identity)}
    async def reconcile(self,existing):
        from .policy import Offer
        try:
            await self.goto(START[self.provider]);root=await self.frame()
            lottery=root.get_by_text('Lottery',exact=True)
            if await lottery.count()==1:await lottery.click()
            card=await self.card(Offer.model_validate(existing))
            if 'Lottery Entered' in await card.inner_text():return await self.browser.evidence(self.page,self.run_id,'reconciled')
        except Exception:return None

class LuckySeat(Provider):
    provider='lucky_seat'
    async def discover(self):
        await self.goto(START[self.provider])
        if reason:=await self.accessible():return Inventory(offers=[],closed=[],blockers=[reason])
        links=await self.page.locator('a[href]').evaluate_all('(els)=>els.map(e=>({text:e.innerText,url:e.href}))')
        urls=list(dict.fromkeys(x['url'] for x in links if '/shows/' in x['url'] and 'newyork' in x['url'].lower() and allowed_url(self.provider,x['url'])))
        snapshots=[]
        for url in urls:
            await self.goto(url)
            if '/login' in self.page.url:
                if not self.config.get('luckyseat_password'):return Inventory(offers=[],closed=[],blockers=['Lucky Seat login is not connected'])
                await self.page.get_by_label(re.compile('email',re.I)).fill(self.config['luckyseat_email'])
                await self.page.get_by_label(re.compile('password',re.I)).fill(self.config['luckyseat_password'])
                await self.page.get_by_role('button',name=re.compile('log in|sign in',re.I)).click()
                await self.page.wait_for_timeout(2000)
                if '/login' in self.page.url:return Inventory(offers=[],closed=[],blockers=['Lucky Seat sign-in requires attention'])
            snapshots.append(await self.snapshot())
        if not snapshots:return Inventory(offers=[],closed=[],blockers=['No NYC show links found; city/category selection needs validation'])
        return await inventory(self.provider,snapshots,self.config,self.store)
    async def prepare(self,offer):
        await self.goto(offer.url)
        # Require an observed per-performance locator, never a guessed generic plus button.
        if not offer.locator:raise FlowBlocked('Lucky Seat performance selector needs live validation')
        row=self.page.locator(offer.locator)
        if await row.count()!=1 or offer.evidence not in await row.inner_text():raise FlowBlocked('Lucky Seat performance row is ambiguous')
        self.row=row
        plus=row.get_by_role('button',name=re.compile(r'^\+$|increase|add',re.I))
        if await plus.count()!=1:raise FlowBlocked('Lucky Seat plus control is ambiguous')
        for _ in range(offer.tickets):await plus.click()
        review=self.page.get_by_role('button',name=re.compile('Review',re.I))
        if await review.count()!=1:raise FlowBlocked('Review control missing')
        await review.click()
        dialog=self.page.get_by_role('dialog')
        text=await dialog.inner_text()
        if offer.show.casefold() not in text.casefold() or offer.evidence not in text or not re.search(rf'{offer.tickets}\s*tickets',text,re.I):raise FlowBlocked('Review does not confirm two tickets for this show')
        terms=dialog.get_by_role('checkbox',name=re.compile('terms|agree|rules',re.I))
        if await terms.count()==1:await terms.check()
        result=await self.captcha.solve(self.page,self.run_id,offer.identity)
        if result['status']=='blocked':raise FlowBlocked(result['reason'])
        self.dialog=dialog
    async def submit_and_verify(self,offer,active):
        active();button=self.dialog.get_by_role('button',name=re.compile('^Confirm$|^Enter Lottery$|^Submit$',re.I))
        if await button.count()!=1:raise FlowBlocked('Final free entry control is ambiguous')
        await button.click();await self.page.get_by_text(re.compile('received your entry',re.I)).wait_for(timeout=20000)
        # Keep pending until the account results can be matched to exact date and time.
        return {'status':'pending_verification','evidence':await self.browser.evidence(self.page,self.run_id,'outcome-'+offer.identity)}

ADAPTERS={'broadway_direct':BroadwayDirect,'telecharge':Telecharge,'lucky_seat':LuckySeat}
