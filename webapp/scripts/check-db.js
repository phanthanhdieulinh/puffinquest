"use strict";

/**
 * Puffin Quest — database check.
 *
 * Connects to a database and prints how many rows each table holds, plus a few
 * sample usernames. Use it to confirm a migration landed before pointing the
 * live site at the new database.
 *
 *   node scripts/check-db.js "postgresql://...neon.tech/neondb?sslmode=require"
 */

const { Pool, types } = require("pg");

types.setTypeParser(1082, (val) => val);

const TABLES = ["users", "submissions", "reviews", "cheers", "catch_log"];

async function main() {
  const url = process.argv.slice(2).find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;
  if (!url) {
    console.error("No database URL. Pass one as an argument or set DATABASE_URL.");
    process.exit(1);
  }

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal || process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000
  });

  try {
    const { rows: version } = await pool.query("SELECT version()");
    console.log(version[0].version.split(",")[0]);
    console.log("");

    for (const table of TABLES) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      console.log(`  ${table.padEnd(12)} ${rows[0].n} rows`);
    }

    const { rows: people } = await pool.query(
      "SELECT username, balance, streak, total_quests_done FROM users ORDER BY id ASC LIMIT 10"
    );
    console.log("\nFirst few accounts:");
    for (const p of people) {
      console.log(`  ${p.username.padEnd(20)} ${p.balance} puffins, streak ${p.streak}, ${p.total_quests_done} quests`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});
