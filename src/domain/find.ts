import type { DatabaseSync } from "node:sqlite";
import { normalizeMerchant } from "./classify.js";
import { matchesKeyword } from "./fixed.js";
import { assertMonth } from "./month.js";
import type { Category, Kind } from "./types.js";

const MAX_MATCHES = 30;
const FIXED_AMOUNT_TOLERANCE = 0.1;
const AMOUNT_TOLERANCE = 0.01;

export interface FoundMovement {
  readonly id: number;
  readonly date: string;
  readonly merchant: string;
  readonly amount: number;
  readonly kind: Kind;
  readonly category: Category | null;
}

export interface FindResult {
  /** Month (YYYY-MM) with the most recent match, or the requested one. */
  readonly month: string | null;
  readonly matches: readonly FoundMovement[];
  /** Other months that also have matches, newest first. */
  readonly otherMonths: readonly string[];
  /** How the query was understood, in words, for the assistant to explain. */
  readonly basis: string;
}

const fold = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function asAmount(query: string): number | null {
  if (!/^[\d.,$\s]+$/.test(query) || !/\d/.test(query)) return null;
  const n = Number(query.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Row extends FoundMovement {
  readonly merchantFolded: string;
}

/**
 * Finds the movements a person is talking about, in any month: by amount ("9.000.000"), by a concept of the
 * fixed-expenses list ("alquiler" finds its payee and amount), by text in the merchant, or by category name.
 */
export function findMovements(db: DatabaseSync, query: string, options: { month?: string } = {}): FindResult {
  const q = query.trim();
  if (options.month) assertMonth(options.month);
  if (!q) return { month: options.month ?? null, matches: [], otherMonths: [], basis: "consulta vacía" };

  const rows = (db.prepare("SELECT id, date, merchant, amount, kind, category FROM movements").all() as unknown as FoundMovement[]).map(
    (r) => ({ ...r, id: Number(r.id), amount: Number(r.amount), merchantFolded: fold(r.merchant) }),
  ) as Row[];

  const amount = asAmount(q);
  const fixed = db.prepare("SELECT name, amount, merchant FROM fixed_expenses").all() as unknown as { name: string; amount: number; merchant: string | null }[];
  const folded = fold(q);
  const concept = amount === null ? fixed.find((f) => fold(f.name).includes(folded) || folded.includes(fold(f.name))) : undefined;

  let basis: string;
  let test: (r: Row) => boolean;
  if (amount !== null) {
    basis = `monto cercano a ${amount}`;
    test = (r) => Math.abs(r.amount - amount) <= Math.max(1, amount * AMOUNT_TOLERANCE);
  } else if (concept) {
    const keyword = normalizeMerchant(concept.merchant ?? "") || normalizeMerchant(concept.name);
    basis = `concepto «${concept.name}» de tu lista de gastos fijos (comercio «${keyword}», monto ~${concept.amount})`;
    test = (r) =>
      matchesKeyword(normalizeMerchant(r.merchant), keyword) ||
      (/^pse\b/i.test(r.merchant) && Math.abs(r.amount - concept.amount) <= concept.amount * FIXED_AMOUNT_TOLERANCE);
  } else {
    basis = `texto «${q}» en el comercio o categoría con ese nombre`;
    test = (r) => r.merchantFolded.includes(folded) || (r.category !== null && fold(r.category) === folded);
  }

  const hits = rows.filter(test).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const month = options.month ?? hits[0]?.date.slice(0, 7) ?? null;
  const inMonth = month ? hits.filter((h) => h.date.startsWith(month)) : [];
  const others = [...new Set(hits.map((h) => h.date.slice(0, 7)).filter((m) => m !== month))];
  const matches = inMonth.slice(0, MAX_MATCHES).map(({ merchantFolded: _f, ...m }) => m);
  return { month, matches, otherMonths: others, basis };
}
