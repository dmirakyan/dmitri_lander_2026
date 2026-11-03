// Shared navigation is embedded so the local tools keep their self-only CSP.
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const links = [
  ['Admin', 'https://dmitri.im/admin/'],
  ['Investments', 'https://dmitri.im/invest/'],
  ['Date ideas', 'https://dmitri.im/dates/'],
  ['Writing', 'http://127.0.0.1:18766/admin/twitter/'],
  ['Broadway', 'https://dmitri.im/admin/#connect'],
];
const pages = [
  ['admin/index.html', 'admin/admin.css', 'Admin'],
  ['invest/index.html', 'invest/style.css', 'Investments'],
  ['dates/index.html', 'dates/dates.css', 'Date ideas'],
  ['admin/twitter/index.html', 'admin/twitter/style.css', 'Writing'],
];
const css = '/* ADMIN NAV START */\n' + await readFile(new URL('tools/admin-nav/nav.css', root), 'utf8') + '/* ADMIN NAV END */';
for (const [htmlPath, cssPath, current] of pages) {
  let html, style;
  try {
    html = await readFile(new URL(htmlPath, root), 'utf8');
    style = await readFile(new URL(cssPath, root), 'utf8');
  } catch (error) {
    // Writing is a local-only tool and may not be present in a public checkout.
    if (current === 'Writing' && error.code === 'ENOENT') continue;
    throw error;
  }
  const nav = `<!-- ADMIN NAV START -->\n<div class="tool-bar"><a class="tool-home" href="https://dmitri.im/" aria-label="Dmitri homepage">Dmitri<span class="tool-colors" aria-hidden="true"><i></i><i></i><i></i><i></i></span></a><nav class="tool-nav" aria-label="Admin tools">${links.map(([label, href]) => `<a href="${href}"${label === current ? ' aria-current="page"' : ''}${label === 'Writing' ? ' title="Local tool on this Mac"' : ''}>${label}</a>`).join('')}</nav></div>\n<!-- ADMIN NAV END -->`;
  html = html.includes('<!-- ADMIN NAV START -->')
    ? html.replace(/<!-- ADMIN NAV START -->[\s\S]*?<!-- ADMIN NAV END -->/, nav)
    : html.replace('<body>', '<body>\n' + nav + '\n');
  style = style.includes('/* ADMIN NAV START */')
    ? style.replace(/\/\* ADMIN NAV START \*\/[\s\S]*?\/\* ADMIN NAV END \*\//, css)
    : style.trimEnd() + '\n\n' + css + '\n';
  await writeFile(new URL(htmlPath, root), html);
  await writeFile(new URL(cssPath, root), style);
}
