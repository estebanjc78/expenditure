import type { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { normalizeMerchant } from "./classify.js";
import { assertMonth } from "./month.js";

/** Header names expected in row 1 of the first worksheet (case-insensitive). */
const FIXED_COLUMNS = { name: "nombre", amount: "monto", merchant: "comercio" } as const;

export interface FixedStatus {
  name: string;
  expected: number;
  paid: boolean;
  paidAmount?: number;
  /** Set to "amount" when a PSE payment was matched only by its amount (the payee is not in the notice). */
  matchedBy?: "amount";
}

interface FixedRow {
  name: string;
  amount: number;
  merchant: string | null;
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return cellText(v.result as ExcelJS.CellValue);
  if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("").trim();
  return String(v).trim();
}

function parseAmount(v: ExcelJS.CellValue): number | null {
  const raw = typeof v === "object" && v !== null && "result" in v ? (v.result as ExcelJS.CellValue) : v;
  const n = typeof raw === "number" ? raw : Number(cellText(raw));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function columnIndexes(header: ExcelJS.Row): Record<keyof typeof FIXED_COLUMNS, number> {
  const found = new Map<string, number>();
  header.eachCell((cell, col) => found.set(cellText(cell.value).toLowerCase(), col));
  const idx = {} as Record<keyof typeof FIXED_COLUMNS, number>;
  for (const key of ["name", "amount", "merchant"] as const) {
    const col = found.get(FIXED_COLUMNS[key]);
    if (col === undefined) throw new Error(`header row: missing column "${FIXED_COLUMNS[key]}"`);
    idx[key] = col;
  }
  return idx;
}

function parseRows(ws: ExcelJS.Worksheet): FixedRow[] {
  const idx = columnIndexes(ws.getRow(1));
  const rows: FixedRow[] = [];
  const seen = new Set<string>();
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(idx.name).value);
    const amountCell = row.getCell(idx.amount).value;
    const merchant = cellText(row.getCell(idx.merchant).value);
    if (!name && !cellText(amountCell) && !merchant) continue;
    if (!name) throw new Error(`row ${r}: ${FIXED_COLUMNS.name} is required`);
    const amount = parseAmount(amountCell);
    if (amount === null) throw new Error(`row ${r}: ${FIXED_COLUMNS.amount} must be a positive integer`);
    if (seen.has(name)) throw new Error(`row ${r}: duplicate ${FIXED_COLUMNS.name} "${name}"`);
    seen.add(name);
    rows.push({ name, amount, merchant: merchant || null });
  }
  return rows;
}

export async function importFixedExpenses(
  db: DatabaseSync,
  xlsxPath: string,
): Promise<{ imported: number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("workbook has no worksheets");
  const rows = parseRows(ws);
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM fixed_expenses");
    const insert = db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)");
    for (const r of rows) insert.run(r.name, r.amount, r.merchant);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { imported: rows.length };
}

function wordsOf(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Whole-word match, ignoring case and accents: the keyword's words must appear as a contiguous word
 * sequence in the merchant. Banks cut long merchant names ("Compania de medic"), so a keyword ending in
 * `*` also accepts a truncated last word ("compania de med*"). Ambiguity remains possible (a short
 * keyword may match unrelated merchants) and one payment may satisfy several fixed expenses.
 */
export function matchesKeyword(merchant: string, keyword: string): boolean {
  const prefixLast = keyword.trim().endsWith("*");
  const k = wordsOf(keyword);
  const m = wordsOf(merchant);
  if (!k.length) return false;
  const last = k.length - 1;
  for (let i = 0; i + k.length <= m.length; i += 1) {
    const head = k.slice(0, last).every((word, j) => m[i + j] === word);
    const tail = prefixLast ? m[i + last]!.startsWith(k[last]!) : m[i + last] === k[last];
    if (head && tail) return true;
  }
  return false;
}

/** PSE notices hide the payee, so those payments can only be matched to a fixed expense by amount. */
const PSE_PREFIX = "pse ";
const AMOUNT_TOLERANCE = 0.1;

interface Payment {
  readonly id: number;
  readonly merchant: string;
  readonly amount: number;
}

function isPse(p: Payment): boolean {
  return wordsOf(p.merchant).join(" ").startsWith(PSE_PREFIX);
}

function monthPayments(db: DatabaseSync, month: string): Payment[] {
  return (
    db
      .prepare("SELECT id, merchant, amount FROM movements WHERE kind = 'gasto' AND substr(date, 1, 7) = ?")
      .all(month) as { id: number; merchant: string; amount: number }[]
  ).map((p) => ({ id: Number(p.id), merchant: normalizeMerchant(p.merchant), amount: Number(p.amount) }));
}

/**
 * Pairs each fixed expense with what was paid in the month: first by merchant name, then, for the ones still
 * unpaid, by amount against unclaimed PSE payments (within 10%, closest first, each payment used once).
 */
function reconcile(db: DatabaseSync, month: string): { statuses: FixedStatus[]; claimed: Set<number> } {
  assertMonth(month);
  const fixed = db.prepare("SELECT name, amount, merchant FROM fixed_expenses ORDER BY id").all() as unknown as FixedRow[];
  const payments = monthPayments(db, month);
  const claimed = new Set<number>();
  const statuses: FixedStatus[] = fixed.map((f) => {
    const keyword = normalizeMerchant(f.merchant ?? "") || normalizeMerchant(f.name);
    const hits = payments.filter((p) => matchesKeyword(p.merchant, keyword));
    hits.forEach((p) => claimed.add(p.id));
    return hits.length
      ? { name: f.name, expected: f.amount, paid: true, paidAmount: hits.reduce((sum, p) => sum + p.amount, 0) }
      : { name: f.name, expected: f.amount, paid: false };
  });
  const candidates = payments.filter((p) => isPse(p) && !claimed.has(p.id));
  const unpaid = statuses
    .map((s, i) => ({ s, i }))
    .filter((x) => !x.s.paid)
    .sort((a, b) => b.s.expected - a.s.expected);
  for (const { s, i } of unpaid) {
    const close = candidates
      .filter((p) => !claimed.has(p.id) && Math.abs(p.amount - s.expected) <= s.expected * AMOUNT_TOLERANCE)
      .sort((a, b) => Math.abs(a.amount - s.expected) - Math.abs(b.amount - s.expected))[0];
    if (!close) continue;
    claimed.add(close.id);
    statuses[i] = { name: s.name, expected: s.expected, paid: true, paidAmount: close.amount, matchedBy: "amount" };
  }
  return { statuses, claimed };
}

export function pendingFixed(db: DatabaseSync, month: string): FixedStatus[] {
  return reconcile(db, month).statuses;
}

export interface UnlistedRecurring {
  readonly merchant: string;
  readonly category: "suscripcion" | "fijo";
  readonly count: number;
  readonly total: number;
}

/**
 * Subscription / fixed-category expenses of the month whose merchant matches no concept in the fixed-expenses
 * list: the recurring charges you are paying but not tracking. Grouped by merchant, biggest first.
 */
export function unlistedRecurring(db: DatabaseSync, month: string): UnlistedRecurring[] {
  const { claimed } = reconcile(db, month);
  const rows = db
    .prepare(
      `SELECT id, merchant, category, amount FROM movements
       WHERE kind = 'gasto' AND category IN ('suscripcion', 'fijo') AND substr(date, 1, 7) = ?`,
    )
    .all(month) as { id: number; merchant: string; category: "suscripcion" | "fijo"; amount: number }[];
  const groups = new Map<string, UnlistedRecurring>();
  for (const r of rows) {
    if (claimed.has(Number(r.id))) continue;
    const key = `${r.category}|${normalizeMerchant(r.merchant)}`;
    const prev = groups.get(key);
    groups.set(key, { merchant: prev?.merchant ?? r.merchant, category: r.category, count: (prev?.count ?? 0) + 1, total: (prev?.total ?? 0) + Number(r.amount) });
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
