# RaceRadar server

Two jobs:

1. **Serve the PWA over `http://localhost`** so the service worker, install
   prompt, and notifications work (they need a secure context — `https://` or
   `http://localhost`; opening `index.html` as a `file://` won't register a
   service worker).
2. **Send real Web Push ballot alerts** to subscribed devices.

## Run it (static + subscribe, no install needed)

```bash
node server/server.mjs
# → http://localhost:8080
```

That alone gives you an installable, offline-capable app and stores push
subscriptions. Sending push messages needs the extra step below.

## Enable real remote push

1. Install the one dependency:
   ```bash
   cd server && npm install
   ```
2. Generate a VAPID key pair:
   ```bash
   npm run gen-vapid
   ```
3. Put the keys in the environment (copy `.env.example` → `.env`, or export):
   ```bash
   export VAPID_PUBLIC_KEY=...   VAPID_PRIVATE_KEY=...
   export VAPID_SUBJECT=mailto:you@example.com
   export ADMIN_TOKEN=some-secret        # optional, protects /api/notify
   node server.mjs
   ```
4. Wire the **public** key into the front end so browsers can subscribe: set
   `PUSH_PUBLIC_KEY` near the top of the push section in `index.html` to your
   `VAPID_PUBLIC_KEY`. When a user enables alerts, the app subscribes and POSTs
   the subscription to `/api/subscribe`.

## Send a test push

```bash
curl -X POST http://localhost:8080/api/notify \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: some-secret' \
  -d '{"title":"Berlin Marathon ballot is OPEN","body":"The 2027 lottery just opened — enter now.","url":"/index.html"}'
```

Every subscribed device gets the notification, even with the app closed.

## Endpoints

| Method | Path                   | Purpose                                        |
|--------|------------------------|------------------------------------------------|
| GET    | `/api/vapidPublicKey`  | Public key + whether push is enabled           |
| POST   | `/api/subscribe`       | Store a `{subscription, watch}` from a browser |
| POST   | `/api/notify`          | Broadcast a push (needs `X-Admin-Token` if set)|

Subscriptions are stored in `server/subscriptions.json` (git-ignored). For
production, swap the flat file for a database and drive `/api/notify` from a
scheduler that watches ballot windows in `data/events.json`.
