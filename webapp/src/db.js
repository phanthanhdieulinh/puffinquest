"use strict";

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
});

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
`;

// ADD COLUMN IF NOT EXISTS so upgrades to an already-deployed database are safe.
const MIGRATIONS = [`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;`];

async function initSchema() {
  await pool.query(SCHEMA);
  for (const stmt of MIGRATIONS) {
    await pool.query(stmt);
  }
}

module.exports = { pool, initSchema };
