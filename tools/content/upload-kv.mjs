import {readFileSync, realpathSync, statSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import manifest from '../../worker/content-media.json' with {type:'json'};

const args = process.argv.slice(2);
const remote = args.includes('--confirm-remote-upload');
const source = args[0] && !args[0].startsWith('--') ? args[0] : 'content';
if (args.some((a,i)=>i>0 && a!=='--confirm-remote-upload')) throw new Error('Usage: node tools/content/upload-kv.mjs /path/to/content [--confirm-remote-upload]');
const id = process.env.CONTENT_MEDIA_KV_NAMESPACE_ID;
const directory = realpathSync(resolve(source));
const payload = [];
const unique = new Set();
let bytes = 0;
for (const [pathname, row] of Object.entries(manifest)) {
  const path = realpathSync(resolve(directory,pathname.slice('/content/'.length)));
  if (!path.startsWith(directory+sep) || !statSync(path).isFile()) throw new Error('Refusing path outside gallery media: '+pathname);
  const data = readFileSync(path);
  const actual = createHash('sha256').update(data).digest('hex');
  if (actual!==row.sha256 || data.length!==row.bytes || row.key!==`gallery/v1/${actual}` || data.length>25*1024*1024) throw new Error('Asset does not match the verified manifest: '+pathname);
  if (unique.has(row.key)) continue;
  unique.add(row.key);
  payload.push({key:row.key,value:data.toString('base64'),base64:true});
  bytes += data.length;
}
console.log(`Verified ${payload.length} allowed values, ${bytes} bytes.`);
if (!remote) {
  console.log('Dry run: no upload or Cloudflare authentication attempted.');
} else {
  if (!/^[a-f0-9]{32}$/i.test(id ?? '')) throw new Error('Set CONTENT_MEDIA_KV_NAMESPACE_ID to the verified target namespace ID.');
  const scratch = mkdtempSync(join(tmpdir(),'gallery-kv-'));
  try {
    const filename = join(scratch,'payload.json');
    writeFileSync(filename,JSON.stringify(payload),{mode:0o600});
    const result = spawnSync('npx',['--no-install','wrangler','kv','bulk','put',filename,'--namespace-id',id,'--remote'],{stdio:'inherit'});
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally { rmSync(scratch,{recursive:true,force:true}); }
}
