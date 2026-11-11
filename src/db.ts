import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY,
  source_id TEXT UNIQUE,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  merchant TEXT NOT NULL,
  bank TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT
);
CREATE INDEX IF NOT EXISTS idx_movements_date ON movements(date);
CREATE TABLE IF NOT EXISTS merchant_rules (
  merchant TEXT PRIMARY KEY,
  category TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS budgets (
  category TEXT PRIMARY KEY,
  monthly_amount INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  merchant TEXT
);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}
