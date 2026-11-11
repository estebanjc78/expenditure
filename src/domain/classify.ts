import type { DatabaseSync } from "node:sqlite";
import type { Category } from "./types.js";

export function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function lookupCategory(db: DatabaseSync, merchant: string): Category | null {
  const row = db
    .prepare("SELECT category FROM merchant_rules WHERE merchant = ?")
    .get(normalizeMerchant(merchant)) as { category: Category } | undefined;
  return row?.category ?? null;
}

export function setMerchantRule(
  db: DatabaseSync,
  merchant: string,
  category: Category,
): { updated: number } {
  const key = normalizeMerchant(merchant);
  db.prepare(
    `INSERT INTO merchant_rules (merchant, category) VALUES (?, ?)
     ON CONFLICT(merchant) DO UPDATE SET category = excluded.category`,
  ).run(key, category);
  const pending = db
    .prepare("SELECT id, merchant FROM movements WHERE category IS NULL")
    .all() as { id: number; merchant: string }[];
  const update = db.prepare("UPDATE movements SET category = ? WHERE id = ?");
  let updated = 0;
  for (const row of pending) {
    if (normalizeMerchant(row.merchant) === key) {
      update.run(category, row.id);
      updated += 1;
    }
  }
  return { updated };
}
