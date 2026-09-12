/** Durable anonymous household sessions. Raw images live in the private document bucket. */
export const intakeSchemaSql = `CREATE TABLE IF NOT EXISTS intake_cases (
  session_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
