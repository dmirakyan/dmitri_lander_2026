import {mergeVotes, voteKey, remainingActions} from './state.js';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {yes:'Yes',maybe:'Maybe',pass:'Pass',none:'Not chosen'};
const statuses = {offered:'Tickets offered',open:'Hours / entry checked',weather:'Weather dependent',check:'Check booking'};
const fragment = new URLSearchParams(location.hash.slice(1));
const validToken = t => /^[a-f0-9]{64}$/.test(t || '');
let storageOK = true;
function read(k) { try {return localStorage.getItem(k);} catch {storageOK=false;return null;} }
function write(k,v) { try {localStorage.setItem(k,v);return true;} catch {storageOK=false;return false;} }
let token = fragment.get('board');
if (!validToken(token)) token = read('date-night-board-v1');
if (!validToken(token)) token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join('');
write('date-night-board-v1',token);
const storageKey = `date-night-v1:${token}`;
let state;
try {state=JSON.parse(read(storageKey)) || {};} catch {state={};}
state = {person:'dmitri',votes:{},outbox:[],history:[],...state};
if (!['dmitri','tulin'].includes(state.person)) state.person='dmitri';
if (['dmitri','tulin'].includes(fragment.get('person'))) state.person=fragment.get('person');
if (fragment.has('board')) history.replaceState(null,'',location.pathname+location.search);
let ideas=[],day='all',category='all',evening=false,view='deck',busy=false,animating=false,onlineSaved=false;
const personName = p => p==='tulin'?'Tulin':'Dmitri';
function save() {write(storageKey,JSON.stringify(state));}
function syncStatus(text,problem=false) {$('#sync').textContent=text;$('#sync').classList.toggle('problem',problem);}
function notice(text) {$('#notice').textContent=text;}
function vote(id,person=state.person) {return state.votes[`${person}:${id}`]?.choice || 'none';}
function bothYes(id) {return vote(id,'dmitri')==='yes' && vote(id,'tulin')==='yes';}
function filtered() {return ideas.filter(i=>(day==='all'||i.days.includes(day))&&(category==='all'||i.category===category)&&(!evening||(!i.daytime&&(!i.eveningDays||day==='all'||i.eveningDays.includes(day)))));}
function unchosen() {return filtered().filter(i=>vote(i.id)==='none');}
function controls(i,small=false) {return `<div class="decision-bar" role="group" aria-label="Choose for ${esc(i.title)}">${['pass','maybe','yes'].map(c=>`<button class="decision ${c}" data-choice="${c}" data-id="${i.id}" aria-label="${labels[c]}: ${esc(i.title)}" ${small?`aria-pressed="${vote(i.id)===c}"`:''}><span class="icon" aria-hidden="true">${{pass:'×',maybe:'~',yes:'♥'}[c]}</span><small>${labels[c]}</small></button>`).join('')}</div>`;}
function card(i,small=false) {
 const votes = ['dmitri','tulin'].filter(p=>vote(i.id,p)!=='none').map(p=>`<span class="vote-label">${personName(p)} · ${labels[vote(i.id,p)]}</span>`).join('');
 return `<article class="card" data-card="${i.id}" aria-label="${esc(i.title)}"><div class="picture ${small?'':'draggable'}"><img src="${esc(i.image.url)}" alt="${esc(i.image.alt)}" loading="${small?'lazy':'eager'}" referrerpolicy="no-referrer" draggable="false"><div class="image-fallback">${esc(i.venue)}</div><span class="category-tag">${esc(i.category)} · ${esc(i.season)}</span><a class="photo-credit" href="${esc(i.image.source)}" target="_blank" rel="noopener noreferrer">Photo: ${esc(i.image.credit)} ↗</a><span class="stamp yes" aria-hidden="true">YES</span><span class="stamp pass" aria-hidden="true">PASS</span></div><div class="card-body"><p class="venue">${esc(i.venue)} · ${esc(i.area)}</p><h2>${esc(i.title)}</h2><p class="timing">${esc(i.when)} ${i.daytime?'<span class="daytime">Daytime</span>':''}</p><p class="price">${esc(i.price)}</p><p class="description">${esc(i.description)}</p><div class="availability"><span class="status ${i.status}">${statuses[i.status]}</span><span>${i.status==='offered'?'Checked Sep 28 · no hold':i.status==='check'?'Inventory unconfirmed':i.status==='weather'?'Check before leaving':'Checked Sep 28'}</span></div><details class="card-details"><summary>Why us, booking details & sources <span>+</span></summary><p><b>Why us.</b> ${esc(i.why)}</p><p><b>Before you go.</b> ${esc(i.availability)}</p><div class="source-links"><a href="${esc(i.source)}" target="_blank" rel="noopener noreferrer">${i.status==='check'||i.status==='offered'?'Check venue / booking':'Venue & details'} ↗</a>${i.links.map(([label,url])=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`).join('')}</div></details>${votes?`<div class="votes">${bothYes(i.id)?'<span class="vote-label match">♥ Both of you</span>':''}${votes}</div>`:''}${small?controls(i,true):''}</div></article>`;
}
function render() {
 if (!ideas.length) return;
 document.querySelectorAll('[data-person]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.person===state.person));
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
 document.querySelectorAll('[data-day]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.day===day));
 $('#saved-count').textContent=ideas.filter(i=>['yes','maybe'].includes(vote(i.id))).length;
 const list=filtered(),left=unchosen();
 if (view==='deck') {
 const count=list.length-left.length;
 const active=left[0];
 $('#content').innerHTML=`<div class="deck-layout"><aside class="side-note"><div class="flower" aria-hidden="true">✳</div><p class="eyebrow">YOUR KIND OF EVENING</p><h2>A little curious.<br>A little playful.</h2><p>Swipe right for yes, left for pass. Keep the interesting maybes. The best plan is one you both want.</p></aside><div class="deck">${active?card(active)+controls(active):`<div class="empty"><span class="flower">✳</span><h2>${list.length?'A lovely set of possibilities.':'Nothing in this corner.'}</h2><p>${list.length?'You’ve seen every idea in this filter. Open your shortlist, or revisit any choice in All 28.':'Try another day or kind of date.'}</p><button class="primary" data-go="${list.length?'saved':'all'}">${list.length?'See the shortlist':'See all ideas'}</button></div>`}<div class="deck-bottom"><button class="undo" id="undo" ${state.history.some(h=>h.actor===state.person)?'':'disabled'}>↶ Undo last choice</button><p class="hint">${count} of ${list.length} reviewed · ← pass · ↑ maybe · → yes</p></div></div><aside class="side-note right"><p class="eyebrow">${personName(state.person).toUpperCase()}’S PICKS</p><h2>${count}<span style="color:var(--muted)"> / ${list.length}</span></h2><div class="progress"><span style="width:${list.length?count/list.length*100:0}%"></span></div><p>${ideas.filter(i=>bothYes(i.id)).length} mutual yeses so far.<br>Share this board so you can choose together.</p><p>September 29–October 1<br>All times New York.</p></aside></div>`;
 } else {
 const cards=view==='saved'?list.filter(i=>['yes','maybe'].includes(vote(i.id))).sort((a,b)=>Number(bothYes(b.id))-Number(bothYes(a.id))):list;
 $('#content').innerHTML=`<div class="view-heading"><h2>${view==='saved'?`${personName(state.person)}’s shortlist`:'Every little possibility'}</h2><p>${cards.length} ${cards.length===1?'idea':'ideas'} · ${ideas.filter(i=>bothYes(i.id)).length} mutual yeses${view==='saved'?' · your yeses + maybes':''}</p></div>${cards.length?`<div class="grid">${cards.map(i=>card(i,true)).join('')}</div>`:`<div class="empty"><h2>Leave room for a yes.</h2><p>${view==='saved'?'Your yeses and maybes will appear here. Mutual yeses float to the top.':'Try changing the filters.'}</p><button class="primary" data-go="deck">Back to swiping</button></div>`}`;
 }
 document.querySelectorAll('.picture img').forEach(img=>{img.addEventListener('error',()=>img.parentElement.classList.add('failed'));if(img.complete&&!img.naturalWidth)img.parentElement.classList.add('failed');});
 if(view==='deck') setupDrag();
}
function choose(id,choice,record=true) {
 if (!ideas.some(i=>i.id===id)) return;
 const prior=vote(id);
 if(prior===choice)return;
 if(record)state.history.push({actor:state.person,id,prior});
 const latest=Date.parse(state.votes[`${state.person}:${id}`]?.client_at||0)||0;
 const action={event_id:crypto.randomUUID(),actor:state.person,idea_id:id,choice,client_at:new Date(Math.max(Date.now(),latest+1)).toISOString()};
 state.outbox.push(action);state.votes[voteKey(action)]=action;save();render();
 notice(bothYes(id)?`♥ You both said yes to ${ideas.find(i=>i.id===id).title}.`:choice==='none'?'Last choice undone.':`${labels[choice]} · saved for ${personName(state.person)}.`);
 syncStatus(storageOK?'Saved on this device · syncing…':'Saving to cloud…',!storageOK);sync();
}
function animateChoice(id,choice) {
 if(animating)return;
 const el=document.querySelector(`.deck .card[data-card="${id}"]`);
 if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches){choose(id,choice);return;}
 animating=true;el.classList.add('swiping');el.style.transform=`translate(${choice==='yes'?420:choice==='pass'?-420:0}px,${choice==='maybe'?-80:0}px) rotate(${choice==='yes'?15:choice==='pass'?-15:0}deg)`;el.style.opacity='0';
 setTimeout(()=>{animating=false;choose(id,choice);},220);
}
function undo() {
 const n=state.history.findLastIndex(h=>h.actor===state.person);if(n<0)return;
 const h=state.history.splice(n,1)[0];choose(h.id,h.prior,false);save();render();
}
function setupDrag() {
 const pic=$('.deck .picture');if(!pic)return;
 const el=pic.closest('.card');let start=null,delta=0;
 pic.addEventListener('pointerdown',e=>{if(e.target.closest('a')||e.button!==0||animating)return;start={x:e.clientX,y:e.clientY,id:e.pointerId};delta=0;pic.setPointerCapture(e.pointerId);pic.classList.add('dragging');});
 pic.addEventListener('pointermove',e=>{if(!start)return;delta=e.clientX-start.x;if(Math.abs(e.clientY-start.y)>Math.abs(delta)+20){reset();return;}el.style.transform=`translateX(${delta}px) rotate(${delta/22}deg)`;el.querySelector('.stamp.yes').style.opacity=Math.max(0,delta/130);el.querySelector('.stamp.pass').style.opacity=Math.max(0,-delta/130);});
 function reset(){if(start&&pic.hasPointerCapture(start.id))pic.releasePointerCapture(start.id);start=null;delta=0;el.style.transform='';pic.classList.remove('dragging');el.querySelectorAll('.stamp').forEach(s=>s.style.opacity=0);}
 pic.addEventListener('pointerup',()=>{const d=delta,id=el.dataset.card;reset();if(Math.abs(d)>90)animateChoice(id,d>0?'yes':'pass');});
 pic.addEventListener('pointercancel',reset);
}
async function sync() {
 if(busy)return;
 if(!navigator.onLine){syncStatus(storageOK?'Offline · saved on this device':'Offline · not saved',true);return;}
 busy=true;
 const sent=state.outbox.slice(0,64);
 try {
 const cfg=window.DATE_CONFIG;
 const res=await fetch(`${cfg.url}/rest/v1/rpc/date_night_sync`,{method:'POST',headers:{'Content-Type':'application/json',apikey:cfg.key,Authorization:`Bearer ${cfg.key}`},body:JSON.stringify({p_token:token,p_actions:sent}),signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw new Error(`Sync ${res.status}`);
 const data=await res.json();if(!Array.isArray(data.votes))throw new Error('Invalid sync response');
 const before=JSON.stringify(Object.fromEntries(Object.entries(state.votes).map(([k,v])=>[k,v.choice])));
 state.outbox=remainingActions(state.outbox,sent);state.votes=mergeVotes(data.votes,state.outbox);save();onlineSaved=true;
 syncStatus(state.outbox.length?'More choices syncing…':storageOK?'✓ Synced':'✓ Synced · save your share link');
 const after=JSON.stringify(Object.fromEntries(Object.entries(state.votes).map(([k,v])=>[k,v.choice])));
 if(before!==after&&!animating&&!$('.dragging'))render();
 }catch{syncStatus(storageOK?(state.outbox.length?'Saved here · cloud retry pending':'Cloud unavailable · local board'):'Not saved · cloud unavailable',true);}
 finally{busy=false;}
 if(onlineSaved&&state.outbox.length){onlineSaved=false;setTimeout(sync,1000);}
}
document.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button)return;
 if(button.dataset.person){state.person=button.dataset.person;save();render();notice(`Choosing as ${personName(state.person)}.`);}
 if(button.dataset.view){view=button.dataset.view;render();notice('');}
 if(button.dataset.day){day=button.dataset.day;render();}
 if(button.dataset.choice){if(view==='deck')animateChoice(button.dataset.id,button.dataset.choice);else choose(button.dataset.id,button.dataset.choice);}
 if(button.dataset.go){view=button.dataset.go;if(view==='all'){day='all';category='all';evening=false;$('#category').value='all';$('#evening').checked=false;}render();}
 if(button.id==='undo')undo();
});
$('#category').addEventListener('change',e=>{category=e.target.value;render();});
$('#evening').addEventListener('change',e=>{evening=e.target.checked;render();});
document.addEventListener('keydown',e=>{if(view!=='deck'||$('#share-dialog').open||e.target.closest('input,select,textarea,a,button,summary')||e.altKey||e.ctrlKey||e.metaKey)return;const c={ArrowLeft:'pass',ArrowRight:'yes',ArrowUp:'maybe'}[e.key];const i=unchosen()[0];if(c&&i){e.preventDefault();animateChoice(i.id,c);}});
$('#share').addEventListener('click',()=>{const other=state.person==='dmitri'?'tulin':'dmitri';$('#invite-name').textContent=personName(other);$('#invite-url').value=`${location.origin}${location.pathname}#board=${token}&person=${other}`;$('#copy-status').textContent='';$('#share-dialog').showModal();});
$('#copy-link').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#invite-url').value);$('#copy-status').textContent='Link copied. Ready to send.';}catch{$('#invite-url').focus();$('#invite-url').select();$('#copy-status').textContent='Select and copy the link above.';}});
window.addEventListener('online',sync);window.addEventListener('offline',()=>syncStatus(storageOK?'Offline · saved on this device':'Offline · not saved',true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
window.addEventListener('storage',e=>{if(e.key!==storageKey||!e.newValue)return;try{const other=JSON.parse(e.newValue);state.outbox=[...new Map([...state.outbox,...other.outbox].map(a=>[a.event_id,a])).values()];state.votes=mergeVotes([...Object.values(state.votes),...Object.values(other.votes)],state.outbox);render();sync();}catch{}});
setInterval(()=>{if(!document.hidden)sync();},20000);
try {const res=await fetch('ideas.json');if(!res.ok)throw new Error('Could not load ideas');const data=await res.json();ideas=data.ideas;render();save();sync();}catch{$('#content').innerHTML='<div class="empty"><h2>A small detour.</h2><p>The ideas could not load. Please refresh to try again.</p></div>';syncStatus('Ideas unavailable',true);}
