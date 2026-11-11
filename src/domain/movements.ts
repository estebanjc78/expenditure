import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { MovementInput } from "./types.js";

export const movementInputSchema = z.object({
  sourceId: z.string().min(1).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "date must be a real date"),
  amount: z
    .number({ error: "amount must be a number" })
    .int("amount must be an integer (COP)")
    .positive("amount must be greater than 0"),
  merchant: z.string().min(1, "merchant is required"),
  bank: z.string().min(1, "bank is required"),
  kind: z.enum(["gasto", "ingreso", "transferencia_propia"]),
  category: z.enum(["supermercado", "suscripcion", "fijo", "otro"]).optional(),
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
): { id: number; duplicate: boolean } {
  const m = parseInput(input);
  const res = db
    .prepare(
      `INSERT INTO movements (source_id, date, amount, merchant, bank, kind, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id) DO NOTHING`,
    )
    .run(m.sourceId ?? null, m.date, m.amount, m.merchant, m.bank, m.kind, m.category ?? null);
  if (Number(res.changes) > 0) {
    return { id: Number(res.lastInsertRowid), duplicate: false };
  }
  const existing = db
    .prepare("SELECT id FROM movements WHERE source_id = ?")
    .get(m.sourceId) as { id: number };
  return { id: existing.id, duplicate: true };
}
