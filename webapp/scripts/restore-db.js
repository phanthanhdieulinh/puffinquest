"use strict";

/**
 * Puffin Quest — database restore.
 *
 * Loads a JSON file produced by scripts/backup-db.js into a Postgres database:
 * creates the schema if it is missing, clears the existing rows, re-inserts
 * every row with its original id, then fast-forwards the id sequences.
 *
 *   node scripts/restore-db.js backups/puffin-quest-....json "postgres://..."
 *
 * The target URL may also come from $TARGET_DATABASE_URL or $DATABASE_URL.
 * Refuses to run without --yes, because it replaces the target's contents.
 */

const fs = require("fs");
const { Pool, types } = require("pg");

types.setTypeParser(1082, (val) => val);

const TABLES = ["users", "submissions", "reviews", "cheers", "catch_log"];

function parseArgs(argv) {
  const args = {
    file: null,
    url: process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL,
    confirmed: false
  };
  for (const a of argv) {
    if (a === "--yes") args.confirmed = true;
    else if (a.startsWith("postgres://") || a.startsWith("postgresql://")) args.url = a;
    else if (!a.startsWith("--")) args.file = a;
  }
  return args;
}

async function main() {
  const { file, url, confirmed } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("Usage: node scripts/restore-db.js <backup.json> [postgres://...] --yes");
    process.exit(1);
  }
  if (!url) {
    console.error("No target database URL. Pass one, or set TARGET_DATABASE_URL.");
    process.exit(1);
  }
  if (!confirmed) {
    console.error("This DELETES all existing rows in the target database.");
    console.error("Re-run with --yes once you are sure the target is correct.");
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(file, "utf8"));
  if (dump.format !== "puffin-quest-backup") {
    console.error("That file is not a Puffin Quest backup.");
    process.exit(1);
  }
  console.log(`Restoring backup taken ${dump.takenAt} into ${url.replace(/:[^:@/]*@/, ":****@")}`);

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal || process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  // Reuse the app's own schema definition so the target matches production.
  process.env.DATABASE_URL = url;
  if (isLocal) process.env.DATABASE_SSL = "false";
  const { initSchema, pool: appPool } = require("../src/db");
  await initSchema();
  await appPool.end();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);

    for (const table of TABLES) {
      const rows = dump.tables[table] || [];
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
        await client.query(
          `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
          cols.map((c) => row[c])
        );
      }
      // Move the SERIAL sequence past the highest restored id.
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'),
                       GREATEST((SELECT COALESCE(MAX(id), 0) FROM ${table}), 1),
                       (SELECT COUNT(*) FROM ${table}) > 0)`,
        [table]
      );
      console.log(`  ${table.padEnd(12)} ${rows.length} rows`);
    }

    await client.query("COMMIT");
    console.log("\nRestore complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Restore failed:", err.message);
  process.exit(1);
});
