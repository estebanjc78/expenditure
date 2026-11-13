import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { findMovements } from "../src/domain/find.js";
import { addMovement } from "../src/domain/movements.js";

function seed() {
  const db = openDb(":memory:");
  const add = (id: string, date: string, amount: number, merchant: string, extra: object = {}) =>
    addMovement(db, { sourceId: id, date, amount, merchant, bank: "bbva", kind: "gasto", ...extra });
  add("a", "2026-10-15", 9_000_000, "Transferencia a Propietario Ejemplo", { suggestedCategory: "transferencia" });
  add("b", "2026-09-17", 8_800_000, "Transferencia a Propietario Ejemplo");
  add("c", "2026-10-08", 327_300, "PSE · PAGOS ELECTRONI");
  add("d", "2026-10-30", 269_342, "Supertienda olimp");
  db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run("Alquiler", 9_000_000, "propietario");
  db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run("Acueducto", 330_000, "acueducto");
  return db;
}

describe("findMovements", () => {
  it("understands a concept from the fixed-expenses list and finds the payee, in the latest month with a match", () => {
    const r = findMovements(seed(), "alquiler");
    expect(r.month).toBe("2026-10");
    expect(r.matches.map((m) => m.amount)).toEqual([9_000_000]);
    expect(r.otherMonths).toEqual(["2026-09"]);
    expect(r.basis).toMatch(/Alquiler/);
  });

  it("matches a PSE payment to a fixed concept by amount, since the payee is hidden", () => {
    const r = findMovements(seed(), "acueducto");
    expect(r.matches.map((m) => m.merchant)).toEqual(["PSE · PAGOS ELECTRONI"]);
  });

  it("finds by amount, ignoring separators", () => {
    expect(findMovements(seed(), "$ 9.000.000").matches).toHaveLength(1);
    expect(findMovements(seed(), "269342").matches[0]!.merchant).toBe("Supertienda olimp");
  });

  it("finds by text in the merchant, ignoring accents and case", () => {
    expect(findMovements(seed(), "OLIMP").matches).toHaveLength(1);
    expect(findMovements(seed(), "propietario", { month: "2026-09" }).matches.map((m) => m.amount)).toEqual([8_800_000]);
  });

  it("finds by category name", () => {
    expect(findMovements(seed(), "transferencia").matches.map((m) => m.amount)).toEqual([9_000_000]);
  });

  it("returns an empty, well-formed result when nothing matches", () => {
    expect(findMovements(seed(), "zzz")).toMatchObject({ month: null, matches: [], otherMonths: [] });
    expect(findMovements(seed(), "   ").matches).toEqual([]);
  });

  it("rejects a malformed month", () => {
    expect(() => findMovements(seed(), "alquiler", { month: "oct" })).toThrow(/month/i);
  });
});
