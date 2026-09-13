"use strict";

/**
 * Puffin Quest — database backup.
 *
 * Reads every row of every application table out of a Postgres database and
 * writes them to a single timestamped JSON file. Uses the `pg` driver that the
 * app already depends on, so it needs no `pg_dump` / psql install and runs the
 * same on Windows, macOS and Linux.
 *
 *   node scripts/backup-db.js                     # uses $DATABASE_URL
 *   node scripts/backup-db.js "postgres://..."    # or an explicit URL
 *   node scripts/backup-db.js --out backups       # choose the output folder
 */

const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");

// Keep DATE columns as plain "YYYY-MM-DD" strings, matching the app (src/db.js).
types.setTypeParser(1082, (val) => val);

// Order matters on restore: parents before children (foreign keys).
const TABLES = ["users", "submissions", "reviews", "cheers", "catch_log"];

function parseArgs(argv) {
  const args = { url: process.env.DATABASE_URL, outDir: "backups" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") {
      args.outDir = argv[i + 1];
      i += 1;
    } else if (!a.startsWith("--")) {
      args.url = a;
    }
  }
  return args;
}

async function main() {
  const { url, outDir } = parseArgs(process.argv.slice(2));
  if (!url) {
    console.error("No database URL. Pass one as an argument or set DATABASE_URL.");
    process.exit(1);
  }

  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl: isLocal || process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
  });

  const dump = {
    format: "puffin-quest-backup",
    version: 1,
    takenAt: new Date().toISOString(),
    tables: {}
  };

  try {
    for (const table of TABLES) {
      const { rows } = await pool.query(`SELECT * FROM ${table} ORDER BY id ASC`);
      dump.tables[table] = rows;
      console.log(`  ${table.padEnd(12)} ${rows.length} rows`);
    }
  } finally {
    await pool.end();
  }

  fs.mkdirSync(outDir, { recursive: true });
  const stamp = dump.takenAt.replace(/[:.]/g, "-");
  const file = path.join(outDir, `puffin-quest-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(dump, null, 2), "utf8");

  const mb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
  console.log(`\nBackup written: ${file} (${mb} MB)`);
}

main().catch((err) => {
  console.error("Backup failed:", err.message);
  process.exit(1);
});
