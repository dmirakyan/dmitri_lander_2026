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
        if 'CLICK A SOCIAL NETWORK TO GET STARTED' in text.upper() or 'Login with Facebook' in text or ('Log In' in text and self.profile['full_name'].split()[0] not in text):
            return Inventory(offers=[],closed=[],blockers=['Telecharge requires a one-time sign-in in the hosted browser'])
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

def luckyseat_result_matches(text, existing):
    """Results omit the performance year; anchor it to an explicit nearby drawing."""
    from .policy import NY
    performance=datetime.fromisoformat(existing['performance']).astimezone(NY)
    lines=[' '.join(line.split()) for line in text.splitlines() if line.strip()]
    expected=performance.strftime('%b ')+str(performance.day)+performance.strftime(' at %I:%M %p').replace(' at 0',' at ')
    if len(lines)<5:return False
    try:drawing=datetime.strptime(lines[4],'Drawing on %A, %B %d, %Y').date()
    except ValueError:return False
    return (lines[0].casefold()==existing['show'].casefold()
        and lines[1]=='New York, NY' and lines[2]==expected
        and lines[3]==f"{existing.get('tickets',2)} ticket(s)"
        and 0<=(performance.date()-drawing).days<=14)


class LuckySeat(Provider):
    provider='lucky_seat'

    async def ensure_login(self):
        login=self.page.get_by_role('button',name='Log in/Sign up to enter',exact=True)
        if await login.count():await login.click()
        if '/account/login' in self.page.url:
            if not self.config.get('luckyseat_email') or not self.config.get('luckyseat_password'):
                raise FlowBlocked('Lucky Seat login is not connected')
            await self.page.get_by_placeholder('Email',exact=True).fill(self.config['luckyseat_email'])
            await self.page.get_by_placeholder('Password',exact=True).fill(self.config['luckyseat_password'])
            await self.page.locator('input[type=submit]').click()
            try:await self.page.wait_for_url(lambda url:'/account/login' not in str(url),timeout=15000)
            except Exception:raise FlowBlocked('Lucky Seat sign-in requires attention')

    async def performances(self):
        return await self.page.locator('.form-checkbox-btn input[type=checkbox]').evaluate_all('''els=>els.map(e=>{
            const group=e.closest('.form-checkbox-btn');
            const row=group.parentElement.parentElement;
            const date=row.innerText.trim().split('\\n')[0].trim();
            const time=group.innerText.trim();
            return {id:e.id,date,time,disabled:e.disabled,evidence:date+'\\n'+time};
        })''')

    async def discover(self):
        from .policy import Offer,NY
        await self.goto(START[self.provider])
        if reason:=await self.accessible():return Inventory(offers=[],closed=[],blockers=[reason])
        await self.page.locator('#cities').select_option(label='New York City')
        await self.page.locator('#category').select_option(label='Broadway')
        titles=await self.page.locator('.showBlockChild h3').all_inner_texts()
        titles=list(dict.fromkeys(t.strip() for t in titles))
        result=Inventory(offers=[],closed=[],blockers=[])
        if not titles:result.blockers.append('No NYC Broadway show cards found');return result
        # Cards are Angular navigation controls, not anchors. Reapply filters on return.
        for title in titles:
            await self.goto(START[self.provider])
            await self.page.locator('#cities').select_option(label='New York City')
            await self.page.locator('#category').select_option(label='Broadway')
            card=self.page.locator('.showBlockChild h3').filter(has_text=re.compile('^\\s*'+re.escape(title)+'\\s*$'))
            if await card.count()!=1:result.blockers.append(f'{title}: show card is ambiguous');continue
            await card.click()
            await self.page.wait_for_url('**/shows/**',timeout=15000)
            url=self.page.url
            if not allowed_url(self.provider,url):raise FlowBlocked('Lucky Seat show opened outside its official domain')
            await self.ensure_login()
            if self.page.url!=url:await self.goto(url)
            await self.page.get_by_text('Ticket price',exact=True).wait_for(timeout=15000)
            rows=await self.performances()
            if not rows:
                result.blockers.append(f'{title}: no selectable performance inventory; inspect provider page')
                continue
            price_text=await self.page.get_by_text('Ticket price',exact=True).evaluate('(e)=>e.parentElement.innerText')
            price=re.search(r'\$([\d,.]+)\s*\([^)]*fee[^)]*\)\s*per\s*ticket',price_text,re.I)
            if not price:result.blockers.append(f'{title}: total price including fees is not explicit');continue
            for row in rows:
                try:
                    performance=datetime.strptime(row['date']+' '+row['time'],'%A, %B %d, %Y %I:%M %p').replace(tzinfo=NY)
                    if not re.fullmatch(r'\d+',row['id']):raise ValueError()
                except ValueError:result.blockers.append(f'{title}: performance date or ID could not be read');continue
                result.offers.append(Offer(provider=self.provider,show=title,performance=performance,
                    drawing='performance-'+row['id'],url=url,price=float(price.group(1).replace(',','')),
                    total_price_including_fees=True,tickets=self.profile['ticket_count'],broadway=True,
                    evidence=row['evidence'],locator='input[id="'+row['id']+'"][type="checkbox"]'))
            await self.browser.evidence(self.page,self.run_id,'inventory-'+url.rsplit('/',1)[-1])
        return result

    async def prepare(self,offer):
        await self.goto(offer.url);await self.ensure_login()
        if self.page.url!=offer.url:await self.goto(offer.url)
        rows=await self.performances()
        matches=[r for r in rows if r['evidence']==offer.evidence and offer.locator=='input[id="'+r['id']+'"][type="checkbox"]']
        if len(matches)!=1:raise FlowBlocked('Lucky Seat performance no longer matches observed date and time')
        if matches[0]['disabled']:raise FlowBlocked('Lucky Seat performance is unavailable or already entered; reconcile results')
        if offer.show.casefold() not in (await self.page.locator('body').inner_text()).casefold():raise FlowBlocked('Lucky Seat show does not match')
        venue=await self.page.get_by_text('Venue',exact=True).evaluate('(e)=>e.parentElement.innerText.split("\\n").slice(1).join("\\n")')
        theatre=venue.splitlines()[0].strip()
        await self.page.locator('label[for="'+matches[0]['id']+'"]').click()
        if not await self.page.locator(offer.locator).is_checked():raise FlowBlocked('Lucky Seat performance selection did not persist')
        quantity=self.page.locator('.form-number input[type=number]')
        if await quantity.count()!=1:raise FlowBlocked('Lucky Seat ticket counter is ambiguous')
        # Angular state changes through the plus/minus controls, not a typed value.
        for _ in range(3):
            value=int(await quantity.input_value() or '0')
            if value==offer.tickets:break
            await self.page.locator('.form-number-plus' if value<offer.tickets else '.form-number-minus').click()
        if int(await quantity.input_value())!=offer.tickets:raise FlowBlocked('Lucky Seat ticket count could not be established')
        result=await self.captcha.solve(self.page,self.run_id,offer.identity)
        if result['status']=='blocked':raise FlowBlocked(result['reason'])
        await self.page.get_by_role('button',name='Submit Entry',exact=True).click()
        dialog=self.page.get_by_role('dialog')
        await dialog.wait_for(timeout=15000)
        text=await dialog.inner_text()
        if not theatre or theatre not in text or not re.search(rf'You selected\s+{offer.tickets}\s+ticket\(s\)',text,re.I):raise FlowBlocked('Lucky Seat review does not confirm the venue and ticket count')
        # The provider review lists one line per selected performance.
        reviewed=await dialog.locator('[class~="leading-1.5"].mb-5 > div').all_inner_texts()
        expected=' '.join(offer.evidence.split())
        if len(reviewed)!=1 or ' '.join(reviewed[0].split())!=expected:
            raise FlowBlocked('Lucky Seat review does not confirm the performance date and time')
        terms=dialog.locator('input[name="acknowledgebox"][type="checkbox"]')
        if await terms.count()!=1:raise FlowBlocked('Lucky Seat required terms checkbox is ambiguous')
        await terms.check()
        self.dialog=dialog
        await self.browser.evidence(self.page,self.run_id,'prepared-'+offer.identity)

    async def submit_and_verify(self,offer,active):
        active();button=self.dialog.get_by_text('Confirm & Submit',exact=True)
        if await button.count()!=1:raise FlowBlocked('Final free entry control is ambiguous')
        await button.click();await self.page.get_by_text(re.compile('received your entry',re.I)).wait_for(timeout=20000)
        immediate=await self.browser.evidence(self.page,self.run_id,'outcome-'+offer.identity)
        verified=await self.reconcile(offer.model_dump(mode='json'))
        return {'status':'confirmed' if verified else 'pending_verification','evidence':immediate,'account_evidence':verified}

    async def reconcile(self,existing):
        await self.goto('https://www.luckyseat.com/dash/results')
        await self.ensure_login()
        if self.page.url!='https://www.luckyseat.com/dash/results':await self.goto('https://www.luckyseat.com/dash/results')
        await self.page.get_by_text('Entries & Results',exact=True).wait_for(timeout=15000)
        rows=await self.page.locator('div.grid.grid-cols-12').all_inner_texts()
        matches=[text for text in rows if luckyseat_result_matches(text,existing)]
        if len(matches)==1:return await self.browser.evidence(self.page,self.run_id,'reconciled-'+__import__('hashlib').sha256(str(existing).encode()).hexdigest()[:16])
        return None

ADAPTERS={'broadway_direct':BroadwayDirect,'telecharge':Telecharge,'lucky_seat':LuckySeat}
