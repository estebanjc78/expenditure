import type { DatabaseSync } from "node:sqlite";
import { monthStatus } from "./budget.js";
import { normalizeBank } from "./classify.js";
import { assertMonth, shiftMonth } from "./month.js";
import type { Category, Kind } from "./types.js";

const MAX_MOVEMENTS = 1000;
const TOP_MERCHANTS = 8;

export type DashboardCategoryKey = Category | "sin_categoria";

export interface DashboardCategory {
  readonly category: DashboardCategoryKey;
  readonly spent: number;
  readonly prevSpent: number;
  readonly count: number;
  readonly budget: number | null;
  readonly percent: number | null;
  readonly alert: boolean;
}

export interface DashboardMovement {
  readonly id: number;
  readonly date: string;
  readonly merchant: string;
  readonly bank: string;
  readonly kind: Kind;
  readonly amount: number;
  readonly category: Category | null;
}

export interface DashboardData {
  readonly month: string;
  readonly prevMonth: string;
  /** Colombian local date, so the client knows how far the current month has gone. */
  readonly today: string;
  readonly banks: readonly string[];
  readonly totals: {
    readonly spent: number;
    readonly prevSpent: number;
    readonly income: number;
    readonly prevIncome: number;
    readonly uncategorized: { readonly amount: number; readonly count: number };
  };
  readonly categories: readonly DashboardCategory[];
  readonly daily: readonly { date: string; total: number; count: number }[];
  readonly prevDaily: readonly { day: number; total: number }[];
  readonly topMerchants: readonly { merchant: string; total: number; count: number }[];
  readonly movements: readonly DashboardMovement[];
  readonly movementsTruncated: boolean;
}

export interface DashboardOptions {
  readonly today: string;
  readonly bank?: string;
}

interface Scope {
  readonly from: string;
  readonly to: string;
  readonly bank: string | null;
}

const monthScope = (month: string, bank: string | null): Scope => ({
  from: `${month}-01`,
  to: `${shiftMonth(month, 1)}-01`,
  bank,
});

/** SQL fragment + parameters that restrict a query to a month (and optionally a bank). */
function where(scope: Scope, kind?: Kind): { sql: string; params: (string | null)[] } {
  const parts = ["date >= ?", "date < ?", "(? IS NULL OR bank = ?)"];
  const params: (string | null)[] = [scope.from, scope.to, scope.bank, scope.bank];
  if (kind) {
    parts.push("kind = ?");
    params.push(kind);
  }
  return { sql: parts.join(" AND "), params };
}

function total(db: DatabaseSync, scope: Scope, kind: Kind): number {
  const w = where(scope, kind);
  const row = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM movements WHERE ${w.sql}`).get(...w.params) as { total: number };
  return Number(row.total);
}

function spentByCategory(db: DatabaseSync, scope: Scope): Map<DashboardCategoryKey, { total: number; count: number }> {
  const w = where(scope, "gasto");
  const rows = db
    .prepare(
      `SELECT COALESCE(category, 'sin_categoria') AS category, SUM(amount) AS total, COUNT(*) AS count
       FROM movements WHERE ${w.sql} GROUP BY COALESCE(category, 'sin_categoria')`,
    )
    .all(...w.params) as { category: DashboardCategoryKey; total: number; count: number }[];
  return new Map(rows.map((r) => [r.category, { total: Number(r.total), count: Number(r.count) }]));
}

function categories(db: DatabaseSync, month: string, scope: Scope, prev: Scope): DashboardCategory[] {
  const now = spentByCategory(db, scope);
  const before = spentByCategory(db, prev);
  const budgets = new Map(monthStatus(db, month, scope.bank ?? undefined).map((s) => [s.category, s]));
  const keys: DashboardCategoryKey[] = ["supermercado", "suscripcion", "fijo", "otro", "sin_categoria"];
  return keys.map((category) => {
    const status = category === "sin_categoria" ? undefined : budgets.get(category);
    return {
      category,
      spent: now.get(category)?.total ?? 0,
      prevSpent: before.get(category)?.total ?? 0,
      count: now.get(category)?.count ?? 0,
      budget: status?.budget ?? null,
      percent: status?.percent ?? null,
      alert: status?.alert ?? false,
    };
  });
}

function daily(db: DatabaseSync, scope: Scope): { date: string; total: number; count: number }[] {
  const w = where(scope, "gasto");
  const rows = db
    .prepare(`SELECT date, SUM(amount) AS total, COUNT(*) AS count FROM movements WHERE ${w.sql} GROUP BY date ORDER BY date`)
    .all(...w.params) as { date: string; total: number; count: number }[];
  return rows.map((r) => ({ date: r.date, total: Number(r.total), count: Number(r.count) }));
}

function topMerchants(db: DatabaseSync, scope: Scope): { merchant: string; total: number; count: number }[] {
  const w = where(scope, "gasto");
  const rows = db
    .prepare(
      `SELECT MIN(merchant) AS merchant, SUM(amount) AS total, COUNT(*) AS count FROM movements WHERE ${w.sql}
       GROUP BY lower(trim(merchant)) ORDER BY total DESC, merchant LIMIT ${TOP_MERCHANTS}`,
    )
    .all(...w.params) as { merchant: string; total: number; count: number }[];
  return rows.map((r) => ({ merchant: r.merchant, total: Number(r.total), count: Number(r.count) }));
}

function movements(db: DatabaseSync, scope: Scope): { rows: DashboardMovement[]; truncated: boolean } {
  const w = where(scope);
  const rows = db
    .prepare(
      `SELECT id, date, merchant, bank, kind, amount, category FROM movements WHERE ${w.sql}
       ORDER BY date DESC, id DESC LIMIT ${MAX_MOVEMENTS + 1}`,
    )
    .all(...w.params) as unknown as DashboardMovement[];
  const shown = rows.slice(0, MAX_MOVEMENTS).map((r) => ({ ...r, id: Number(r.id), amount: Number(r.amount) }));
  return { rows: shown, truncated: rows.length > MAX_MOVEMENTS };
}

/** Everything the panel shows for one month, in a single read-only snapshot. */
export function dashboardData(db: DatabaseSync, month: string, options: DashboardOptions): DashboardData {
  assertMonth(month);
  const bank = options.bank ? normalizeBank(options.bank) : null;
  const prevMonth = shiftMonth(month, -1);
  const scope = monthScope(month, bank);
  const prev = monthScope(prevMonth, bank);
  const cats = categories(db, month, scope, prev);
  const sin = cats.find((c) => c.category === "sin_categoria")!;
  const list = movements(db, scope);
  const banks = (db.prepare("SELECT DISTINCT bank FROM movements ORDER BY bank").all() as { bank: string }[]).map((r) => r.bank);

  return {
    month,
    prevMonth,
    today: options.today,
    banks,
    totals: {
      spent: total(db, scope, "gasto"),
      prevSpent: total(db, prev, "gasto"),
      income: total(db, scope, "ingreso"),
      prevIncome: total(db, prev, "ingreso"),
      uncategorized: { amount: sin.spent, count: sin.count },
    },
    categories: cats,
    daily: daily(db, scope),
    prevDaily: daily(db, prev).map((d) => ({ day: Number(d.date.slice(8, 10)), total: d.total })),
    topMerchants: topMerchants(db, scope),
    movements: list.rows,
    movementsTruncated: list.truncated,
  };
}

/** Months (YYYY-MM) that have at least one movement, oldest first. */
export function listMonths(db: DatabaseSync): string[] {
  const rows = db.prepare("SELECT DISTINCT substr(date, 1, 7) AS month FROM movements ORDER BY month").all() as { month: string }[];
  return rows.map((r) => r.month);
}
