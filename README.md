# RaceRadar 🏃‍♂️📡

An installable dashboard that helps runners **discover, track and sign up for
running events** — so you never miss a ballot opening or an entry window again.

> **Status:** Working prototype. It's a **PWA** (installable, offline-capable,
> push-ready) driven by a real, researched dataset, with a scraper for keeping
> that data fresh and a small server for real push notifications.

## What it does

- **Home location** — set your country (+ another region/country of interest),
  saved on your device. The **Near me** filter surfaces relevant races.
- **Curated categories** — World Marathon Majors, European, Seven Continents,
  Disney (runDisney), Trail & Ultra, Thailand, Iconic City.
- **Ballot-first** — every race shows entry method (Ballot / General /
  Qualification / Charity), key dates, and a **live "closes in N days"**
  countdown. Status is derived from dates, so it stays correct over time.
- **Digestible per-race info** — field size, weather, course, acceptance odds
  and a clear "how to get in" step list, before you commit.
- **Watchlist + ballot alerts** — star races and get notified when a watched
  ballot opens or is about to close.
- **Free vs Pro** — free to browse; Pro unlocks odds, backdoor entry routes and
  real-time push alerts (demonstrated with a locked-content teaser).
- **Estimated-date honesty** — forward ballot windows that aren't officially
  announced yet are marked **"Est."** and flagged in the detail view.

## Project layout

```
index.html                RaceRadar PWA (single-file app; fetches data/events.json)
manifest.webmanifest      PWA manifest
sw.js                     Service worker: offline shell + push + notification click
icons/                    App icons (SVG + generated PNGs)
data/events.json          Event data — the source of truth
scripts/scrape.mjs        Multi-source scraper (ahotu, utmb, thairun, raceroster, abbott)
scripts/build-seed.mjs    Injects events.json into index.html (offline/file:// fallback)
scripts/generate-icons.mjs  Regenerates the PNG icons (no dependencies)
server/                   Static host + Web Push server (real remote alerts)
```

## Run it

**Simplest (offline, no server):** open `index.html` in any browser. It uses the
data embedded by `build-seed.mjs`. Note: service workers and install/notifications
need a secure context, so for the *full* PWA experience use the server:

```bash
node server/server.mjs      # → http://localhost:8080  (install + offline + alerts)
```

## Keeping the data fresh (scraper)

The dataset is normalised from several public sources. The scraper is real and
runnable **wherever those domains are reachable** (some sandboxed/CI networks
block outbound access to them):

```bash
node scripts/scrape.mjs                          # all sources → scripts/scraped.json (staging)
node scripts/scrape.mjs --source ahotu,utmb      # pick sources
node scripts/scrape.mjs --apply --out data/events.json   # merge into the live data
node scripts/build-seed.mjs                       # refresh the offline seed after updating data
```

Adapters live in `scripts/scrape.mjs`: **abbott** (curated canonical Majors, no
network), **ahotu**, **utmb**, **raceroster**, **thairun**. Each fails softly, so
one unreachable source doesn't stop the run. Scraped entries never overwrite
curated ones unless you pass `--overwrite`.

> The bundled `data/events.json` was researched from official race pages and
> reputable running sources. Forward ballot windows marked `provisional` are
> best estimates from prior-year patterns — **always confirm on the official
> race site.** Sources include the Abbott World Marathon Majors, UTMB, thai.run,
> ahotu and Race Roster.

## Real push notifications

Client side is wired in `index.html` + `sw.js`; the server sends the pushes. See
[`server/README.md`](server/README.md) for the full setup:

1. `cd server && npm install`
2. `npm run gen-vapid` and set the VAPID env vars
3. Put the **public** key into `PUSH_PUBLIC_KEY` in `index.html`
4. `node server.mjs`, then `POST /api/notify` to alert every subscribed device

Without the server you still get **local reminders** for watched ballots that are
opening or closing soon (fired while the app is open), plus a "test alert" button.

## Roadmap

1. **Scheduler** — a cron job that watches `data/events.json` windows and fires
   `/api/notify` automatically when a ballot opens or nears its deadline.
2. **Accounts & sync** — cross-device watchlist and a real Stripe-backed Pro tier.
3. **More sources & richer data** — expand beyond the seed set; add photos,
   elevation profiles and travel logistics.
4. **Personalisation** — recommend races by distance, PB goals and travel budget.

## Free vs Pro (concept)

| Feature | Free | Pro |
|---|:--:|:--:|
| Browse & search all races | ✅ | ✅ |
| Ballot dates & how-to-enter | ✅ | ✅ |
| Watchlist + local reminders | ✅ | ✅ |
| Real-time push when ballots open | — | ✅ |
| Acceptance odds & success rates | — | ✅ |
| Good-for-Age / qualifying-time planner | — | ✅ |
| Charity & guaranteed-entry routes | — | ✅ |
