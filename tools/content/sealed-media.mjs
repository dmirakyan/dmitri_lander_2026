import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,resolve,sep} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import manifest from '../../worker/content-media.json' with {type:'json'};

const [mode,path,bundle='tools/content/gallery-media.enc']=process.argv.slice(2);
const raw=(process.env.GALLERY_MEDIA_KEY??'').trim();
if (!['seal','unseal'].includes(mode) || !path || !/^[a-f0-9]{64}$/i.test(raw)) {
  throw new Error('Expected seal or unseal, directory, and gallery-specific 256-bit key.');
}
const key=Buffer.from(raw,'hex');
const marker=Buffer.from('YMG1');
const strictPath=/^\/content\/(?:hinge\/renders\/[a-z0-9-]+-[123]\.png|michaela\/[a-e]_0[12]_(?:selfie|reveal)\.png|video\/[a-z0-9-]+\.(?:mp4|jpg))$/;
const entries=Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b));
for (const [file,meta] of entries) {
  if (!strictPath.test(file)||!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>25*1024*1024||! /^[a-f0-9]{64}$/.test(meta.sha256)) throw new Error('Invalid media allowlist');
}
const aad=Buffer.concat([marker,Buffer.from(JSON.stringify(entries))]);
const verified=(data,meta)=>data.length===meta.bytes&&createHash('sha256').update(data).digest('hex')===meta.sha256;
if (mode==='seal') {
  const source=realpathSync(path);
  const pieces=entries.map(([file,meta])=>{
    const actual=realpathSync(resolve(source,file.slice(1)));
    if (!actual.startsWith(source+sep)) throw new Error('Invalid media location');
    const data=readFileSync(actual);
    if (!verified(data,meta)) throw new Error('Source hash mismatch: '+file);
    return data;
  });
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(aad);
  const encrypted=Buffer.concat([cipher.update(gzipSync(Buffer.concat(pieces))),cipher.final()]);
  writeFileSync(bundle,Buffer.concat([marker,nonce,cipher.getAuthTag(),encrypted]),{flag:'wx'});
} else {
  const input=readFileSync(bundle);
  if (input.length<33||!input.subarray(0,4).equals(marker)||input.length>100*1024*1024) throw new Error('Invalid sealed package.');
  const decipher=createDecipheriv('aes-256-gcm',key,input.subarray(4,16));
  decipher.setAAD(aad);
  decipher.setAuthTag(input.subarray(16,32));
  const message=Buffer.concat([decipher.update(input.subarray(32)),decipher.final()]);
  const length=entries.reduce((sum,[,meta])=>sum+meta.bytes,0);
  const unpacked=gunzipSync(message,{maxOutputLength:length});
  if (unpacked.length!==length) throw new Error('Incorrect media package size.');
  const output=realpathSync(path);
  let offset=0;
  const validated=entries.map(([file,meta])=>{
    const bytes=unpacked.subarray(offset,offset+meta.bytes);
    offset+=meta.bytes;
    if (!verified(bytes,meta)) throw new Error('Decrypted hash mismatch: '+file);
    const target=resolve(output,file.slice(1));
    if (!target.startsWith(output+sep)||existsSync(target)) throw new Error('Unsafe asset destination: '+file);
    return {target,bytes};
  });
  for (const {target,bytes} of validated) {
    mkdirSync(dirname(target),{recursive:true});
    if (!realpathSync(dirname(target)).startsWith(output+sep)) throw new Error('Unsafe media directory.');
    writeFileSync(target,bytes,{flag:'wx'});
  }
}
console.log(`Verified ${entries.length} gallery assets.`);
