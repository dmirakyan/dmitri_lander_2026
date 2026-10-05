import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '_site');
// Publish only the website. Private workspaces, tools, and repository metadata
// must never be included in the upload, even if new folders are added later.
const publicPaths = [
  'index.html', 'robots.txt', 'sitemap.xml',
  'assets', 'blog', 'dates', 'clara', '_headers',
  'admin/index.html', 'admin/admin.css', 'admin/admin.js',
];

async function checkTree(location) {
  const stat = await lstat(location);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to publish symlink: ${location}`);
  if (stat.isDirectory()) {
    for (const entry of await readdir(location)) {
      if (!entry.startsWith('.')) await checkTree(path.join(location, entry));
    }
  }
}

for (const entry of publicPaths) await checkTree(path.join(root, entry));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of publicPaths) {
  const destination = path.join(output, entry);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, entry), destination, {
    recursive: true,
    filter: source => !path.basename(source).startsWith('.'),
  });
}
console.log('Public website staged in _site/');
