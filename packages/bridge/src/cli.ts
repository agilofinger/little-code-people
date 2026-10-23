#!/usr/bin/env -S npx tsx
/**
 * little-code-people — starts the local bridge and (optionally) opens the house in the browser.
 *
 *   --port <n>             port to listen on (default 6464, env LCP_PORT)
 *   --open                 open the browser
 *   --allow-origin <url>   also let a hosted copy of the game connect (repeatable,
 *                          env LCP_ALLOWED_ORIGINS, comma-separated). Optional.
 *   --new-token            replace the access key; every browser needs the new link
 *   --dev                  also allow the Vite dev server (npm run dev)
 *   --print                print events to stdout (debugging)
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_PORT, EVENTS_PATH, pageLink } from '@lcp/protocol';
import open from 'open';
import { configDir, loadToken } from './auth.ts';
import { Hub } from './hub.ts';
import { localOrigins, parseOrigin } from './origins.ts';
import { startServer } from './server.ts';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.LCP_PORT ?? String(DEFAULT_PORT) },
    open: { type: 'boolean', default: false },
    'allow-origin': { type: 'string', multiple: true, default: [] },
    'new-token': { type: 'boolean', default: false },
    dev: { type: 'boolean', default: false },
    print: { type: 'boolean', default: false },
  },
});

const port = Number(values.port);
const host = '127.0.0.1';
const staticDir = fileURLToPath(new URL('../../game/dist', import.meta.url));

let hosted: string[];
try {
  const fromEnv = (process.env.LCP_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  hosted = [...new Set([...values['allow-origin'], ...fromEnv].filter(Boolean).map(parseOrigin))];
} catch (err) {
  console.error((err as Error).message);
  process.exit(2);
}

const token = loadToken(configDir(), values['new-token']);

const hub = new Hub();
if (values.print) {
  hub.subscribe((e) => {
    const { type, ...rest } = e;
    console.log(type, JSON.stringify(rest).slice(0, 220));
  });
}
hub.start();

const server = startServer(hub, {
  port,
  host,
  staticDir,
  origins: [...localOrigins(port, values.dev), ...hosted],
  token,
});
server.on('listening', () => {
  const local = pageLink(`http://${host}:${port}/`, token);
  const bridge = port === DEFAULT_PORT ? undefined : `ws://${host}:${port}${EVENTS_PATH}`;
  const lines = ['', '  Little Code People is running.', '', `  Your house:   ${local}`];
  if (values.dev) lines.push(`  Hot reload:   ${pageLink('http://localhost:5173/', token)}`);
  for (const origin of hosted) lines.push(`  Hosted copy:  ${pageLink(`${origin}/`, token, bridge)}`);
  lines.push('', '  The link carries your access key. Keep it to yourself.', '');
  console.log(lines.join('\n'));
  if (values.open) void open(local);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Is the bridge already running? Try --port <n>.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

const shutdown = () => {
  hub.stop();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
