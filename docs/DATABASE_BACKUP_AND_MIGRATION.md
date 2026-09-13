# Puffin Quest — Moving the database to Neon

Render's free PostgreSQL instance is **deleted automatically 90 days after it
was created**. When it goes, every account, quest photo, cheer and Puffin
balance goes with it. The plan is to move the database to Neon, whose free
Postgres tier is permanent rather than a trial, so the clock disappears.

Find your deadline on the Render dashboard: **Dashboard → puffin-quest-db →
Info**. Put that date in your calendar with a two-week reminder, in case the
move slips.

---

## Why not Hostinger?

Hostinger Premium is shared web hosting and offers MySQL/MariaDB only.
PostgreSQL is not available on its Shared or Cloud plans, only on Hostinger
VPS plans where you install and maintain it yourself. Puffin Quest is
Postgres-specific down to its `TEXT[]` array columns and `TIMESTAMPTZ`
timestamps, so MySQL would mean rewriting the whole data layer.

Hostinger is still useful here for two things. It can **store the backup
files** so a copy lives somewhere other than your laptop, and it keeps
**handling the domain**. Moving the database needs no DNS change at all —
`puffinquest.greenuplabs.com` keeps pointing at Render exactly as it does now.

---

## What has already been changed in the code

- `webapp/scripts/backup-db.js` — dumps every row of every table to one JSON
  file. Uses the `pg` driver the app already has, so no `pg_dump` install.
- `webapp/scripts/restore-db.js` — loads that file into any Postgres database.
- `webapp/scripts/check-db.js` — prints row counts and a few accounts, so you
  can confirm a database really holds your data.
- `webapp/src/db.js` — the connection pool now retires idle connections early,
  keeps TCP keepalive on, and logs idle-connection errors instead of crashing
  the server. Neon suspends its compute when nobody is using the site, and
  without this the first visitor afterwards could take the whole app down.
- `webapp/src/server.js` — retries the database connection at startup, so a
  cold Neon compute is not mistaken for a broken database.
- `render.yaml` — `DATABASE_URL` is no longer wired to a Render database. It is
  now a value you set by hand in the Render dashboard.

`backups/` is git-ignored on purpose. **Backup files contain password hashes
and users' photos. Never commit them and never put them anywhere public.**

---

## The migration, step by step

Total time is about 20 minutes. Steps 1 to 4 change nothing on the live site,
so you can stop at any point before step 5 with no harm done.

### 1. Create the Neon database

Sign up at [neon.tech](https://neon.tech) with GitHub or email, no card
needed. Create a project:

- **Name:** `puffin-quest`
- **Postgres version:** the default is fine
- **Region:** Singapore, or whichever is closest to your users

Neon then shows a connection string that looks like this. Copy it somewhere
safe, it contains the password:

```
postgresql://neondb_owner:PASSWORD@ep-something-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Use the **pooled** connection string if Neon offers you a choice. It has
`-pooler` in the hostname and handles a sleeping compute more gracefully.

### 2. Get the Render connection string

Render dashboard → **puffin-quest-db** → **Connect** → **External**. Copy the
external URL. The internal one only works from inside Render's network.

### 3. Back up the Render database

From the project folder on your computer:

```bash
cd webapp && npm install && node scripts/backup-db.js "PASTE_RENDER_EXTERNAL_URL"
```

It prints a row count per table and writes a file such as
`webapp/backups/puffin-quest-2026-09-09T10-31-00-000Z.json`. Check the counts
look plausible, note the file size, and upload a copy to Hostinger.

The file size is also your storage estimate. Neon's free tier gives 0.5 GB,
and quest photos live inside the database as thumbnails, so that number is
what limits how many photos the app can hold.

### 4. Load the backup into Neon

```bash
node scripts/restore-db.js backups/puffin-quest-<timestamp>.json "PASTE_NEON_URL" --yes
```

It creates the schema, clears the target, re-inserts every row with its
original id, and fast-forwards the id sequences so new sign-ups do not collide
with restored accounts. The `--yes` is required because it truncates the
target first.

Then confirm the data arrived:

```bash
node scripts/check-db.js "PASTE_NEON_URL"
```

The row counts should match what the backup printed, and you should recognise
the usernames.

### 5. Point the live site at Neon

This is the only step that touches the live site.

1. Commit and push the code changes in this repo, so Render picks up the new
   `render.yaml` and the connection-pool hardening.
2. Render dashboard → **puffin-quest** web service → **Environment**.
3. Set `DATABASE_URL` to the Neon connection string and save. Confirm
   `DATABASE_SSL` is still `true`.
4. Render redeploys automatically. If it does not, use **Manual Deploy → Deploy
   latest commit**.

If Render will not let you edit `DATABASE_URL` because the Blueprint still
owns it, sync the Blueprint first (**Blueprints → puffin-quest → Sync**) so it
picks up the `sync: false` change, then set the value.

### 6. Verify before deleting anything

- Open `https://puffinquest.greenuplabs.com/api/health`.
- Sign in as an existing account. Check the Puffin balance, the streak, and
  that profile journal photos still load.
- Complete one Daily Quest and confirm the balance goes up.
- Open a shared profile link, for example `/bird/linhphantastic`.
- Check the Render service logs for `Puffin Quest listening on port`.

### 7. Only then, retire the Render database

Once everything above passes, delete the free Render database from the Render
dashboard. Keep the backup file regardless.

---

## Things to know about the migration

- **Anything users do between step 3 and step 5 is lost.** Do the whole thing
  in one sitting, at a quiet hour.
- **Downtime is one redeploy**, a couple of minutes.
- **Logins survive.** Sessions are signed with `JWT_SECRET`, which is not
  changing, and the accounts keep their original ids.
- **Neon sleeps too.** Its free compute suspends after about five minutes idle
  and takes a moment to wake. Render's free web service already sleeps after
  fifteen minutes, so this adds little on top of what you have now.
- **Rolling back is easy** until step 7. Put the old Render URL back in
  `DATABASE_URL` and redeploy.

---

## Keeping backups after the move

Run this monthly, and always before any change to the database:

```bash
cd webapp && node scripts/backup-db.js "PASTE_NEON_URL"
```

Keep one copy locally and upload one to Hostinger.

---

## Restoring after a disaster

```bash
node scripts/restore-db.js backups/<file>.json "<new database url>" --yes
```

Then point `DATABASE_URL` at the new database and redeploy.

---

## If you would rather just pay Render instead

Render dashboard → **puffin-quest-db** → **Upgrade**, from $7 a month. The
90-day deletion stops applying, the connection string does not change, and no
code changes are needed. In that case, revert the `render.yaml` change back to
the `fromDatabase` block. Still take backups.
