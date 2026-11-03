# Admin navigation

Edit the links in `tools/sync-admin-nav.mjs` and the styles in `nav.css`, then run:

```
node tools/sync-admin-nav.mjs
npm run build
```

The same navigation is embedded in Admin/Broadway, Investments, Date ideas, and the local Writing tool when its files are present. Embedding preserves the local servers' self-only CSP and does not require extra routes. Public links are absolute so they also work from a local tool. Broadway opens the existing connection panel; Writing runs on this Mac. The build allowlist continues to exclude Writing's local workspace.
