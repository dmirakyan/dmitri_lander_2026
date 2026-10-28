import asyncio
import hmac
import os
import secrets
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse,Response
from pydantic import BaseModel,Field
from argon2 import PasswordHasher
from .store import Store,key
from .runner import Runner

COOKIE='__Secure-broadway'
ph=PasswordHasher()
SECRET_FIELDS={'openai_api_key','captcha_api_key','browserbase_api_key','luckyseat_password','resend_api_key'}
CONFIG_FIELDS=SECRET_FIELDS|{'browserbase_project_id','calendar_urls','calendar_email','manual_availability_only','report_from','report_to','model','luckyseat_email','browser_mode'}

def create_app(store=None,start_scheduler=True,adapters=None):
    store=store or Store()
    if adapters is None:
        from .providers import ADAPTERS
        adapters=ADAPTERS
    runner=Runner(store,adapters)
    @asynccontextmanager
    async def lifespan(app):
        task=asyncio.create_task(runner.loop()) if start_scheduler else None
        yield
        if task:
            task.cancel()
            try:await task
            except asyncio.CancelledError:pass
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)
    app.state.store=store
    app.state.runner=runner

    @app.middleware('http')
    async def security(request,call_next):
        if request.url.path=='/healthz':
            return await call_next(request)
        origin_secret=os.environ.get('ORIGIN_SECRET','')
        if not origin_secret or not hmac.compare_digest(request.headers.get('x-broadway-origin',''),origin_secret):
            return JSONResponse({'error':'Not found'},status_code=404)
        if request.method not in ('GET','HEAD'):
            origin=request.headers.get('origin','')
            if origin!=os.environ.get('PUBLIC_ORIGIN','https://dmitri.im'):
                return JSONResponse({'error':'Invalid request origin'},status_code=403)
            if request.headers.get('content-type','').split(';')[0]!='application/json':
                return JSONResponse({'error':'Expected JSON'},status_code=415)
            if len(await request.body())>1_000_000:
                return JSONResponse({'error':'Request too large'},status_code=413)
        if request.url.path not in ('/auth/login','/auth/bootstrap','/auth/status'):
            token=request.cookies.get(COOKIE,'')
            session=store.get('session:'+key(token)) if token else None
            if not session or session['expires']<time.time():
                return JSONResponse({'error':'Sign in required'},status_code=401)
        response=await call_next(request)
        response.headers['Cache-Control']='no-store'
        response.headers['X-Content-Type-Options']='nosniff'
        response.headers['X-Robots-Tag']='noindex, nofollow, noarchive'
        return response

    def issue_session():
        token=secrets.token_urlsafe(40)
        store.put('session:'+key(token),{'expires':time.time()+30*86400})
        response=JSONResponse({'ok':True})
        response.set_cookie(COOKIE,token,httponly=True,secure=True,samesite='strict',path='/broadway/api/',max_age=30*86400)
        return response

    def throttle(request):
        # Worker replaces this header with the trusted edge IP.
        who=key(request.headers.get('x-client-ip','unknown'))
        bucket='auth-limit:'+who+':'+str(int(time.time()//900))
        record=store.get(bucket,{'count':0})
        if record['count']>=10:raise HTTPException(429,'Try again in 15 minutes')
        record['count']+=1;store.put(bucket,record)

    @app.get('/healthz')
    def health():
        try:store.get('settings')
        except Exception:return JSONResponse({'status':'database_unavailable'},status_code=503)
        heartbeat=store.get('health:scheduler',{}).get('heartbeat',0)
        fresh=time.time()-heartbeat<120
        if start_scheduler and not fresh:return JSONResponse({'status':'scheduler_stale'},status_code=503)
        return {'status':'ok','scheduler_fresh':fresh}

    @app.get('/auth/status')
    def auth_status(request:Request):
        token=request.cookies.get(COOKIE,'')
        session=store.get('session:'+key(token),{}) if token else {}
        return {'initialized':bool(store.get('auth:password')),'authenticated':session.get('expires',0)>time.time()}

    class Login(BaseModel):
        password:str=Field(min_length=1,max_length=256)
        bootstrap_token:str=''

    @app.post('/auth/bootstrap')
    def bootstrap(body:Login,request:Request):
        throttle(request)
        if store.get('auth:password'):raise HTTPException(409,'Already initialized')
        expected=os.environ.get('BOOTSTRAP_TOKEN_HASH','')
        if not expected or not hmac.compare_digest(key(body.bootstrap_token),expected):raise HTTPException(403,'Invalid setup code')
        if len(body.password)<14:raise HTTPException(422,'Use at least 14 characters')
        if not store.once('auth:password',{'hash':ph.hash(body.password)}):raise HTTPException(409,'Already initialized')
        return issue_session()

    @app.post('/auth/login')
    def login(body:Login,request:Request):
        throttle(request)
        saved=store.get('auth:password',{})
        try:ph.verify(saved.get('hash',''),body.password)
        except Exception:raise HTTPException(401,'Incorrect password')
        return issue_session()

    @app.post('/auth/logout')
    def logout(request:Request):
        store.put('session:'+key(request.cookies.get(COOKIE,'')),{'expires':0})
        response=JSONResponse({'ok':True});response.delete_cookie(COOKIE,path='/broadway/api/',secure=True,httponly=True,samesite='strict');return response

    def readiness():
        config=store.get('config',{});profile=store.get('profile',{})
        blockers=[]
        if not profile: blockers.append('Import your existing lottery profile and entry history')
        if not config.get('openai_api_key'):blockers.append('Connect OpenAI')
        if config.get('browser_mode')=='browserbase' and not all(config.get(k) for k in ('browserbase_api_key','browserbase_project_id')):blockers.append('Connect Browserbase')
        if not config.get('calendar_urls') and not config.get('manual_availability_only'):blockers.append('Connect calendars or select saved availability')
        if not config.get('resend_api_key') or not config.get('report_from'):blockers.append('Connect batch email reporting')
        if not store.get('migration:legacy',{}).get('scheduler_disabled'):blockers.append('Complete scheduler handover to avoid two runners')
        return blockers

    @app.get('/status')
    def status():
        config=store.get('config',{})
        from datetime import datetime
        from .policy import NY
        today=datetime.now(NY).date().isoformat()
        upcoming=[{k:e.get(k) for k in ('provider','show','performance','tickets','status','legacy_source')} for e in store.list('entry:',2000) if e.get('performance','')[:10]>=today]
        return {'upcoming':sorted(upcoming,key=lambda e:e['performance']),'settings':store.get('settings',{'enabled':False}), 'blockers':readiness(), 'integrations':store.list('integration:'), 'runs':store.list('run:',30), 'reports':[{k:v for k,v in r.items() if k!='text'} for r in store.list('report:',30)], 'scheduler':store.get('health:scheduler',{}),'configured':{k:bool(config.get(k)) for k in CONFIG_FIELDS},'config_public':{k:config.get(k) for k in ('browserbase_project_id','luckyseat_email','report_from','report_to','browser_mode','manual_availability_only')},'authorization':{'free_entries':True,'required_terms':True,'captcha':True,'purchases':False},'schedule':'09:05 and 10:05 America/New_York'}

    class Toggle(BaseModel):enabled:bool
    @app.post('/toggle')
    def toggle(body:Toggle):
        if body.enabled and readiness():raise HTTPException(409,{'blockers':readiness()})
        store.put('settings',{'enabled':body.enabled,'changed_at':time.time()})
        return {'enabled':body.enabled}

    class RunRequest(BaseModel):mode:str='inspect'
    @app.post('/runs')
    def run(body:RunRequest):
        if body.mode not in ('inspect','live'):raise HTTPException(422,'Invalid run mode')
        if body.mode=='live' and (readiness() or not store.get('settings',{}).get('enabled')):raise HTTPException(409,'Complete setup and turn automation on first')
        if any(r['status'] in ('queued','running') for r in store.list('run:',100)):raise HTTPException(409,'A run is already queued or running')
        return {'run_id':runner.enqueue(mode=body.mode)}

    @app.post('/runs/{run_id}/stop')
    def stop(run_id:str):
        run=store.get('run:'+run_id)
        if not run:raise HTTPException(404)
        run['cancel_requested']=True;store.put('run:'+run_id,run);return {'ok':True}

    @app.post('/config')
    def config(body:dict):
        if not set(body)<=CONFIG_FIELDS:raise HTTPException(422,'Unknown setting')
        if 'calendar_urls' in body and (not isinstance(body['calendar_urls'],list) or len(body['calendar_urls'])>5):raise HTTPException(422,'Maximum five calendars')
        for k,v in body.items():
            if k=='manual_availability_only' and not isinstance(v,bool):raise HTTPException(422,'Availability setting must be true or false')
            if k=='calendar_urls' and any(not isinstance(u,str) or not u.startswith('https://') for u in v):raise HTTPException(422,'Use HTTPS calendar URLs')
            if k not in ('manual_availability_only','calendar_urls') and (not isinstance(v,str) or len(v)>4096):raise HTTPException(422,'Invalid connection value')
        if body.get('browser_mode','browserbase') not in ('local','browserbase'):raise HTTPException(422,'Invalid browser mode')
        saved=store.get('config',{})
        for k,v in body.items():
            if k in SECRET_FIELDS and not v:continue
            saved[k]=v
        store.put('config',saved);return {'ok':True}

    @app.get('/preferences')
    def get_preferences():
        profile=store.get('profile',{})
        return {k:profile.get(k) for k in ('ticket_count','max_price_per_ticket_usd','attendance_preferences','show_preferences')}

    @app.post('/preferences')
    def preferences(body:dict):
        if not set(body)<={'ticket_count','max_price_per_ticket_usd','attendance_preferences','show_preferences'}:raise HTTPException(422,'Unknown preference')
        if body.get('ticket_count',2) not in (1,2):raise HTTPException(422,'Ticket count must be 1 or 2')
        if not 0<body.get('max_price_per_ticket_usd',100)<=1000:raise HTTPException(422,'Invalid price limit')
        try:
            from datetime import date,time as datetime_time
            for r in body.get('attendance_preferences',{}).get('unavailable_date_ranges',[]):
                if date.fromisoformat(r['start'])>date.fromisoformat(r['end']):raise ValueError()
            datetime_time.fromisoformat(body.get('attendance_preferences',{}).get('weekdays',{}).get('earliest_start','18:00'))
            if any(not isinstance(x,str) or not x.strip() for x in body.get('show_preferences',{}).get('excluded',[])):raise ValueError()
        except Exception:raise HTTPException(422,'Invalid availability or exclusions')
        profile=store.get('profile',{});profile.update(body);store.put('profile',profile);return {'ok':True}

    @app.post('/providers/{provider}/login')
    async def provider_login(provider:str):
        from .setup_browser import open_login
        try:return await open_login(store,provider)
        except ValueError as exc:raise HTTPException(409,str(exc))
        except Exception:raise HTTPException(502,'Browser login session could not start; check Browserbase connection')

    @app.post('/providers/{provider}/login/finish')
    async def provider_login_finish(provider:str):
        from .setup_browser import close_login
        try:await close_login(store,provider)
        except Exception:raise HTTPException(502,'Session could not be saved; try again')
        return {'ok':True}

    @app.get('/entries')
    def entries():return store.list('entry:',500)

    @app.get('/reports/{run_id}')
    def report(run_id:str):
        record=store.get('report:'+run_id)
        if not record:raise HTTPException(404)
        return record

    return app


def application():return create_app()
