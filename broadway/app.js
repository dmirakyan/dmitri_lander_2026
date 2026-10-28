const $ = s => document.querySelector(s);
const names = {broadway_direct:'Broadway Direct',telecharge:'Telecharge',lucky_seat:'Lucky Seat',calendar:'Availability',email:'Batch reports',openai:'OpenAI agent',captcha:'CAPTCHA solving',browser:'Hosted browser',scheduler:'Schedule'};
let current, canManage=false, prefs={};
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function notice(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
async function api(path,body){
 const response=await fetch('/broadway/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok){if(response.status===401)canManage=false;throw new Error(typeof data.detail==='object'?data.detail.blockers?.join('\n')||JSON.stringify(data.detail):data.detail||data.error||'Request failed');}return data;
}
async function action(fn){try{notice('');await fn();}catch(error){notice(error.message);}}
function date(t){return t?new Date(t*1000).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not yet checked';}
function render(data){
 current=data;$('#workspace').hidden=false;
 document.querySelectorAll('[data-owner]').forEach(el=>el.hidden=!canManage);
 $('#access-label').textContent=canManage?'YOUR CONTROLS':'BROADWAY ACTIVITY';
 const on=data.settings.enabled;$('#toggle').setAttribute('aria-checked',String(on));$('#runner-state').textContent=on?'On. Watching your lotteries.':'Off. Ready when you are.';
 $('#runner-detail').textContent=!canManage?(on?'Scheduled lottery entries are enabled.':'Automatic entries are currently off.'):on?'New submissions stop when you turn this off. An entry already sent will still be reconciled.':data.blockers.length?'Finish the connections below before enabling automatic entries.':'Your history and settings are saved. Switch on to resume scheduled entries.';
 $('#schedule').textContent=data.schedule;$('#heartbeat').textContent='Runner heartbeat: '+date(data.scheduler.heartbeat);
 $('#blockers').hidden=!data.blockers.length;$('#blockers ul').innerHTML=data.blockers.map(x=>'<li>'+escape(x)+'</li>').join('');
 $('#run').disabled=!on||data.runs.some(r=>['queued','running'].includes(r.status));
 const integrations=Object.fromEntries(data.integrations.map(x=>[x.id.split(':')[1],x]));
 const budget=data.budget;$('#budget').textContent=budget?'Monthly target: $30 · hosting, backups and Browserbase: $27.20 · model limit: $1.50 · CAPTCHA limit: $0.50. Browser usage is monitored to stop before expected overage.':'Monthly budget information is loading.';
 const reports=data.reports;integrations.email=reports.length?{status:reports[0].status,reason:reports[0].reason}:{status:data.configured.resend_api_key?'configured':'not connected'};
 integrations.openai=integrations.openai||{status:data.configured.openai_api_key?'configured':'not connected',reason:'Extracts provider details; entry rules are enforced by code.'};
 integrations.browser=integrations.browser||{status:data.configured.browserbase_api_key?'configured':'not connected',reason:'Persistent browser sessions, separate from your Mac.'};
 integrations.scheduler={status:Date.now()/1000-data.scheduler.heartbeat<120?'verified':'not checked',reason:data.schedule};
 $('#upcoming-title').textContent=`${(data.upcoming||[]).length} saved upcoming entries`;
 $('#upcoming').innerHTML=(data.upcoming||[]).map(e=>`<div class="run"><strong>${escape(e.show)}</strong><p>${escape(e.performance)} · ${escape(e.tickets)} tickets · ${escape(e.status)}${e.legacy_source?' · imported history':''}</p></div>`).join('')||'<p class="muted">No upcoming entries saved.</p>';
 $('#flows').innerHTML=Object.entries(names).map(([id,name])=>{const i=integrations[id]||{status:'not checked'};const good=['verified','sent'].includes(i.status);const bad=['blocked','failed','uncertain'].includes(i.status);return `<article class="flow"><span class="badge ${good?'good':bad?'bad':''}">${escape(i.status)}</span><h3>${name}</h3><p>${escape(i.reason||i.blockers?.join('; ')||date(i.checked_at))}</p></article>`}).join('');
 $('#runs').innerHTML=data.runs.length?data.runs.map(r=>{const confirmed=r.outcomes.filter(o=>o.status==='confirmed').length;const blocked=r.outcomes.filter(o=>['blocked','uncertain','pending_verification'].includes(o.status)).length;return `<article class="run"><div class="run-top"><strong>${escape(date(r.created_at))}</strong><span class="badge ${r.status==='completed'?'good':''}">${escape(r.status)} · ${escape(r.mode)}</span></div><p>${confirmed} new confirmed entries · ${blocked} unresolved outcomes · ${escape(r.run_id)}</p><details><summary>View outcomes</summary><table><tbody>${r.outcomes.map(o=>`<tr><td>${escape(names[o.provider]||o.provider)}</td><td>${escape(o.show)}</td><td>${escape(o.performance)}</td><td>${escape(o.status)}</td><td>${escape(o.reason)}</td></tr>`).join('')}</tbody></table></details></article>`}).join(''):'<p class="muted">No hosted batches yet. Use “Check all connections” for a read-only run.</p>';
 for(const [key,value] of Object.entries(data.config_public||{})){const field=$(`#config-form [name="${key}"]`);if(field&&document.activeElement!==field&&value!==null){if(field.type==='checkbox')field.checked=value;else if(!field.value)field.value=value;}}
 for(const [key,configured] of Object.entries(data.configured)){const field=$(`#config-form [name="${key}"]`);if(field?.type==='password')field.placeholder=configured?'Saved securely — leave blank to keep':'Not connected';}
}
async function refresh(){
 try{render(await api(canManage?'status':'public/status'));}
 catch(error){if(!canManage)render(await api('public/status'));else throw error;}
}
async function start(){await action(async()=>{
 const fragment=new URLSearchParams(location.hash.slice(1));const ownerToken=fragment.get('owner');
 if(ownerToken){history.replaceState(null,'',location.pathname+location.search);try{await api('auth/owner',{token:ownerToken});}catch(error){notice(error.message);}}
 const auth=await api('auth/status');canManage=auth.authenticated;await refresh();
 if(canManage){prefs=await api('preferences');const f=$('#preferences-form');f.ticket_count.value=prefs.ticket_count||2;f.max_price_per_ticket_usd.value=prefs.max_price_per_ticket_usd||100;f.blackouts.value=(prefs.attendance_preferences?.unavailable_date_ranges||[]).map(x=>x.start+' / '+x.end).join('\n');f.excluded.value=(prefs.show_preferences?.excluded||[]).join('\n');}
});}
$('#toggle').onclick=()=>action(async()=>{await api('toggle',{enabled:!current.settings.enabled});await refresh();});
$('#inspect').onclick=()=>action(async()=>{await api('runs',{mode:'inspect'});await refresh();});
$('#run').onclick=()=>action(async()=>{await api('runs',{mode:'live'});await refresh();});
$('#logout').onclick=()=>action(async()=>{await api('auth/logout',{});location.reload();});
$('#config-form').onsubmit=e=>{e.preventDefault();action(async()=>{const form=e.target;const data={};for(const [k,v] of new FormData(form)){if(v&&k!=='manual_availability_only'&&k!=='calendar_urls')data[k]=v;}if(form.calendar_urls.value.trim())data.calendar_urls=form.calendar_urls.value.split('\n').map(x=>x.trim()).filter(Boolean);data.manual_availability_only=form.manual_availability_only.checked;await api('config',data);form.querySelectorAll('input[type=password]').forEach(x=>x.value='');await refresh();notice('Connections saved. Run a connection check to verify them.');});};
$('#preferences-form').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target;const ranges=f.blackouts.value.split('\n').filter(x=>x.trim()).map(x=>{const dates=x.split('/').map(x=>x.trim());if(dates.length!==2||dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d))||dates[0]>dates[1])throw new Error('Use YYYY-MM-DD / YYYY-MM-DD for each unavailable range.');return {start:dates[0],end:dates[1],inclusive:true,reason:'Dashboard preference'};});await api('preferences',{ticket_count:Number(f.ticket_count.value),max_price_per_ticket_usd:Number(f.max_price_per_ticket_usd.value),attendance_preferences:{...prefs.attendance_preferences,unavailable_date_ranges:ranges},show_preferences:{...prefs.show_preferences,excluded:f.excluded.value.split('\n').map(x=>x.trim()).filter(Boolean)}});prefs=await api('preferences');notice('Preferences saved.');});};
start();setInterval(()=>{if(!$('#workspace').hidden)refresh().catch(e=>notice(e.message));},15000);

let loginProvider;
document.querySelectorAll('.provider-login').forEach(button=>button.onclick=()=>action(async()=>{button.disabled=true;try{const result=await api('providers/'+button.dataset.provider+'/login',{});loginProvider=button.dataset.provider;$('#browser-login-link').href=result.url;$('#browser-login').hidden=false;notice('Open the private browser session, sign in, then return here and finish the session.');}finally{button.disabled=false;}}));
$('#finish-login').onclick=()=>action(async()=>{await api('providers/'+loginProvider+'/login/finish',{});$('#browser-login').hidden=true;$('#browser-login-link').removeAttribute('href');notice('Browser session saved. Run a connection check to verify account access.');});
