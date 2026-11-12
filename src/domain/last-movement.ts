import type { DatabaseSync } from "node:sqlite";

export interface BankLastDate {
  bank: string;
  lastDate: string;
}

export function lastMovementByBank(db: DatabaseSync): BankLastDate[] {
  const rows = db
    .prepare("SELECT bank, MAX(date) AS lastDate FROM movements GROUP BY bank ORDER BY bank")
    .all() as { bank: string; lastDate: string }[];
  return rows.map((r) => ({ bank: r.bank, lastDate: r.lastDate }));
}
