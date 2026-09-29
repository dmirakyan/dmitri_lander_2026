# Cloudflare hosting

This site uses Cloudflare Workers Static Assets. The browser connects directly
to any separately hosted services; static hosting does not move those services
or require their server credentials.

## Build and deploy

```sh
npm ci
npm run build
npm run dev
```

`tools/build-site.mjs` stages the public website in `_site/`. Only the homepage,
robots/sitemap files, assets, blog, dates, and the three admin frontend files are
published. Hidden files and symlinks are excluded or rejected. Never point
Cloudflare's asset directory at the repository root.

For a manual deployment after authenticating with `npx wrangler login`:

```sh
npm run deploy
```

For Cloudflare's Git integration, select `dmirakyan/dmitri_lander_2026`, use
production branch `main`, build command `npm run build`, and deploy command
`npx wrangler deploy`. The Worker name is `dmitri-lander`.

## Services

- `/admin/` connects to the existing local Python service on the visitor's Mac.
  Keep `https://dmitri.im` as the production origin. A Cloudflare preview hostname
  is not in that service's allowed-origin list.
- `/dates/` may use a public Supabase browser configuration. Its database remains
  on Supabase. Never publish a service-role key, database password, or private
  board token in the build.
- Store any future backend credentials as Cloudflare Worker secrets, not in
  `_site/` or browser JavaScript. This deployment currently has no Worker script
  and therefore needs no backend secrets.

## Domain migration

Before changing dmitri.im's nameservers, copy and verify its existing DNS records,
including email records. Test the Worker deployment before switching production.
The current MX records use Namecheap's free email forwarding. That service
requires Namecheap DNS; copying the MX records alone does not establish that
forwarding will keep working. Confirm whether any aliases are used and migrate
their forwarding before a nameserver change if necessary.
Once the domain is active in Cloudflare, attach it as the Worker's custom domain.
Disable the old GitHub Pages workflow after cutover; the repository can then be
private without affecting Cloudflare hosting.
