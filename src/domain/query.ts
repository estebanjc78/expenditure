import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { buildTree, UNCLASSIFIED, type GroupNode } from "./query-tree.js";
import type { Movement } from "./types.js";

export type { GroupNode } from "./query-tree.js";

function isRealCalendarDate(d: string): boolean {
  const t = new Date(`${d}T00:00:00Z`).getTime();
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "must be a real calendar date");

const DIMENSIONS = ["category", "bank", "merchant", "day", "month"] as const;

export const querySchema = z.object({
  filters: z.object({
    from: dateField.optional(),
    to: dateField.optional(),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM").optional(),
    category: z.enum(["supermercado", "suscripcion", "fijo", "otro", UNCLASSIFIED]).optional(),
    bank: z.string().min(1).optional(),
    merchant: z.string().min(1).optional(),
    kind: z.enum(["gasto", "ingreso", "transferencia_propia"]).optional(),
    minAmount: z.number().int().optional(),
    maxAmount: z.number().int().optional(),
    text: z.string().min(1).optional(),
  }),
  groupBy: z
    .array(z.enum(DIMENSIONS))
    .refine((a) => new Set(a).size === a.length, "groupBy must not repeat dimensions"),
  includeMovements: z.boolean().optional(),
});

export type Query = z.input<typeof querySchema>;

export interface QueryResult {
  groups: GroupNode[];
  totals: { gasto: number; ingreso: number; transferenciaPropia: number };
}

type Filters = z.output<typeof querySchema>["filters"];

interface Where {
  sql: string;
  params: SQLInputValue[];
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function buildWhere(f: Filters, includeKind: boolean): Where {
  const clauses: string[] = [];
  const params: SQLInputValue[] = [];
  const add = (clause: string, ...values: SQLInputValue[]) => {
    clauses.push(clause);
    params.push(...values);
  };
  if (f.month) add("date >= ? AND date <= ?", `${f.month}-01`, `${f.month}-31`);
  if (f.from) add("date >= ?", f.from);
  if (f.to) add("date <= ?", f.to);
  if (f.category === UNCLASSIFIED) clauses.push("category IS NULL");
  else if (f.category) add("category = ?", f.category);
  if (f.bank) add("bank = ? COLLATE NOCASE", f.bank);
  if (f.merchant) add("merchant = ? COLLATE NOCASE", f.merchant);
  if (includeKind && f.kind) add("kind = ?", f.kind);
  if (f.minAmount !== undefined) add("amount >= ?", f.minAmount);
  if (f.maxAmount !== undefined) add("amount <= ?", f.maxAmount);
  if (f.text) add("merchant LIKE ? ESCAPE '\\'", `%${escapeLike(f.text)}%`);
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

interface Row {
  id: number;
  source_id: string | null;
  date: string;
  amount: number;
  merchant: string;
  bank: string;
  kind: Movement["kind"];
  category: Movement["category"];
}

function toMovement(r: Row): Movement {
  return {
    id: r.id,
    sourceId: r.source_id,
    date: r.date,
    amount: r.amount,
    merchant: r.merchant,
    bank: r.bank,
    kind: r.kind,
    category: r.category,
  };
}

function loadTotals(db: DatabaseSync, f: Filters): QueryResult["totals"] {
  const w = buildWhere(f, false);
  const rows = db
    .prepare(`SELECT kind, SUM(amount) AS total FROM movements ${w.sql} GROUP BY kind`)
    .all(...w.params) as { kind: string; total: number }[];
  const by = new Map(rows.map((r) => [r.kind, Number(r.total)]));
  return {
    gasto: by.get("gasto") ?? 0,
    ingreso: by.get("ingreso") ?? 0,
    transferenciaPropia: by.get("transferencia_propia") ?? 0,
  };
}

export function queryMovements(db: DatabaseSync, q: Query): QueryResult {
  const parsed = querySchema.safeParse(q);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid query: ${detail}`);
  }
  const { filters, groupBy, includeMovements } = parsed.data;
  // Only gasto counts toward groups unless the caller explicitly asks for another kind.
  const effective: Filters = { ...filters, kind: filters.kind ?? "gasto" };
  const w = buildWhere(effective, true);
  const rows = db
    .prepare(`SELECT * FROM movements ${w.sql} ORDER BY date, id`)
    .all(...w.params) as unknown as Row[];
  return {
    groups: buildTree(rows.map(toMovement), groupBy, includeMovements ?? false),
    totals: loadTotals(db, filters),
  };
}
