# Cloudflare hosting

This site uses Cloudflare Workers Static Assets. The browser connects directly
to any separately hosted services; static hosting does not move those services
or require their server credentials.

The deployed site is https://dmitri-lander.dmitri-d68.workers.dev. Cloudflare
lists this Worker as **Assets only / Free**. Wrangler is authenticated on this
Mac, and `wrangler.jsonc` selects the correct Cloudflare account.

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

Website changes pushed to `main` automatically deploy through
`.github/workflows/cloudflare.yml`. The workflow installs the pinned dependencies,
builds the public-only `_site/` directory, and deploys with Wrangler. Changes to
unrelated files do not trigger a deployment. You can also run it manually from
GitHub Actions or use `npm run deploy` locally.

The deployment credential is stored in the repository's encrypted
`CLOUDFLARE_API_TOKEN` Actions secret. It has Workers Scripts:Edit permission
only for this Cloudflare account. Never put its value in source files.

This uses GitHub Actions rather than Cloudflare's built-in GitHub App connection,
which loops back to the existing installation. Both the Actions workflow and
manual Wrangler deployments work with a private repository.

## Services

- `/admin/` connects to the existing local Python service on the visitor's Mac.
  Keep `https://dmitri.im` as the production origin. A Cloudflare preview hostname
  is not in that service's allowed-origin list.
- `/dates/` uses a public Supabase browser configuration. Its database remains
  on Supabase; cloud sync was verified on the deployed Worker. Never publish a service-role key, database password, or private
  board token in the build.
- Store any future backend credentials as Cloudflare Worker secrets, not in
  `_site/` or browser JavaScript. This deployment currently has no Worker script
  and therefore needs no backend secrets.

## Domain migration (DNS propagation pending)

On September 30, 2026, Namecheap was changed to Custom DNS with
`cleo.ns.cloudflare.com` and `ximena.ns.cloudflare.com`. Cloudflare's Free
zone is waiting for the registry to publish the new delegation.

Both `dmitri.im` and `www.dmitri.im` are attached to the `dmitri-lander` Worker,
and their custom-domain routes are in `wrangler.jsonc`. The five imported
GitHub hosting records were replaced; MX/TXT records were retained.
Namecheap has no configured forwarding aliases, and the user accepted the
loss of its unused free email-forwarding service.

GitHub Pages remains available during DNS propagation. Once public DNS points
to Cloudflare and HTTPS is verified, disable the old Pages workflow. The
repository can then be made private without affecting the Cloudflare site.

The former hosting records, for rollback reference, were four root A records
(`185.199.108.153` through `185.199.111.153`) and a `www` CNAME to
`dmirakyan.github.io`; the old nameservers were `dns1.registrar-servers.com`
and `dns2.registrar-servers.com`.
