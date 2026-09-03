# Deploying the mock sync server (free)

The app needs the `server/` process reachable over the internet so two
devices (and a reviewer) can sync through it. It's a plain Node + Socket.IO
service that holds the board in memory — restarting it just resets to the
seed board, which is fine.

Config files are already in `server/`:

| File | For |
|---|---|
| `render.yaml` | Render (recommended — no Docker, simplest) |
| `Dockerfile` + `fly.toml` | Fly.io / Koyeb / Cloud Run / Railway |

---

## Option A — Render (recommended)

1. **Push this repo to GitHub** (Render deploys from a repo):
   ```bash
   git add -A && git commit -m "Add deploy config"
   git remote add origin https://github.com/<you>/kanban-collab-board.git
   git push -u origin master
   ```
2. Go to <https://dashboard.render.com> → **New → Blueprint** → pick the repo.
   Render reads `server/render.yaml` and creates a free web service.
3. When it's live you get a URL like
   `https://kanban-mock-server.onrender.com`. Open `/health` in a browser to
   confirm (`{"ok":true,...}`).
4. **Keep it awake during a review** (free tier sleeps after 15 min idle):
   at <https://cron-job.org> add a job that GETs
   `https://<your-service>.onrender.com/health` every 10 minutes.

## Option B — Fly.io (stays always-on, no cold starts)

```bash
# one-time: install flyctl + sign in
curl -L https://fly.io/install.sh | sh
flyctl auth login

cd server
flyctl launch --now         # reads fly.toml + Dockerfile
# later updates:
flyctl deploy
```
You get `https://kanban-mock-server.fly.dev`.

Koyeb, Railway and Cloud Run also work off the same `server/Dockerfile`.

---

## Point the app at the deployed server

In [`app/src/services/config.ts`](app/src/services/config.ts) set:

```ts
const PRODUCTION_SERVER_URL = 'https://kanban-mock-server.onrender.com';
```

Release builds (`__DEV__ === false`) then use that URL; dev builds keep
using `localhost` / `10.0.2.2`.

Because the server is now HTTPS, you can also delete
`android:usesCleartextTraffic="true"` from
`app/android/app/src/main/AndroidManifest.xml`.

---

## Build the app to hand over

```bash
cd app && npm install
cd ios && pod install && cd ..

# Android APK
npx react-native build-android --mode=release
# -> app/android/app/build/outputs/apk/release/app-release.apk

# iOS: archive in Xcode, or use TestFlight
```

Share the APK directly, or use **Firebase App Distribution** (free) for
Android / **TestFlight** for iOS.
