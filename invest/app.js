/* Public read-only tracker. There are no order submission or approval controls. */
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n));
const day = s => new Date(`${s.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = n => `${n>0?'+':''}${(n*100).toFixed(2)}%`;
let latest;
let busy=false;
function render(data){
  if(!data.strategy || !Array.isArray(data.runs)) throw new Error('No strategy is available yet.');
  const s=data.strategy;latest=data.runs[0];
  $('initial').textContent=money(s.initial_allocation);$('monthly').textContent=money(s.monthly_allocation);
  $('budget-rule').textContent=`Start with a ${money(s.initial_allocation)} reallocation; add ${money(s.monthly_allocation)} in fresh funds each month.`;
  $('invested').textContent=money(data.execution.net_purchase_cost);
  $('fill-note').textContent=`${data.execution.confirmed_fill_count} confirmed fills · net purchase cost`;
  $('next').textContent=s.next_review_date?new Date(`${s.next_review_date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'To schedule';
  $('mode-rule').textContent=s.mode==='rotate'?'When the selection changes, propose rotating only strategy-owned shares, plus the new monthly allocation. Keep existing strategy shares when the pick is unchanged.':'Add each month’s allocation to the new selection. Keep prior strategy purchases; do not automatically rotate or sell them.';
  if(!latest){$('load-state').textContent='Connected to Supabase · awaiting the first verified signal';return;}
  if(latest.rankings.length!==7)throw new Error('Incomplete signal: all seven companies are required.');
  const selected=latest.rankings.find(r=>r.ticker===latest.selected_ticker);
  if(!selected)throw new Error('Invalid selection');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
  const expected=new Date(Date.UTC(year,month-1,0)).toISOString().slice(0,7);
  const stale=latest.signal_month.slice(0,7)!==expected;
  $('load-state').className=stale?'load-state error':'load-state';
  $('load-state').textContent=`${stale?'Historical signal—new monthly review needed':'Connected to Supabase'} · signal close ${day(latest.signal_date)} · ${data.execution.confirmed_fill_count?'Execution records available':'No trades recorded'}`;
  $('pick-status').textContent=latest.proposal.status.replaceAll('_',' ');
  $('pick-content').innerHTML=`<h2 class="pick-symbol">${esc(selected.ticker)}</h2><p class="pick-name">${esc(selected.name)}</p>`;
  $('avg').textContent=`${selected.average_rank.toFixed(2)} / 7`;
  $('purchase').textContent=money(latest.proposal.contribution);
  $('pick-explanation').textContent=`${selected.name} has the worst average rank across the three lookbacks. This is a review candidate, not an executed purchase.`;
  $('signal-date').textContent=`Signal: ${day(latest.signal_date)} close${latest.methodology.initial_off_schedule?' · initial setup after the scheduled review day':''}`;
  $('rankings').innerHTML=latest.rankings.map(r=>`<tr class="${r.ticker===selected.ticker?'selected-row':''}"><td><div class="company"><span class="monogram" aria-hidden="true">${esc(r.name[0])}</span><span><b>${esc(r.ticker)}</b><small>${esc(r.name)}</small></span></div></td>${['3','6','12'].map(m=>`<td><span class="${r.returns[m]>=0?'positive':'negative'}">${pct(r.returns[m])}</span><span class="rank" aria-label="Rank ${r.ranks[m]}">#${r.ranks[m]}</span></td>`).join('')}<td class="avg">${r.average_rank.toFixed(2)}</td><td>${r.ticker===selected.ticker?'<span class="selected-pill">MONTHLY PICK</span>':'<span class="muted">—</span>'}</td></tr>`).join('');
  $('asof').textContent=`Adjusted returns through ${day(latest.signal_date)} · rank 1 best / 7 worst`;
  $('provenance').textContent=`Latest retrieval: ${new Date(latest.methodology.retrieved_at).toLocaleString('en-US',{timeZone:'America/New_York'})} New York. Signal version ${latest.methodology.version}.`;
  $('history').innerHTML=data.runs.map(r=>`<div class="journal-row"><span class="journal-date">${esc(day(r.signal_date))}</span><div class="journal-main"><b>${esc(r.selected_ticker)} · ${r.proposal.kind==='initial'?'Initial allocation':'Monthly allocation'}</b><small>Signal saved · ${esc(r.proposal.note)}</small></div><div class="journal-value">${money(r.proposal.contribution)}<small>${esc(r.proposal.status.replaceAll('_',' '))}</small></div></div>`).join('');
  if(data.execution.confirmed_fill_count){$('performance-label').textContent='Confirmed fills recorded';$('performance-note').textContent='Performance comparisons require current valuation and cash-flow-matched benchmark purchases; not yet calculated.';}
  $('download').disabled=false;
}
async function load(){
  if(busy)return;busy=true;$('refresh').disabled=true;
  try{
    const c=window.MAG7_CONFIG;if(!c?.url||!c?.key)throw new Error('Database connection is not configured.');
    const r=await fetch(`${c.url}/rest/v1/rpc/mag7_public_tracker`,{method:'POST',headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000),cache:'no-store'});
    if(!r.ok)throw new Error('The strategy database is temporarily unavailable.');
    render(await r.json());
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
