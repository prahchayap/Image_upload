#!/usr/bin/env node
/**
 * RaceRadar server
 * ----------------
 * 1. Serves the static PWA over http://localhost so the service worker,
 *    "Add to Home Screen" install, and notifications actually work
 *    (they require a secure context: https or http://localhost).
 * 2. Provides Web Push endpoints for real remote ballot alerts.
 *
 * Runs with ZERO dependencies for static serving. Remote push additionally
 * needs the `web-push` package and VAPID keys — see server/README.md. If
 * `web-push` isn't installed, the server still runs (static + subscribe
 * storage); the push-sending endpoint reports that push is disabled.
 *
 *   node server/server.mjs           # http://localhost:8080
 *   PORT=3000 node server/server.mjs
 */
import { createServer } from 'node:http';
import { readFile, writeFile, readFile as rf } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8080;
const SUBS_FILE = join(ROOT, 'server', 'subscriptions.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

/* ---- optional web-push ---- */
let webpush = null;
try {
  webpush = (await import('web-push')).default;
  if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} catch { /* not installed — static + subscribe still work */ }

/* ---- tiny subscription store ---- */
async function loadSubs() { try { return JSON.parse(await rf(SUBS_FILE, 'utf8')); } catch { return []; } }
async function saveSubs(s) { await writeFile(SUBS_FILE, JSON.stringify(s, null, 2)); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon' };

function send(res, code, body, headers = {}) { res.writeHead(code, { 'Access-Control-Allow-Origin': '*', ...headers }); res.end(body); }
function json(res, code, obj) { send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json' }); }
function readBody(req) { return new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); }); }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });

  /* ---- API ---- */
  if (path === '/api/vapidPublicKey') return json(res, 200, { key: VAPID_PUBLIC, pushEnabled: !!(webpush && VAPID_PUBLIC && VAPID_PRIVATE) });

  if (path === '/api/subscribe' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body.subscription || !body.subscription.endpoint) return json(res, 400, { error: 'missing subscription' });
    const subs = await loadSubs();
    if (!subs.find((s) => s.subscription.endpoint === body.subscription.endpoint)) {
      subs.push({ subscription: body.subscription, watch: body.watch || [], added: new Date().toISOString() });
      await saveSubs(subs);
    }
    return json(res, 201, { ok: true, subscribers: subs.length });
  }

  if (path === '/api/notify' && req.method === 'POST') {
    if (ADMIN_TOKEN && req.headers['x-admin-token'] !== ADMIN_TOKEN) return json(res, 401, { error: 'unauthorized' });
    if (!webpush || !VAPID_PUBLIC || !VAPID_PRIVATE) return json(res, 503, { error: 'push disabled — install web-push and set VAPID keys (see server/README.md)' });
    const body = await readBody(req);
    const payload = JSON.stringify({ title: body.title || 'RaceRadar', body: body.body || '', url: body.url || '/index.html', tag: body.tag || 'raceradar' });
    const subs = await loadSubs();
    let sent = 0; const keep = [];
    for (const s of subs) {
      try { await webpush.sendNotification(s.subscription, payload); sent++; keep.push(s); }
      catch (e) { if (!(e.statusCode === 404 || e.statusCode === 410)) keep.push(s); } // drop expired
    }
    if (keep.length !== subs.length) await saveSubs(keep);
    return json(res, 200, { sent, subscribers: keep.length });
  }

  /* ---- static files ---- */
  let rel = decodeURIComponent(path === '/' ? '/index.html' : path);
  const filePath = normalize(join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  if (!existsSync(filePath)) return send(res, 404, 'Not found');
  try {
    const data = await readFile(filePath);
    send(res, 200, data, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
  } catch { send(res, 500, 'Server error'); }
});

server.listen(PORT, () => {
  console.log(`\n  RaceRadar → http://localhost:${PORT}`);
  console.log(`  Push: ${webpush && VAPID_PUBLIC && VAPID_PRIVATE ? 'ENABLED' : 'disabled (static + subscribe only) — see server/README.md'}\n`);
});
