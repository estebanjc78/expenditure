import type { DatabaseSync } from "node:sqlite";
import type { Category } from "./types.js";

export function normalizeMerchant(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeBank(name: string): string {
  return name.trim().toLowerCase();
}

export function lookupCategory(db: DatabaseSync, merchant: string): Category | null {
  const row = db
    .prepare("SELECT category FROM merchant_rules WHERE merchant = ?")
    .get(normalizeMerchant(merchant)) as { category: Category } | undefined;
  return row?.category ?? null;
}

/**
 * Stores the merchant rule and reclassifies every gasto of that merchant
 * (the user explicitly decided the category), in one transaction.
 * Returns how many rows actually changed category.
 */
export function setMerchantRule(
  db: DatabaseSync,
  merchant: string,
  category: Category,
): { updated: number } {
  const key = normalizeMerchant(merchant);
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO merchant_rules (merchant, category) VALUES (?, ?)
       ON CONFLICT(merchant) DO UPDATE SET category = excluded.category`,
    ).run(key, category);
    const rows = db
      .prepare("SELECT id, merchant, category FROM movements WHERE kind = 'gasto'")
      .all() as { id: number; merchant: string; category: Category | null }[];
    const update = db.prepare("UPDATE movements SET category = ? WHERE id = ?");
    let updated = 0;
    for (const row of rows) {
      if (normalizeMerchant(row.merchant) === key && row.category !== category) {
        update.run(category, row.id);
        updated += 1;
      }
    }
    db.exec("COMMIT");
    return { updated };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
