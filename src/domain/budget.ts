import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { queryMovements } from "./query.js";
import { MONTH_RE, assertMonth } from "./month.js";
import { CATEGORIES } from "./types.js";
import type { Category } from "./types.js";

export { CATEGORIES };
const DEFAULT_MONTH = "default";
const ALERT_THRESHOLD_PERCENT = 80;

export interface CategoryStatus {
  category: Category;
  budget: number | null;
  spent: number;
  remaining: number | null;
  percent: number | null;
  alert: boolean;
}

const budgetSchema = z.object({
  category: z.enum(CATEGORIES),
  month: z.union([z.literal(DEFAULT_MONTH), z.string().regex(MONTH_RE, "month must be YYYY-MM or 'default'")]),
  amount: z.number().int("amount must be an integer").positive("amount must be positive"),
});

function fail(prefix: string, error: z.ZodError): never {
  const detail = error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
  throw new Error(`${prefix}: ${detail}`);
}

export function setBudget(db: DatabaseSync, category: Category, month: string, amount: number): void {
  const parsed = budgetSchema.safeParse({ category, month, amount });
  if (!parsed.success) fail("Invalid budget", parsed.error);
  db.prepare(
    `INSERT INTO budgets (category, month, amount) VALUES (?, ?, ?)
     ON CONFLICT(category, month) DO UPDATE SET amount = excluded.amount`,
  ).run(parsed.data.category, parsed.data.month, parsed.data.amount);
}

function budgetFor(db: DatabaseSync, category: Category, month: string): number | null {
  const row = db
    .prepare(
      `SELECT amount FROM budgets WHERE category = ? AND month IN (?, ?)
       ORDER BY (month = ?) DESC LIMIT 1`,
    )
    .get(category, month, DEFAULT_MONTH, month) as { amount: number } | undefined;
  return row ? Number(row.amount) : null;
}

function buildStatus(category: Category, budget: number | null, spent: number): CategoryStatus {
  if (budget === null) {
    return { category, budget: null, spent, remaining: null, percent: null, alert: false };
  }
  // Integer comparison avoids float rounding at the 80% boundary.
  const alert = spent * 100 >= budget * ALERT_THRESHOLD_PERCENT;
  return {
    category,
    budget,
    spent,
    remaining: budget - spent,
    percent: Math.floor((spent * 100) / budget),
    alert,
  };
}

export function monthStatus(db: DatabaseSync, month: string, bank?: string): CategoryStatus[] {
  assertMonth(month);
  const { groups } = queryMovements(db, {
    filters: { month, ...(bank ? { bank } : {}) },
    groupBy: ["category"],
  });
  const spentBy = new Map(groups.map((g) => [g.key, g.total]));
  return CATEGORIES.map((c) => buildStatus(c, budgetFor(db, c, month), spentBy.get(c) ?? 0));
}
