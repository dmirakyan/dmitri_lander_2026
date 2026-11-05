'use strict';
const $=id=>document.getElementById(id);
const bootstrap = document.querySelector('meta[name=local-runner-key]');
const token = bootstrap?.content || '';
bootstrap?.remove();
let revision = '', dirty = false;
// Retire old cross-origin connection credentials without persisting them.
sessionStorage.removeItem('lottery-key');
if (new URLSearchParams(location.hash.slice(1)).has('key')) {
  history.replaceState(null, '', location.pathname);
}
async function request(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;}
const pretty=s=>(s||'Not recorded').replaceAll('_',' ');
const runStatus=run=>run?.runs?.at(-1)?.status || run?.run_status;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function render(data){const p=data.profile,a=p.attendance_preferences;revision=data.revision;$('status').textContent=pretty(data.automation.status);$('schedule').textContent=data.automation.schedule_label;$('schedule-note').textContent=data.automation.status==='PAUSED'?'The schedule is paused. See run history for completed live tests.':data.automation.schedule_label;$('confirmed').textContent=data.runs.reduce((sum,r)=>sum+(r.entries||[]).filter(e=>e.status==='confirmed').length,0);const latest=data.runs[0];$('last-date').textContent=latest?.date||'No runs';$('run-status').textContent=pretty(runStatus(latest));$('tickets').value=p.ticket_count;$('price').value=p.max_price_per_ticket_usd;$('start').value=a.weekdays.earliest_start;$('matinees').checked=!!a.weekends?.matinees;$('evenings').checked=!!a.weekends?.evenings;$('next-day').checked=!!a.next_day_allowed;$('trips').checked=!!p.calendar.skip_trips_away;$('conflicts').checked=!!p.calendar.skip_ordinary_conflicts;$('priorities').value=(p.show_preferences.prioritized||[]).join('\n');$('exclusions').value=(p.show_preferences.excluded||[]).join('\n');$('email').textContent='Accounts: '+(p.account_email||p.email);$('calendar').textContent='Calendar: '+p.calendar.account+' · Partiful included · '+p.calendar.access_method;$('accounts').replaceChildren();for(const [name,account]of Object.entries(p.accounts||{})){const row=node('div','');row.className='account';row.append(node('strong',pretty(name)),node('span',pretty(account.status)));$('accounts').append(row);}$('history').replaceChildren();if(!data.runs.length)$('history').append(node('p','No runs recorded yet.'));for(const run of data.runs){const details=document.createElement('details');details.open=run===latest;details.append(node('summary',run.date+' · '+pretty(runStatus(run))));if(run.note)details.append(node('p',run.note));
for (const batch of run.runs || []) {
  const item = node('p', '');
  const time = batch.started_at || batch.triggered_at || batch.checked_at;
  const label = time ? new Date(time).toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'}) + ' · ' : '';
  item.append(node('strong', label + pretty(batch.status)));
  const count = batch.confirmed_new ?? batch.confirmed_entries;
  if (typeof count === 'number') item.append(node('span', ' · ' + count + ' new entries'));
  details.append(item);
}
const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table');const head=node('tr','');for(const h of ['Show / provider','Status','Details'])head.append(node('th',h));table.append(head);for(const e of [...(run.entries||[]),...(run.checks||[])]){const row=node('tr','');for(const value of [e.show||e.provider,pretty(e.status),e.confirmation_evidence||e.evidence||e.note||e.performance_datetime||'—'])row.append(node('td',typeof value==='object'?JSON.stringify(value):value));table.append(row);}if ((run.entries || []).length || (run.checks || []).length) { wrap.append(table); details.append(wrap); }$('history').append(details);}dirty=false;}
async function load() {
  $('refresh').disabled = true;
  $('message').textContent = '';
  try {
    render(await request('/api/state'));
    $('connection').textContent = 'On this Mac';
    $('dashboard').hidden = false;
  } catch (error) {
    $('message').textContent = 'Couldn’t load Broadway. Try refreshing. ' + error.message;
    $('connection').textContent = 'Unavailable';
  } finally {
    $('refresh').disabled = false;
  }
}
$('refresh').onclick=()=>{if(!dirty||confirm('Discard unsaved preference changes?'))load();};
$('preferences').oninput=()=>{dirty=true;$('save-status').textContent='Unsaved changes';};
$('preferences').onsubmit=async e=>{e.preventDefault();$('save').disabled=true;const lines=id=>$(id).value.split('\n').map(s=>s.trim()).filter(Boolean);try{await request('/api/preferences',{revision,ticket_count:Number($('tickets').value),max_price_per_ticket_usd:Number($('price').value),weekday_start:$('start').value,weekend_matinees:$('matinees').checked,weekend_evenings:$('evenings').checked,next_day_allowed:$('next-day').checked,skip_trips_away:$('trips').checked,skip_ordinary_conflicts:$('conflicts').checked,prioritized:lines('priorities'),excluded:lines('exclusions')});await load();$('save-status').textContent='Saved. Applies to the next run.';}catch(err){$('save-status').textContent=err.message;}finally{$('save').disabled=false;}};
$('copy-request').onclick=async()=>{try{await navigator.clipboard.writeText('Run a live Broadway lottery test using my saved preferences.');$('message').textContent='Copied. Paste into your Broadway Codex task.';}catch{$('message').textContent='Ask your Broadway Codex task: Run a live lottery test using my saved preferences.';}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
if (token) {
  document.title = 'Broadway · Dmitri';
  $('page-title').textContent = 'Broadway';
  $('page-description').textContent = 'Your lottery preferences and entry history.';
  document.querySelectorAll('[data-tool-card]').forEach(card => { card.hidden = true; });
  document.querySelector('header').hidden = false;
  document.querySelectorAll('.tool-nav a').forEach(link => {
    link.removeAttribute('aria-current');
    if (link.textContent === 'Broadway') {
      link.href = '/admin/';
      link.setAttribute('aria-current', 'page');
    }
  });
  $('refresh').hidden = false;
  load();
}
