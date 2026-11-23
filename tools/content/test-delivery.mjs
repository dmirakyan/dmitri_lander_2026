import assert from 'node:assert/strict';
import worker from '../../worker/index.js';
import manifest from '../../worker/content-media.json' with {type:'json'};
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const path='/content/video/flashcards-full-bleed.mp4';
const media=manifest[path];
const local=new URL('../../'+path.slice(1),import.meta.url);
const actual=existsSync(local) ? readFileSync(local) : null;
const bytes=actual ?? Uint8Array.from({length:media.bytes},(_,i)=>i%251);
if (actual) assert.equal(createHash('sha256').update(actual).digest('hex'),media.sha256);
const accessed=[];
const delegated=[];
const env={
  CONTENT_MEDIA:{async get(key,type){
    accessed.push([key,type]);
    const expected=Object.values(manifest).find(a=>a.key===key);
    if (!expected) return null;
    if (key!==media.key) return new Response(new Uint8Array(expected.bytes)).body;
    let cursor=0;
    return new ReadableStream({pull(c){
      const next=Math.min(cursor+8192,bytes.length);
      if (next===cursor) return c.close();
      c.enqueue(bytes.subarray(cursor,next));
      cursor=next;
    }});
  }},
  ASSETS:{async fetch(req){
    const p=new URL(req.url).pathname;
    delegated.push(p);
    const options={status:p==='/'||p==='/admin/'||p==='/content/'?200:p==='/content/index.html'||p==='/content'?308:404};
    if(options.status===308) options.headers={Location:'/content/'};
    return new Response(options.status===200 && req.method!=='HEAD'?'html':null,options);
  }}
};
const request=(p,opts={},host='dmitri.im')=>worker.fetch(new Request('https://'+host+p,opts),env);
const noindex=r=>assert.match(r.headers.get('X-Robots-Tag'),/\bnoindex\b/);
for(const host of ['dmitri.im','www.dmitri.im','dmitri-lander.dmitri-d68.workers.dev']){
  for(const [p,status] of [['/content',308],['/content/',200],['/content/index.html',308],['/content/missing',404]]){
    const r=await request(p,{},host);
    assert.equal(r.status,status);
    noindex(r);
  }
  const head=await request(path,{method:'HEAD',headers:{Range:'bytes=0-3'}},host);
  assert.equal(head.status,200);
  assert.equal(head.headers.get('Content-Type'),'video/mp4');
  assert.equal(head.headers.get('Content-Length'),String(bytes.length));
  assert.equal(head.body,null);
  noindex(head);
}
const full=await request(path);
assert.equal(full.status,200);noindex(full);
assert.deepEqual(Buffer.from(await full.arrayBuffer()),Buffer.from(bytes));
for(const [value,start,end] of [['bytes=0-1023',0,1023],['bytes=8000-9000',8000,9000],['bytes=-100',bytes.length-100,bytes.length-1],['bytes=9798384-',9798384,bytes.length-1]]){
  const r=await request(path,{headers:{Range:value}});
  assert.equal(r.status,206);noindex(r);
  assert.equal(r.headers.get('Content-Range'),`bytes ${start}-${end}/${bytes.length}`);
  assert.equal(r.headers.get('Content-Length'),String(end-start+1));
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),Buffer.from(bytes.subarray(start,end+1)));
}
const lookups=accessed.length;
for(const value of ['bytes=9798484-','bytes=300-200','bytes=-0','bytes=0-1,5-6','items=0-1']){
  const r=await request(path,{headers:{Range:value}});
  assert.equal(r.status,416);noindex(r);
  assert.equal(r.headers.get('Content-Range'),`bytes */${bytes.length}`);
}
assert.equal(accessed.length,lookups);
const changed=await request(path,{headers:{Range:'bytes=0-10','If-Range':'"old"'}});
assert.equal(changed.status,200);await changed.body.cancel();
const notModified=await request(path,{headers:{'If-None-Match':`W/"${media.sha256}"`}});
assert.equal(notModified.status,304);noindex(notModified);
const disallowed=await request(path,{method:'POST'});
assert.equal(disallowed.status,405);noindex(disallowed);
let failure=await worker.fetch(new Request('https://dmitri.im'+path),{...env,CONTENT_MEDIA:null});
assert.equal(failure.status,503);noindex(failure);
failure=await worker.fetch(new Request('https://dmitri.im'+path),{...env,CONTENT_MEDIA:{get:async()=>null}});
assert.equal(failure.status,503);noindex(failure);
assert.equal(Object.keys(manifest).length,29);
for(const p of Object.keys(manifest).filter(p=>p!==path)){
  const r=await request(p,{method:'HEAD'});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('Content-Type'),manifest[p].type);
  noindex(r);
}
for (const path of ['/content/video/wingman-yourmove-header.mp4','/content/video/rush-fee-yourmove-header.mp4']) {
 const media=manifest[path];
 const ranged=await request(path,{headers:{Range:'bytes=8-13'}});
 assert.equal(ranged.status,206);noindex(ranged);
 assert.equal(ranged.headers.get('Content-Range'),`bytes 8-13/${media.bytes}`);
 assert.equal((await ranged.arrayBuffer()).byteLength,6);
 const bad=await request(path,{headers:{Range:'bytes='+media.bytes+'-'}});
 assert.equal(bad.status,416);noindex(bad);
}
assert.ok(accessed.every(([key,type])=>key.startsWith('gallery/v1/')&&type==='stream'));
const fallbackEnv={...env,CONTENT_MEDIA:null,ASSETS:{async fetch(req){
  assert.equal(new URL(req.url).pathname,path);
  assert.equal(req.headers.get('Range'),null);
  return new Response(req.method==='HEAD'?null:bytes,{
    headers:{'Content-Type':media.type}
  });
}}};
const staticRequest=(init)=>worker.fetch(new Request('https://dmitri.im'+path,init),fallbackEnv);
const staticHead=await staticRequest({method:'HEAD'});
assert.equal(staticHead.status,200);noindex(staticHead);
const staticPartial=await staticRequest({headers:{Range:'bytes=10-29'}});
assert.equal(staticPartial.status,206);noindex(staticPartial);
assert.deepEqual(Buffer.from(await staticPartial.arrayBuffer()),Buffer.from(bytes.subarray(10,30)));
assert.equal((await staticRequest({headers:{Range:'bytes=99999999-'}})).status,416);
for(const p of ['/','/admin/','/contentful','/blog/']){
 const r=await request(p);
 assert.equal(r.headers.get('X-Robots-Tag'),null);
 assert.equal(delegated.at(-1),p);
}
console.log('Gallery delivery: 29 allowlisted media; live-path/alias noindex; GET, HEAD, 206, 304, 405, 416, 503 and unchanged non-gallery routing verified.');
