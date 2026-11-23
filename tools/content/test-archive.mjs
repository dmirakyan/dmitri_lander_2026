import assert from 'node:assert/strict';
import {referenceArchive} from '../../content/references.js';
import {existsSync,readFileSync} from 'node:fs';

class Element {
  constructor(){this.children=[];this.selectors=new Map();this.events={};this.dataset={};}
  querySelector(s){if(!this.selectors.has(s)) this.selectors.set(s,new Element());return this.selectors.get(s);}
  append(...els){if(this.value===undefined && els[0]?.value!==undefined) this.value=els[0].value;this.children.push(...els);}
  replaceChildren(){this.children=[];}
  addEventListener(name,fn){this.events[name]=fn;}
  dispatchEvent(e){this.events[e.type]?.(e);}
  getAttribute(name){return this[name]??null;}
  removeAttribute(name){delete this[name];}
}
const lanes=['video','michaela','hinge'];
const panes=lanes.map(lane=>Object.assign(new Element(),{dataset:{referenceLane:lane}}));
const document=new Element();
const videos=[
  Object.assign(new Element(),{dataset:{videoCut:'wingman',pairedReference:'7640652226779811094'},hidden:false}),
  Object.assign(new Element(),{dataset:{videoCut:'flashcards',pairedReference:'7704270106838191391'},hidden:true})
];
for(const cut of videos){
  const video=cut.querySelector('video');
  video.pause=()=>{video.paused=true};
}
document.querySelectorAll=selector=>selector==='[data-video-cut]'?videos:panes;
for(const pane of panes) document.selectors.set('#'+pane.dataset.referenceLane+'-references',pane.querySelector('select'));
document.createElement=()=>new Element();
globalThis.document=document;
await import('../../content/gallery.js');

const ids=new Set();
for(const [i,lane] of lanes.entries()){
  const pane=panes[i], posts=referenceArchive[lane], picker=pane.querySelector('select'), details=pane.querySelector('details'), frame=pane.querySelector('iframe');
  assert.equal(picker.children.length,posts.length);
  assert.equal(frame.src,undefined);
  details.open=true;details.events.toggle();
  for(const [index,post] of posts.entries()){
    assert.match(post.id,/^\d{19}$/);
    assert.ok(!ids.has(post.id));ids.add(post.id);
    assert.match(post.url,/^https:\/\/www\.tiktok\.com\//);
    assert.ok(post.role&&post.mechanic&&post.source[0]);
    picker.value=String(index);picker.events.change();
    assert.equal(frame.src,`https://www.tiktok.com/player/v1/${post.id}?autoplay=0&description=0`);
    assert.equal(pane.querySelector('.source-link').href,post.url);
    assert.equal(pane.querySelector('.reference-metrics').children.length,Object.keys(post.metrics).length);
    assert.equal(pane.querySelector('.evidence-link').hidden,!post.source[1]);
    const secondary=pane.querySelector('.secondary-evidence');
    assert.equal(secondary.hidden,!post.secondSnapshot);
    assert.equal(secondary.children.length,post.secondSnapshot?2:0);
    if (post.secondSnapshot) {
      assert.equal(secondary.children[0].href,post.secondSnapshot.url);
      assert.ok(secondary.children[1].textContent.includes(post.secondSnapshot.metrics.Views));
    }
  }
  details.open=false;details.events.toggle();
  assert.equal(frame.src,undefined);
  if(lane==='video'){
    const cuts=document.querySelector('#video-choices');
    const defaultId='7640652226779811094';
    assert.equal(cuts.value,'wingman');
    assert.deepEqual(videos.map(v=>v.hidden),[false,true]);
    cuts.value='flashcards';cuts.events.change();
    assert.deepEqual(videos.map(v=>v.hidden),[true,false]);
    assert.ok(videos[0].querySelector('video').paused);
    assert.match(pane.querySelector('.source-link').href,/7704270106838191391$/);
    const other=posts.findIndex(p=>p.id!=='7704270106838191391');
    picker.value=String(other);picker.events.change();
    assert.deepEqual(videos.map(v=>v.hidden),[true,false]);
    cuts.value='wingman';cuts.events.change();
    assert.deepEqual(videos.map(v=>v.hidden),[false,true]);
    assert.ok(videos[1].querySelector('video').paused);
    assert.ok(pane.querySelector('.source-link').href.endsWith(defaultId));
    continue;
  }
  const picks=document.querySelector('#'+lane+'-choices');
  const cards=document.querySelector('#'+lane+'-stories').children;
  const expected=lane==='hinge'?6:5;
  assert.equal(cards.length,expected);
  assert.deepEqual(cards.map(x=>x.hidden),[false,...Array(expected-1).fill(true)]);
  if(lane==='hinge'){
    const three=picks.children.findIndex(o=>o.textContent.includes('Crowded Room'));
    const poetry=posts.findIndex(p=>p.id==='7705229880211836173');
    assert.ok(three>=0 && poetry>=0);
    assert.equal(cards[three].querySelector('.previews').children.length,3);
    assert.equal(cards[three].querySelector('.previews').children[2].href,'hinge/renders/crowded-room-3.png');
    picks.value=String(three);picks.events.change();
    assert.equal(picker.value,String(poetry));
    assert.match(pane.querySelector('.source-link').href,/7705229880211836173$/);
    assert.equal(picks.children.at(-1).textContent.includes('Alternate'),true);
    assert.deepEqual(cards.filter(c=>!c.hidden),[cards[three]]);
    picker.value='0';picker.events.change();
    assert.deepEqual(cards.filter(c=>!c.hidden),[cards[three]]);
    picks.value='1';picks.events.change();
    assert.equal(picker.value,'0');
    assert.deepEqual(cards.filter(c=>!c.hidden),[cards[1]]);
  }else{
    picks.value='4';picks.events.change();
    assert.deepEqual(cards.filter(c=>!c.hidden),[cards[4]]);
    assert.equal(picker.value,String(posts.length-1));
  }
}
assert.ok(ids.size>=20);
assert.ok(existsSync('_site/content/references.js'));
assert.match(readFileSync('content/index.html','utf8'),/Flashcards in the Soup · Alternate/);
console.log(`Archive: ${ids.size} unique posts, exact source/evidence and counts, lazy player teardown, 11 still outputs, two video cuts, independent archive selection, and automatic Crowded Room poetry pairing verified`);
