/* Public read-only tracker. There are no order submission or approval controls. */
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n));
const day = s => new Date(`${s.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = n => `${n>0?'+':''}${(n*100).toFixed(2)}%`;
let latest;
let busy=false;
function renderWeekly(rows){
  if(!Array.isArray(rows))throw new Error('Invalid weekly results.');
  if(!rows.length){
    $('weekly-status').textContent='No weekly results yet. Tracking begins after the first confirmed purchase.';
    $('weekly-results').innerHTML='';return;
  }
  const latestDate=new Date(`${rows[0].session_date}T12:00:00Z`);
  const overdue=Date.now()-latestDate.getTime()>8*86400000;
  $('weekly-status').textContent=`${overdue?'Update overdue · ':''}Latest close: ${day(rows[0].session_date)}`;
  const signed=n=>`${n>0?'+':''}${money(n)}`;
  $('weekly-results').innerHTML=`<table><caption class="sr-only">Weekly strategy closing values and price profit or loss</caption><thead><tr><th scope="col">Close</th><th scope="col">Stock value</th><th scope="col">Price P&amp;L</th><th scope="col">Since previous</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(day(r.session_date))}</td><td>${money(r.market_value)}</td><td>${signed(r.price_pnl)}</td><td>${r.period_price_pnl==null?'—':`${signed(r.period_price_pnl)} <small>since ${esc(day(r.previous_session))}</small>`}</td></tr>`).join('')}</tbody></table>`;
}
async function loadWeekly(c){
  try{
    const r=await fetch(`${c.url}/rest/v1/rpc/mag7_public_weekly`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!r.ok)throw new Error('Weekly results are temporarily unavailable.');
    renderWeekly(await r.json());
  }catch(e){$('weekly-status').textContent=`${e.message} Any displayed results have not been refreshed.`;}
}
function render(data){
  if(!data.strategy || !Array.isArray(data.runs)) throw new Error('No strategy is available yet.');
  const s=data.strategy;latest=data.runs[0];
  $('initial').textContent=money(s.initial_allocation);$('monthly').textContent=money(s.monthly_allocation);
  $('invested').textContent=money(data.execution.net_purchase_cost);
  $('fill-note').textContent=`${data.execution.confirmed_fill_count} confirmed fills`;
  $('next').textContent=s.next_review_date?new Date(`${s.next_review_date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'To schedule';
  $('mode-rule').textContent=s.mode==='rotate'?'Rotate strategy holdings when the pick changes; otherwise hold and add the monthly contribution.':'Add each month’s contribution to the selected stock. Keep prior purchases.';
  if(!latest){$('load-state').textContent='Awaiting the first monthly signal';return;}
  if(latest.rankings.length!==7)throw new Error('Incomplete signal: all seven companies are required.');
  const selected=latest.rankings.find(r=>r.ticker===latest.selected_ticker);
  if(!selected)throw new Error('Invalid selection');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
  const expected=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,7);
  const stale=latest.signal_month.slice(0,7)!==expected;
  $('load-state').className=stale?'load-state error':'load-state';
  $('load-state').textContent=`${stale?'Overdue review · ':''}Returns through ${day(latest.signal_date)}`;
  $('pick-status').textContent=latest.proposal.status.replaceAll('_',' ');
  $('pick-content').innerHTML=`<strong class="pick-symbol">${esc(selected.ticker)}</strong><p class="pick-name">${esc(selected.name)}</p>`;
  $('avg').textContent=`${selected.average_rank.toFixed(2)} / 7`;
  $('purchase').textContent=money(latest.proposal.contribution);
  $('signal-date').textContent=`Signal: ${day(latest.signal_date)} close${latest.methodology.initial_off_schedule?' · initial setup after the scheduled review day':''}`;
  $('rankings').innerHTML=latest.rankings.map(r=>`<tr class="${r.ticker===selected.ticker?'selected-row':''}"><td><div class="company"><b>${esc(r.ticker)}</b><small>${esc(r.name)}</small></div></td>${['3','6','12'].map(m=>`<td><span class="${r.returns[m]>=0?'positive':'negative'}">${pct(r.returns[m])}</span><span class="rank" aria-label="Rank ${r.ranks[m]}">#${r.ranks[m]}</span></td>`).join('')}<td class="avg">${r.average_rank.toFixed(2)}</td><td>${r.ticker===selected.ticker?'<span class="selected-pill">Selected</span>':'<span class="muted">—</span>'}</td></tr>`).join('');
  $('asof').textContent='Adjusted returns. Rank 1 = best, 7 = worst; highest average rank is selected.';
  $('provenance').textContent=`Latest retrieval: ${new Date(latest.methodology.retrieved_at).toLocaleString('en-US',{timeZone:'America/New_York'})} New York. Signal version ${latest.methodology.version}.`;
  $('history').innerHTML=data.runs.map(r=>`<div class="journal-row"><span class="journal-date">${esc(day(r.signal_date))}</span><div class="journal-main"><b>${esc(r.selected_ticker)} · ${r.proposal.kind==='initial'?'Initial allocation':'Monthly allocation'}</b><small>${esc(r.proposal.note)}</small></div><div class="journal-value">${money(r.proposal.contribution)}<small>${esc(r.proposal.status.replaceAll('_',' '))}</small></div></div>`).join('');
  $('download').disabled=false;
}
async function load(){
  if(busy)return;busy=true;$('refresh').disabled=true;
  try{
    const c=window.MAG7_CONFIG;if(!c?.url||!c?.key)throw new Error('Database connection is not configured.');
    const r=await fetch(`${c.url}/rest/v1/rpc/mag7_public_tracker`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!r.ok)throw new Error('The strategy database is temporarily unavailable.');
    render(await r.json());
    await loadWeekly(c);
  }catch(e){$('load-state').className='load-state error';$('load-state').textContent=`${e.message} ${latest?'Previously loaded figures remain visible; they have not been refreshed.':'No signal or performance is being inferred.'}`;}
  finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',load);
$('download').addEventListener('click',()=>{
  if(!latest)return;
  const rows=[['signal_date','ticker','return_3m','rank_3m','return_6m','rank_6m','return_12m','rank_12m','average_rank','selected'],...latest.rankings.map(r=>[latest.signal_date,r.ticker,...['3','6','12'].flatMap(m=>[r.returns[m],r.ranks[m]]),r.average_rank,r.ticker===latest.selected_ticker])];
  const url=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`mag7-signal-${latest.signal_date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
load();
