# Puffin Quest

A cute daily-quest game with a **real backend**: accounts, a shared Postgres
database, and a genuine community "Review Cove" — other real puffineers
approve your quest photos (3 approvals finalizes it and pays out your
Puffins). Also includes seasonal Fight challenges, a Fishing gacha, a
shareable profile page, and optional linked social accounts (Facebook /
Instagram / LinkedIn) shown as clickable icons on your profile and on your
cards in the Cove.

Everything lives in [`webapp/`](webapp/) — a single Node.js/Express service
that serves the frontend (`webapp/public/`) and the JSON API
(`webapp/src/`) from one process, backed by one Postgres database. That
one-service-plus-one-database shape is deliberately simple so it fits
Render's free tier.

## Project layout

```
webapp/
  src/            Express API (auth, quests, cove, fight, fish, profile)
  public/         Frontend — index.html + app.js, no build step
  render.yaml.. → see /render.yaml at repo root (Render Blueprint)
  docker-compose.yml   local Postgres for development
render.yaml       Render Blueprint: provisions the web service + database
```

## Run it locally

Requirements: Node 18+, Docker (for local Postgres) — or point
`DATABASE_URL` at any Postgres instance you already have.

```bash
cd webapp
npm install
docker compose up -d          # starts local Postgres on :5432
cp .env.example .env          # then edit JWT_SECRET to any long random string
npm start                     # http://localhost:3000
```

The server creates its own tables on boot (see `src/db.js`) — no separate
migration step needed.

## Deploy it for real (GitHub + Render, both free)

### 1. Push this repo to GitHub

```bash
git init                      # if not already a repo
git add .
git commit -m "Puffin Quest: real backend + hosting setup"
```

Then create an **empty** repository on GitHub (github.com → New repository —
don't initialize it with a README), and push:

```bash
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

### 2. Deploy to Render from the Blueprint

Render's free tier gives you a web service + a Postgres database, and the
`render.yaml` at the repo root describes both so Render can set them up in
one step:

1. Go to [render.com](https://render.com) and sign in (GitHub sign-in is
   easiest since your code is already there).
2. **New → Blueprint**, then pick the GitHub repo you just pushed.
3. Render reads `render.yaml` and shows two resources to create:
   `puffin-quest` (web service, free) and `puffin-quest-db` (Postgres,
   free). Click **Apply**.
4. Render builds and deploys automatically (`npm install` then
   `npm start`, as configured). `DATABASE_URL` and a random `JWT_SECRET`
   are wired up for you automatically — nothing to type in.
5. When the deploy finishes you'll have a live URL like
   `https://puffin-quest.onrender.com`. Open it and register an account to
   confirm it works before moving on to the domain.

### 3. Point your own domain at it

1. In the Render dashboard, open the `puffin-quest` web service → **Settings
   → Custom Domains → Add Custom Domain**, and enter your domain (e.g.
   `quest.yourdomain.com`, or the bare `yourdomain.com`).
2. Render shows you the exact DNS record to add (a `CNAME` pointing at your
   `*.onrender.com` address for a subdomain, or an `A`/`ALIAS` record for a
   bare apex domain — Render displays the correct value for your case).
3. Add that record at your domain registrar's DNS settings page (wherever
   you bought/manage the domain — Namecheap, GoDaddy, Cloudflare, Google
   Domains, etc. all have a "DNS records" or "DNS management" page).
4. DNS propagation usually takes a few minutes to a few hours. Render
   auto-issues a free HTTPS certificate for the domain once it verifies.

You're then live at your own domain with real accounts and a real
community review Cove.

## Good to know about the free tier

- **The free web service sleeps after ~15 minutes idle.** The next visit
  wakes it up but takes 30–60 seconds to respond while it cold-starts.
  Fine for personal/small-group use; upgrade the Render plan to keep it
  always-on if that matters to you.
- **Render's free Postgres database expires 90 days after creation** (Render
  deletes free databases after that window). Before it expires, either
  upgrade the database to a paid plan in the Render dashboard, or export
  the data (`pg_dump`) and recreate it — otherwise accounts/progress will
  be lost after 90 days.
- Quest photos are stored as small resized thumbnails directly in Postgres
  (not a separate file host), which keeps the whole app to one database
  and avoids needing a third-party storage account.

## What's genuinely real vs. simplified

- Accounts, passwords (bcrypt-hashed), sessions (JWT), quest submissions,
  the 3-approval Review Cove, streaks, Fight challenges, the Fishing gacha,
  and profile photos/social links are all backed by the real Postgres
  database — this is a real multi-user app, not a demo.
- Live updates use polling (the app re-checks every ~7 seconds) rather than
  WebSockets — simple and reliable, with a few seconds of lag instead of
  instant push. Swapping in WebSockets/SSE later would be a
  backend-and-frontend change, not a redesign.
