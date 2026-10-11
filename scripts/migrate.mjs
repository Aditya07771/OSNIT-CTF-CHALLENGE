// One-shot migration: applies supabase/schema.sql to your Supabase database.
//
// Usage:
//   1. Add your database connection string to .env.local (or .env):
//        SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres
//      Find it in Supabase: Project Settings -> Database -> Connection string -> URI.
//   2. Run:  npm run db:migrate
//
// The connection string stays in your local .env file; it is never committed
// and never sent to the browser.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no extra dependency): first value wins, .env.local over .env.
function loadEnv() {
  for (const file of [".env", ".env.local"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadEnv();

const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error(
    "Missing SUPABASE_DB_URL.\n" +
      "Add it to .env.local, e.g.\n" +
      "  SUPABASE_DB_URL=postgresql://postgres.<ref>:<password>@<host>:5432/postgres\n" +
      "Find it in Supabase -> Project Settings -> Database -> Connection string -> URI."
  );
  process.exit(1);
}

const sql = fs.readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying supabase/schema.sql ...");
  const result = await client.query(sql);
  const rows = Array.isArray(result) ? result[result.length - 1]?.rows : [];
  console.log("Schema applied successfully.");
  if (rows?.length) {
    console.table(rows);
  }
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
