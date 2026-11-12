import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { addMovements, filterUnregistered } from "../src/domain/batch.js";

const mov = { date: "2026-10-05", amount: 50000, merchant: "Exito", bank: "bbva", kind: "gasto" as const };

describe("filterUnregistered", () => {
  it("excluye ids registrados, incluidos los de la forma id#n", () => {
    const db = openDb(":memory:");
    addMovement(db, { ...mov, sourceId: "m1" });
    addMovement(db, { ...mov, sourceId: "m2#1" });
    addMovement(db, { ...mov, sourceId: "m3x" });
    expect(filterUnregistered(db, ["m1", "m2", "m3", "m4"])).toEqual(["m3", "m4"]);
  });

  it("mantiene el orden, quita duplicados y acepta vacío", () => {
    const db = openDb(":memory:");
    expect(filterUnregistered(db, ["z", "a", "z", "a", "b"])).toEqual(["z", "a", "b"]);
    expect(filterUnregistered(db, [])).toEqual([]);
  });

  it("no trata % ni _ como comodines", () => {
    const db = openDb(":memory:");
    addMovement(db, { ...mov, sourceId: "abc#1" });
    expect(filterUnregistered(db, ["%", "a_c", "ab_"])).toEqual(["%", "a_c", "ab_"]);
  });
});

describe("addMovements", () => {
  it("registra 3 válidos", () => {
    const db = openDb(":memory:");
    const r = addMovements(db, [
      { ...mov, sourceId: "a" },
      { ...mov, sourceId: "b" },
      { ...mov, sourceId: "c" },
    ]);
    expect(r.summary).toEqual({ registered: 3, duplicates: 0, failed: 0 });
    expect(r.results.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it("un monto inválido falla solo ese ítem", () => {
    const db = openDb(":memory:");
    const r = addMovements(db, [{ ...mov, sourceId: "a" }, { ...mov, amount: -1 }, { ...mov, sourceId: "c" }]);
    expect(r.summary).toEqual({ registered: 2, duplicates: 0, failed: 1 });
    expect(r.results[1]!.error).toMatch(/amount/);
    expect(r.results[2]!.id).toBeTypeOf("number");
  });

  it("mismo sourceId dos veces: el segundo es duplicado", () => {
    const db = openDb(":memory:");
    const r = addMovements(db, [{ ...mov, sourceId: "a" }, { ...mov, sourceId: "a" }]);
    expect(r.summary).toEqual({ registered: 1, duplicates: 1, failed: 0 });
    expect(r.results[1]).toMatchObject({ index: 1, duplicate: true });
  });

  it("más de 100 ítems lanza", () => {
    const db = openDb(":memory:");
    expect(() => addMovements(db, Array.from({ length: 101 }, () => mov))).toThrow(/max 100/);
  });

  it("reporta needsClassification por ítem", () => {
    const db = openDb(":memory:");
    const r = addMovements(db, [mov, { ...mov, category: "otro" }]);
    expect(r.results[0]!.needsClassification).toBe(true);
    expect(r.results[1]!.needsClassification).toBe(false);
  });

  it("no muta las entradas", () => {
    const db = openDb(":memory:");
    const input = { ...mov, bank: "BBVA" };
    const copy = structuredClone(input);
    addMovements(db, [input]);
    expect(input).toEqual(copy);
  });
});
