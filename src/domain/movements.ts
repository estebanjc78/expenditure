import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { lookupCategory, normalizeBank } from "./classify.js";
import { CATEGORIES } from "./types.js";
import type { MovementInput } from "./types.js";

function isRealCalendarDate(d: string): boolean {
  const t = new Date(`${d}T00:00:00Z`).getTime();
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}

export const movementInputSchema = z.object({
  sourceId: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .refine(
      isRealCalendarDate,
      "date must be a real calendar date",
    ),
  amount: z
    .number({ error: "amount must be a number" })
    .int("amount must be an integer (COP)")
    .positive("amount must be greater than 0"),
  merchant: z.string().min(1, "merchant is required"),
  bank: z.string().min(1, "bank is required"),
  kind: z.enum(["gasto", "ingreso", "transferencia_propia"]),
  category: z.enum(CATEGORIES).optional(),
  suggestedCategory: z.enum(CATEGORIES).optional(),
});

function parseInput(input: MovementInput): MovementInput {
  const result = movementInputSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid movement: ${detail}`);
  }
  return result.data;
}

export function addMovement(
  db: DatabaseSync,
  input: MovementInput,
): { id: number; duplicate: boolean; needsClassification: boolean } {
  const m = parseInput(input);
  // Only gastos are classified; ingreso/transferencia_propia keep an explicit category or null.
  const category = m.category ?? (m.kind === "gasto" ? lookupCategory(db, m.merchant) ?? m.suggestedCategory ?? null : null);
  const res = db
    .prepare(
      `INSERT INTO movements (source_id, date, amount, merchant, bank, kind, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id) DO NOTHING`,
    )
    .run(m.sourceId ?? null, m.date, m.amount, m.merchant, normalizeBank(m.bank), m.kind, category);
  if (Number(res.changes) > 0) {
    return { id: Number(res.lastInsertRowid), duplicate: false, needsClassification: m.kind === "gasto" && category === null };
  }
  if (m.sourceId === undefined) {
    throw new Error("Insert into movements affected no rows without a sourceId");
  }
  const existing = db
    .prepare("SELECT id FROM movements WHERE source_id = ?")
    .get(m.sourceId) as { id: number } | undefined;
  if (!existing) {
    throw new Error(`Movement with sourceId ${m.sourceId} not found after conflict`);
  }
  return { id: existing.id, duplicate: true, needsClassification: false };
}
