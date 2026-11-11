import type { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { normalizeMerchant } from "./classify.js";
import { assertMonth } from "./month.js";

/** Header names expected in row 1 of the first worksheet (case-insensitive). */
export const FIXED_COLUMNS = { name: "nombre", amount: "monto", merchant: "comercio" } as const;

export interface FixedStatus {
  name: string;
  expected: number;
  paid: boolean;
  paidAmount?: number;
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

/**
 * Whole-word match: the keyword's words must appear as a contiguous word sequence
 * in the merchant. Ambiguity remains possible (a short keyword may match unrelated
 * merchants) and one payment may satisfy several fixed expenses.
 */
function matchesKeyword(merchant: string, keyword: string): boolean {
  if (!keyword) return false;
  return ` ${merchant.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `.includes(
    ` ${keyword.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `,
  );
}

export function pendingFixed(db: DatabaseSync, month: string): FixedStatus[] {
  assertMonth(month);
  const fixed = db
    .prepare("SELECT name, amount, merchant FROM fixed_expenses ORDER BY id")
    .all() as unknown as FixedRow[];
  const payments = (
    db
      .prepare("SELECT merchant, amount FROM movements WHERE kind = 'gasto' AND substr(date, 1, 7) = ?")
      .all(month) as { merchant: string; amount: number }[]
  ).map((p) => ({ merchant: normalizeMerchant(p.merchant), amount: p.amount }));
  return fixed.map((f) => {
    const keyword = normalizeMerchant(f.merchant ?? "") || normalizeMerchant(f.name);
    const hits = payments.filter((p) => matchesKeyword(p.merchant, keyword));
    return hits.length
      ? { name: f.name, expected: f.amount, paid: true, paidAmount: hits.reduce((s, p) => s + p.amount, 0) }
      : { name: f.name, expected: f.amount, paid: false };
  });
}
