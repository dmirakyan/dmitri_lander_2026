import {existsSync, readFileSync, writeFileSync, unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../',import.meta.url));
const id = process.env.CONTENT_MEDIA_KV_NAMESPACE_ID;
const useKv = /^[a-f0-9]{32}$/i.test(id ?? '');
const sealed = existsSync(root+'tools/content/gallery-media.enc') && /^[a-f0-9]{64}$/i.test(process.env.GALLERY_MEDIA_KEY?.trim() ?? '');
if (!useKv && !sealed) {
  console.error('Gallery media is not configured. Use GALLERY_MEDIA_KEY with the sealed bundle or a preloaded CONTENT_MEDIA_KV_NAMESPACE_ID.');
  process.exit(1);
}
const config = JSON.parse(readFileSync(root+'wrangler.jsonc','utf8'));
if (useKv) config.kv_namespaces = [...(config.kv_namespaces ?? []),{binding:'CONTENT_MEDIA',id}];
else {
  const materialized = spawnSync(process.execPath,['tools/content/sealed-media.mjs','unseal','_site'],{cwd:root,stdio:'inherit'});
  if (materialized.error) throw materialized.error;
  if (materialized.status !== 0) process.exit(materialized.status ?? 1);
}
const generated = root+'.wrangler.gallery.generated.json';
writeFileSync(generated,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
try {
  const env = {...process.env};
  delete env.GALLERY_MEDIA_KEY;
  const result = spawnSync('wrangler',['deploy','--config',generated],{cwd:root,env,stdio:'inherit'});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  unlinkSync(generated);
}
