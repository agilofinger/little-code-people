# Hosting (optional)

The standard way to run Little Code People is local: `npm start` serves the game from your own
computer and nothing leaves it. Read this only if you want a public copy, for example to show the
demo house to others.

## What a hosted copy does

A hosted copy is the same static game, just served from a public address.
- **Visitors without a bridge** see the demo house. The page doesn't even try to reach their
  computer.
- **You**, with the bridge running, can open the hosted copy with your key. Your browser then
  connects from that page to the bridge on your own computer. The host only delivers the files and
  never sees a session.

The hosted copy sets no cookies and has no analytics, trackers or third-party requests. Your
browser stores the settings and, once you open the link, your key in its own local storage. The
host only serves the files and, like any web server, keeps the usual request logs.

## Deploy to Cloudflare

You need a Cloudflare account. The first time, log in with `npx wrangler@4 login`. Then:

```sh
npm run deploy:cloudflare
```

This builds the game and publishes `packages/game/dist` as a static Worker named
`little-code-people`. Wrangler prints the address, e.g. `https://little-code-people.<you>.workers.dev`.
You can add your own domain in the Cloudflare dashboard. The settings are in
[cloudflare/wrangler.jsonc](cloudflare/wrangler.jsonc).

Other static hosts work too: upload `packages/game/dist`. Cloudflare and Netlify read the
`_headers` file in it and send the full security policy. Other hosts still get the policy through a
meta tag in the page, but without protection against being embedded in other sites.

## See your own sessions on the hosted copy

1. Start the bridge and name the hosted address exactly:

   ```sh
   npm run bridge -- --allow-origin https://little-code-people.<you>.workers.dev
   ```

   Or set `LCP_ALLOWED_ORIGINS` (comma-separated). Wildcards and plain http are refused.

2. Open the **Hosted copy** link the bridge prints. It carries your key after `#`, which is never
   sent to the host. The page stores the key, so next time the plain address is enough while the
   bridge runs with `--allow-origin`.

3. **Chrome** asks once whether the site may access devices on your local network. Allow it.
   **Firefox** connects without asking. **Safari** may block a secure page from talking to your
   computer. If so, use the local address instead.

## What you trust when you use it

The key keeps out other websites and other users of your computer. It cannot protect you from the
hosted copy itself: while you have it open with your key, its code can read your sessions, just as
the local copy does. So, with your real sessions:
- Allow only addresses you control, and keep the list short.
- Protect the accounts that can change the site: two-factor login on Cloudflare and GitHub, and
  deploy only from your protected main branch after review.
- If in doubt, use the local address. It is the same game, served from your own disk.

Revoke access at any time: restart the bridge without `--allow-origin`, or with `--new-token` to
change the key everywhere.
