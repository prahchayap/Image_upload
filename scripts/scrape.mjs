#!/usr/bin/env node
/**
 * RaceRadar scraper
 * -----------------
 * Pulls running events from multiple public sources, normalises them to the
 * RaceRadar event schema, de-duplicates, and writes the result.
 *
 * Sources (adapters): abbott, utmb, thairun, ahotu, raceroster
 *
 * Usage:
 *   node scripts/scrape.mjs                      # all sources -> scripts/scraped.json (staging)
 *   node scripts/scrape.mjs --source ahotu,utmb  # only these sources
 *   node scripts/scrape.mjs --out data/events.json --apply
 *                                                # merge into the live data file
 *   node scripts/scrape.mjs --overwrite          # let scraped entries replace curated ones
 *
 * NOTE ON NETWORK: the third-party sites must be reachable from wherever this
 * runs. In restricted/sandboxed environments outbound access to these domains
 * may be blocked; each adapter fails softly and the run continues. The `abbott`
 * adapter is a curated canonical list (the Majors are stable) and needs no
 * network, so it always yields data — a good way to verify the pipeline.
 *
 * Zero external dependencies: uses Node's built-in fetch + lightweight parsing.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'RaceRadarBot/0.1 (+https://github.com/prahchayap/Image_upload)';
const TIMEOUT_MS = 20000;

/* ----------------------------- CLI args ----------------------------- */
const argv = process.argv.slice(2);
const getFlag = (name) => argv.includes('--' + name);
const getOpt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const only = getOpt('source', '').split(',').map((s) => s.trim()).filter(Boolean);
const outPath = join(ROOT, getOpt('out', 'scripts/scraped.json'));
const apply = getFlag('apply');
const overwrite = getFlag('overwrite');

/* ----------------------------- fetch helper ----------------------------- */
async function get(url, kind = 'text') {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': kind === 'json' ? 'application/json' : 'text/html' }, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return kind === 'json' ? res.json() : res.text();
  } finally { clearTimeout(t); }
}

/* ----------------------------- parse helpers ----------------------------- */
// Pull all JSON-LD blocks and return any schema.org Event objects (flattened).
function jsonLdEvents(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let parsed; try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (node['@graph']) stack.push(...[].concat(node['@graph']));
      const type = [].concat(node['@type'] || []);
      if (type.some((t) => /Event/i.test(t))) out.push(node);
    }
  }
  return out;
}
function nextData(html) {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null; try { return JSON.parse(m[1]); } catch { return null; }
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* ----------------------------- normaliser ----------------------------- */
const GRADS = ['linear-gradient(135deg,#2563eb,#1e3a8a)', 'linear-gradient(135deg,#f59e0b,#b45309)', 'linear-gradient(135deg,#14b8a6,#0f766e)', 'linear-gradient(135deg,#ec4899,#a21caf)', 'linear-gradient(135deg,#7c3aed,#4c1d95)', 'linear-gradient(135deg,#22c55e,#15803d)'];
const FLAGS = { 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', Germany: '🇩🇪', Japan: '🇯🇵', France: '🇫🇷', Australia: '🇦🇺', 'South Africa': '🇿🇦', Brazil: '🇧🇷', China: '🇨🇳', Thailand: '🇹🇭', Antarctica: '🇦🇶', Italy: '🇮🇹', Spain: '🇪🇸', Canada: '🇨🇦' };
const REGION = { 'United States': 'North America', Canada: 'North America', 'United Kingdom': 'Europe', Germany: 'Europe', France: 'Europe', Italy: 'Europe', Spain: 'Europe', Japan: 'Asia', China: 'Asia', Thailand: 'Asia', Australia: 'Oceania', 'South Africa': 'Africa', Brazil: 'South America', Antarctica: 'Antarctica' };

function normalize(raw, source, i = 0) {
  const country = raw.country || '';
  return {
    id: raw.id || slug((raw.name || 'race') + '-' + (raw.date || '').slice(0, 4)),
    name: raw.name || 'Unknown race',
    city: raw.city || '',
    country,
    flag: raw.flag || FLAGS[country] || '🏳️',
    region: raw.region || REGION[country] || '',
    cats: raw.cats && raw.cats.length ? raw.cats : ['iconic'],
    major: raw.major || '',
    dist: raw.dist || 'Marathon',
    date: raw.date || '',
    method: raw.method || 'General',
    ballotOpen: raw.ballotOpen || '',
    ballotClose: raw.ballotClose || '',
    result: raw.result || '—',
    provisional: raw.provisional !== undefined ? raw.provisional : true,
    price: raw.price || '',
    grad: raw.grad || GRADS[i % GRADS.length],
    facts: raw.facts || { Field: '—', Weather: '—', Course: '—', Success: '—' },
    blurb: raw.blurb || `${raw.name} — imported from ${source}. Details to be enriched.`,
    steps: raw.steps || ['Check the official site for entry details'],
    source,
    official: raw.official || '',
    needsReview: raw.needsReview !== false,
  };
}

/* =====================================================================
 * ADAPTERS  — each returns an array of raw event objects (pre-normalise)
 * ===================================================================== */

// Abbott World Marathon Majors — curated canonical list (stable; no network).
async function abbott() {
  const majors = [
    { name: 'Tokyo Marathon', city: 'Tokyo', country: 'Japan', cats: ['major', 'seven'], method: 'Ballot', official: 'https://www.marathon.tokyo/en/' },
    { name: 'Boston Marathon', city: 'Boston', country: 'United States', cats: ['major'], method: 'Qualification', official: 'https://www.baa.org/' },
    { name: 'London Marathon', city: 'London', country: 'United Kingdom', cats: ['major', 'europe'], method: 'Ballot', official: 'https://www.londonmarathonevents.co.uk/' },
    { name: 'Sydney Marathon', city: 'Sydney', country: 'Australia', cats: ['major', 'seven'], method: 'Ballot', official: 'https://www.sydneymarathon.com/' },
    { name: 'Berlin Marathon', city: 'Berlin', country: 'Germany', cats: ['major', 'europe'], method: 'Ballot', official: 'https://www.bmw-berlin-marathon.com/en/' },
    { name: 'Chicago Marathon', city: 'Chicago', country: 'United States', cats: ['major'], method: 'Ballot', official: 'https://www.chicagomarathon.com/' },
    { name: 'New York City Marathon', city: 'New York', country: 'United States', cats: ['major', 'seven'], method: 'Ballot', official: 'https://www.nyrr.org/tcsnycmarathon' },
  ];
  return majors.map((m) => ({ ...m, major: 'MAJOR', dist: 'Marathon', needsReview: false, provisional: true }));
}

// ahotu.com — large aggregator; pages expose schema.org Event JSON-LD.
async function ahotu() {
  const urls = [
    'https://www.ahotu.com/calendar/running/marathon',
    'https://www.ahotu.com/calendar/running/marathon/thailand',
  ];
  const out = [];
  for (const url of urls) {
    const html = await get(url);
    for (const ev of jsonLdEvents(html)) {
      const loc = ev.location || {};
      const addr = loc.address || {};
      out.push({
        name: ev.name,
        city: addr.addressLocality || loc.name || '',
        country: addr.addressCountry?.name || addr.addressCountry || '',
        date: (ev.startDate || '').slice(0, 10),
        official: ev.url || '',
        cats: ['iconic'],
      });
    }
  }
  return out;
}

// UTMB World Series — events page; try __NEXT_DATA__ then JSON-LD.
async function utmb() {
  const html = await get('https://utmb.world/utmb-world-series-events');
  const nd = nextData(html);
  const out = [];
  if (nd) {
    const blob = JSON.stringify(nd);
    const re = /"name":"([^"]+)"[^}]*?"startDate":"([^"]+)"/g; let m;
    while ((m = re.exec(blob))) out.push({ name: m[1], date: m[2].slice(0, 10), cats: ['trail'], method: 'Qualification' });
  }
  for (const ev of jsonLdEvents(html)) out.push({ name: ev.name, date: (ev.startDate || '').slice(0, 10), cats: ['trail'], method: 'Qualification', official: ev.url });
  return out;
}

// Race Roster — registration platform; event pages carry JSON-LD Event data.
async function raceroster() {
  // Example discovery endpoint; adjust query as needed for a real crawl.
  const html = await get('https://raceroster.com/search?q=marathon');
  return jsonLdEvents(html).map((ev) => ({
    name: ev.name,
    city: ev.location?.address?.addressLocality || '',
    country: ev.location?.address?.addressCountry || '',
    date: (ev.startDate || '').slice(0, 10),
    official: ev.url || '',
    method: 'General',
  }));
}

// thai.run — Thai running-events platform.
async function thairun() {
  const html = await get('https://thai.run/');
  const out = jsonLdEvents(html).map((ev) => ({
    name: ev.name, country: 'Thailand', cats: ['thai'], method: 'General',
    date: (ev.startDate || '').slice(0, 10), official: ev.url || 'https://thai.run/',
  }));
  const nd = nextData(html);
  if (nd) {
    const re = /"title":"([^"]+)"[^}]*?"(?:event_date|date|startDate)":"(\d{4}-\d{2}-\d{2})/g; let m;
    while ((m = re.exec(JSON.stringify(nd)))) out.push({ name: m[1], country: 'Thailand', cats: ['thai'], method: 'General', date: m[2], official: 'https://thai.run/' });
  }
  return out;
}

const ADAPTERS = { abbott, ahotu, utmb, raceroster, thairun };

/* ----------------------------- run ----------------------------- */
async function run() {
  const names = only.length ? only : Object.keys(ADAPTERS);
  const collected = [];
  for (const name of names) {
    const fn = ADAPTERS[name];
    if (!fn) { console.warn(`! unknown source "${name}" — skipping`); continue; }
    process.stdout.write(`• ${name}… `);
    try {
      const raw = await fn();
      const norm = raw.filter((r) => r && r.name).map((r, i) => normalize(r, name, i));
      collected.push(...norm);
      console.log(`${norm.length} events`);
    } catch (e) {
      console.log(`failed (${e.message}) — source unreachable or blocked; continuing`);
    }
  }

  // de-dup by id (first writer wins within this run)
  const byId = new Map();
  for (const ev of collected) if (!byId.has(ev.id)) byId.set(ev.id, ev);
  let events = [...byId.values()];

  // Optionally merge into an existing data file.
  const targetIsLive = apply || outPath.endsWith('events.json');
  if (targetIsLive && existsSync(outPath)) {
    const existing = JSON.parse(readFileSync(outPath, 'utf8'));
    const curated = existing.events || [];
    const map = new Map(curated.map((e) => [e.id, e]));
    for (const ev of events) {
      if (map.has(ev.id) && !overwrite) continue;      // keep curated unless --overwrite
      map.set(ev.id, ev);
    }
    const payload = {
      ...existing,
      generatedAt: new Date().toISOString().slice(0, 10),
      events: [...map.values()],
    };
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`\nMerged ${events.length} scraped into ${map.size} total → ${outPath}`);
  } else {
    const payload = { generatedAt: new Date().toISOString().slice(0, 10), sources: names, events };
    writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`\nWrote ${events.length} events → ${outPath}`);
    if (!apply) console.log('(staging file — review it, then re-run with --apply --out data/events.json to merge)');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
