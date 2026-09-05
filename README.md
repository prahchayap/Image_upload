# RaceRadar 🏃‍♂️📡

A personal dashboard that helps runners **discover, track and sign up for running events** —
so you never miss a ballot opening or an entry window again.

> **Status:** Early prototype. `index.html` is a self-contained, mobile-friendly web app
> with illustrative sample data. Open it in any browser — no build step, no backend.

## The idea

Runners keep missing ballots (London, Berlin, Tokyo…) and entry openings simply because
they don't know when they open. RaceRadar puts every important race and its ballot window
in one place, tailored to where you live and where you'd like to run.

## What the prototype demonstrates

- **Home location** — set your country (+ an extra region/country of interest). Saved on
  your device; the "Near me" filter surfaces relevant races.
- **Curated categories** — World Marathon Majors, European classics, Seven Continents,
  Disney (runDisney) weekends, Trail & Ultra, Iconic City races.
- **Ballot-first design** — every race shows its entry method (Ballot / General /
  Qualification / Charity), key dates, and a **"closing soon" countdown**.
- **Digestible info per race** — field size, weather, course profile, acceptance odds and
  a clear "how to get in" step list, so you can decide before you enter.
- **Watchlist** — star races to keep an eye on (saved on your device).
- **Search & filter** — by race, city, country, region, category, or status.
- **Pro / subscription tier** — free to browse; premium unlocks acceptance odds,
  backdoor entry routes and (in a real build) push alerts. Demonstrated with a locked-content teaser.

### Free vs Pro (concept)

| Feature | Free | Pro |
|---|:--:|:--:|
| Browse & search all races | ✅ | ✅ |
| Ballot dates & how-to-enter | ✅ | ✅ |
| Watchlist | ✅ | ✅ |
| Instant ballot-open push alerts | — | ✅ |
| Acceptance odds & historical success rates | — | ✅ |
| Good-for-Age / qualifying-time planner | — | ✅ |
| Charity & guaranteed-entry routes | — | ✅ |

## Try it

Open `index.html` in a browser (desktop or phone). State (home location, watchlist,
Pro trial) is stored locally via `localStorage`.

## Roadmap toward a real product

1. **Live data** — replace sample data with a maintained events database (start with the
   Abbott World Marathon Majors, then expand), or scrape/ingest official race calendars.
2. **Backend & accounts** — user profiles, cross-device sync, and a real subscription
   (e.g. Stripe) for the Pro tier.
3. **Notifications** — email + push (PWA / native) alerts when a watched ballot opens or is closing.
4. **Native/mobile** — wrap as a PWA or ship native apps; the current layout is already
   mobile-responsive.
5. **Personalisation** — recommend races by distance, travel budget, PB goals and past entries.

## Notes

All event details (dates, odds, fees) in the prototype are **illustrative sample data** for
demonstration and will not be accurate. Ballot windows change every year.
