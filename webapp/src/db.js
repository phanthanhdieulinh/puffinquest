"use strict";

const { Pool, types } = require("pg");

// node-pg parses SQL DATE columns (OID 1082) into JS Date objects by
// default, but the app compares them with `!==` against plain "YYYY-MM-DD"
// strings (e.g. daily_date, cove_date rollover checks) — a Date object
// never strictly-equals a string, so those checks would always be true.
// Returning the raw string instead makes those comparisons correct.
types.setTypeParser(1082, (val) => val);

// OID 1009 = _text (text[])
types.setTypeParser(1009, (val) => {
  if (!val || val === "{}") return [];
  if (typeof val === "string" && val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return Array.isArray(val) ? val : [];
});

let pool;
if (process.env.USE_MOCK_DB === "true" || !process.env.DATABASE_URL || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost:5432") && process.env.NODE_ENV !== "production")) {
  try {
    const { newDb } = require("pg-mem");
    const memDb = newDb();
    const { Pool: MemPool } = memDb.adapters.createPg();
    pool = new MemPool();
    console.log("Using in-memory PostgreSQL database (pg-mem) for local preview.");
  } catch (e) {
    // fallback to normal pg Pool if pg-mem is not available
  }
}

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    // Serverless Postgres (Neon) suspends its compute after a few minutes of
    // inactivity and drops the sockets it was holding. Retiring idle clients
    // ourselves, sooner than the provider does, avoids handing a dead socket
    // to the next request.
    max: Number(process.env.DATABASE_POOL_MAX || 8),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
    keepAlive: true
  });

  // A pg Pool emits 'error' when an IDLE client dies (the provider suspended,
  // the network blipped). With no listener, Node treats that as unhandled and
  // kills the whole server. The pool discards the bad client on its own, so
  // logging is the correct response — the next query gets a fresh connection.
  pool.on("error", (err) => {
    console.error("Postgres idle client error (pool will reconnect):", err.message);
  });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  username_lower TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  avatar_photo TEXT,
  cover_photo TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  total_quests_done INTEGER NOT NULL DEFAULT 0,
  last_completion_date DATE,
  first_active_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_date DATE,
  daily_quest_ids TEXT[] NOT NULL DEFAULT '{}',
  daily_done_ids TEXT[] NOT NULL DEFAULT '{}',
  fun_done_ids TEXT[] NOT NULL DEFAULT '{}',
  cove_approved_today INTEGER NOT NULL DEFAULT 0,
  cove_date DATE,
  equipped_title TEXT,
  titles TEXT[] NOT NULL DEFAULT '{}',
  badges TEXT[] NOT NULL DEFAULT '{}',
  social_facebook BOOLEAN NOT NULL DEFAULT false,
  social_instagram BOOLEAN NOT NULL DEFAULT false,
  social_linkedin BOOLEAN NOT NULL DEFAULT false,
  week_key TEXT,
  week_claimed BOOLEAN NOT NULL DEFAULT false,
  month_key TEXT,
  month_claimed BOOLEAN NOT NULL DEFAULT false,
  season_key TEXT,
  season_claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id TEXT NOT NULL,
  is_daily BOOLEAN NOT NULL,
  title TEXT NOT NULL,
  icon TEXT NOT NULL,
  base_reward INTEGER NOT NULL,
  bonus_reward INTEGER NOT NULL DEFAULT 0,
  caption TEXT NOT NULL DEFAULT '',
  thumb TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approvals INTEGER NOT NULL DEFAULT 0,
  skips INTEGER NOT NULL DEFAULT 0,
  post_to_profile BOOLEAN NOT NULL DEFAULT true,
  proof_gps TEXT,
  media_type TEXT NOT NULL DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS cheers (
  id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  cheerer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(submission_id, cheerer_id)
);

CREATE TABLE IF NOT EXISTS catch_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  icon TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT NOT NULL,
  rarity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catch_log_user ON catch_log(user_id);

CREATE TABLE IF NOT EXISTS puffin_fights (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_random BOOLEAN NOT NULL DEFAULT false,
  stake INTEGER NOT NULL DEFAULT 10,
  quest_id TEXT NOT NULL,
  quest_title TEXT NOT NULL,
  quest_icon TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creator_done BOOLEAN NOT NULL DEFAULT false,
  opponent_done BOOLEAN NOT NULL DEFAULT false,
  creator_done_at TIMESTAMPTZ,
  opponent_done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_puffin_fights_creator ON puffin_fights(creator_id);
CREATE INDEX IF NOT EXISTS idx_puffin_fights_opponent ON puffin_fights(opponent_id);
`;

// ADD COLUMN IF NOT EXISTS so upgrades to an already-deployed database are safe.
const MIGRATIONS = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS puffin_growth INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS puffin_items TEXT[] NOT NULL DEFAULT '{}';`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_hat TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_clothes TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS equipped_shoes TEXT;`,
  `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS post_to_profile BOOLEAN NOT NULL DEFAULT true;`,
  `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS proof_gps TEXT;`,
  `ALTER TABLE submissions ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'image';`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freezes INTEGER NOT NULL DEFAULT 0;`
];

async function initSchema() {
  await pool.query(SCHEMA);
  for (const stmt of MIGRATIONS) {
    await pool.query(stmt);
  }
}

module.exports = { pool, initSchema };
