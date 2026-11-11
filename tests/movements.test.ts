import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";

const base = {
  date: "2026-11-10",
  amount: 45000,
  merchant: "Exito",
  bank: "bancolombia",
  kind: "gasto" as const,
};

describe("addMovement", () => {
  it("guarda un gasto y lo devuelve con id", () => {
    const db = openDb(":memory:");
    const r = addMovement(db, { ...base, sourceId: "a1" });
    expect(r).toMatchObject({ id: 1, duplicate: false });
    const row = db.prepare("SELECT * FROM movements WHERE id = ?").get(1);
    expect(row).toMatchObject({ source_id: "a1", amount: 45000, merchant: "Exito" });
  });

  it("el mismo sourceId dos veces devuelve duplicate:true y no inserta", () => {
    const db = openDb(":memory:");
    const first = addMovement(db, { ...base, sourceId: "a1" });
    const second = addMovement(db, { ...base, sourceId: "a1" });
    expect(second).toMatchObject({ id: first.id, duplicate: true });
    const n = db.prepare("SELECT COUNT(*) AS n FROM movements").get() as { n: number };
    expect(n.n).toBe(1);
  });

  it.each([0, -5, 12.5, NaN])("rechaza monto %s nombrando el campo amount", (amount) => {
    const db = openDb(":memory:");
    expect(() => addMovement(db, { ...base, amount })).toThrow(/amount/);
  });

  it("rechaza fecha que no es YYYY-MM-DD", () => {
    const db = openDb(":memory:");
    expect(() => addMovement(db, { ...base, date: "10/11/2026" })).toThrow(/date/);
  });

  it("acepta movimiento sin sourceId (efectivo manual) varias veces", () => {
    const db = openDb(":memory:");
    const a = addMovement(db, base);
    const b = addMovement(db, base);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(b.id).not.toBe(a.id);
  });
});
