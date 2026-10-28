import asyncio
import time
import uuid
from datetime import datetime
from .errors import FlowBlocked
from .policy import NY,PROVIDERS,eligibility,entry_identity
from .integrations import calendar_blackouts,send_report

class Stopped(Exception):pass

class Runner:
    def __init__(self,store,adapters):
        self.store,self.adapters=store,adapters
        self.owner=uuid.uuid4().hex

    def active(self,run_id,offer=None,calendar_ranges=()):
        settings=self.store.get('settings',{})
        run=self.store.get('run:'+run_id,{})
        if not self.store.lease('runner',self.owner):
            raise Stopped('Execution lease lost')
        if not settings.get('enabled') or run.get('cancel_requested'):
            raise Stopped('Automation is off; no further submissions')
        if offer is not None:
            profile=self.store.get('profile',{})
            profile.setdefault('attendance_preferences',{}).setdefault('unavailable_date_ranges',[]).extend(calendar_ranges)
            if eligibility(profile,offer):raise Stopped('Preferences changed; stop before submission')

    def enqueue(self,source='manual',slot=None,mode='live'):
        run_id=slot or datetime.now(NY).strftime('%Y%m%d-%H%M%S-')+uuid.uuid4().hex[:6]
        record={'run_id':run_id,'source':source,'mode':mode,'status':'queued','created_at':time.time(),'outcomes':[]}
        if not self.store.once('run:'+run_id,record):return run_id
        return run_id

    async def heartbeat(self):
        while True:
            await asyncio.sleep(20)
            self.store.put('health:scheduler',{'heartbeat':time.time()})
            if not self.store.lease('runner',self.owner):raise Stopped('Execution lease lost')

    async def execute(self,run_id):
        if not self.store.lease('runner',self.owner):return
        run=self.store.get('run:'+run_id)
        if run['status'] not in ('queued','running'):
            self.store.release('runner',self.owner);return
        run.update(status='running',started_at=run.get('started_at',time.time()))
        self.store.put('run:'+run_id,run)
        heartbeat=asyncio.create_task(self.heartbeat())
        config=self.store.get('config',{})
        profile=self.store.get('profile',{})
        def outcome(**item):
            run['outcomes'].append(item)
            self.store.put('run:'+run_id,run)
        try:
            if run['mode']=='live':self.active(run_id)
            ranges=[]
            try:
                ranges=await calendar_blackouts(config)
                profile.setdefault('attendance_preferences',{}).setdefault('unavailable_date_ranges',[]).extend(ranges)
                self.store.put('integration:calendar',{'status':'verified','checked_at':time.time()})
            except Exception:
                self.store.put('integration:calendar',{'status':'blocked','reason':'Connect calendar feeds or explicitly use saved availability','checked_at':time.time()})
                if not config.get('manual_availability_only') and run['mode']=='live':
                    outcome(provider='calendar',status='blocked',reason='Calendar unavailable; live entries require current availability')
                    run['status']='blocked';return
            for provider in PROVIDERS:
                if heartbeat.done():heartbeat.result()
                if run['mode']=='live':self.active(run_id)
                adapter=self.adapters[provider](self.store,config,profile,run_id)
                try:
                    async with adapter:
                        entries=[e for e in self.store.list('entry:',limit=10000) if e.get('provider')==provider]
                        # Imported records retain their old storage keys. Compare their
                        # canonical identities too, rather than reindexing or duplicating history.
                        try:
                            recorded={entry_identity(provider,e['show'],datetime.fromisoformat(e['performance'])) for e in entries}
                        except (KeyError,ValueError,TypeError):raise FlowBlocked('Saved entry identity needs repair before new submissions')
                        # Reconcile uncertain attempts BEFORE discovering new entries.
                        for existing in entries:
                            if existing.get('provider')==provider and existing.get('status') in ('uncertain','pending_verification'):
                                verified=await adapter.reconcile(existing)
                                if verified:
                                    existing.update(status='confirmed',verification=verified)
                                    self.store.put(existing['id'],existing)
                                    outcome(provider=provider,show=existing['show'],status='reconciled_existing')
                        discovery=await adapter.discover()
                        for reason in discovery.blockers:outcome(provider=provider,status='blocked',reason=reason)
                        for title in discovery.closed:outcome(provider=provider,show=title,status='closed')
                        for offer in discovery.offers:
                            record=offer.model_dump(mode='json')
                            reason='Provider identity mismatch' if offer.provider!=provider else eligibility(profile,offer)
                            if reason:outcome(**{k:record[k] for k in ('provider','show','performance')},status='skipped',reason=reason);continue
                            if offer.identity in recorded or self.store.get('entry:'+offer.identity):
                                outcome(provider=provider,show=offer.show,performance=record['performance'],status='already_recorded');continue
                            if run['mode']!='live':
                                outcome(provider=provider,show=offer.show,performance=record['performance'],status='eligible_read_only');continue
                            # Prepare can navigate and fill; no final submission yet.
                            try:
                                await adapter.prepare(offer)
                            except Exception as exc:
                                outcome(provider=provider,show=offer.show,performance=record['performance'],status='blocked',reason=str(exc) if isinstance(exc,FlowBlocked) else f'{type(exc).__name__}: form preparation failed before submission')
                                continue
                            self.active(run_id,offer,ranges)
                            if heartbeat.done():heartbeat.result()
                            record.update(status='uncertain',run_id=run_id,attempted_at=time.time())
                            if not self.store.once('entry:'+offer.identity,record):continue
                            recorded.add(offer.identity)
                            try:
                                evidence=await adapter.submit_and_verify(offer,lambda:self.active(run_id,offer,ranges))
                                record.update(status=evidence['status'],verification=evidence)
                            except Exception as exc:
                                record.update(status='uncertain',reason=f'{type(exc).__name__}: submission outcome needs reconciliation')
                            self.store.put('entry:'+offer.identity,record)
                            outcome(provider=provider,show=offer.show,performance=record['performance'],status=record['status'],reason=record.get('reason',''))
                        self.store.put('integration:'+provider,{'status':'checked','checked_at':time.time(),'run_id':run_id,'blockers':discovery.blockers})
                except Stopped:raise
                except Exception as exc:
                    # Never write exceptions that may contain cookies/keys into reports.
                    reason=str(exc) if isinstance(exc,FlowBlocked) else f'{type(exc).__name__}: provider flow did not complete; inspect private evidence'
                    outcome(provider=provider,status='blocked',reason=reason)
                    self.store.put('integration:'+provider,{'status':'blocked','reason':reason,'checked_at':time.time()})
            run['status']='partial' if any(x['status'] in ('blocked','uncertain','pending_verification') for x in run['outcomes']) else 'completed'
        except Stopped:
            run['status']='stopped'
        except asyncio.CancelledError:
            # Durable running state is recovered after the lease expires.
            raise
        except Exception as exc:
            run['status']='failed';outcome(provider='runner',status='blocked',reason=type(exc).__name__)
        finally:
            heartbeat.cancel()
            if run['status']!='running':run['finished_at']=time.time()
            self.store.put('run:'+run_id,run)
            if run['status']!='running':await send_report(self.store,run,config)
            self.store.release('runner',self.owner)

    async def tick(self):
        self.store.put('health:scheduler',{'heartbeat':time.time()})
        settings=self.store.get('settings',{})
        now=datetime.now(NY)
        if settings.get('enabled'):
            # Catch up a scheduled slot for 30 minutes after restart; durable key prevents repeats.
            for hour in (9,10):
                slot=now.replace(hour=hour,minute=5,second=0,microsecond=0)
                if 0 <= (now-slot).total_seconds() < 1800:
                    self.enqueue('schedule',slot=slot.strftime('scheduled-%Y%m%d-%H%M'))
        config=self.store.get('config',{})
        if config.get('resend_api_key') and config.get('report_from'):
            for report in self.store.list('report:',100):
                if report['status'] in ('pending','blocked','sending','uncertain'):
                    run=self.store.get('run:'+report['run_id'])
                    if run and run['status'] not in ('queued','running'):await send_report(self.store,run,config)
        pending=[r for r in self.store.list('run:',100) if r['status'] in ('queued','running')]
        for run in reversed(pending):await self.execute(run['run_id'])

    async def loop(self):
        while True:
            try:await self.tick()
            except asyncio.CancelledError:raise
            except Exception:
                # A transient database/network failure must not kill scheduling forever.
                await asyncio.sleep(15)
            await asyncio.sleep(15)
