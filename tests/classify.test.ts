import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { setMerchantRule, normalizeMerchant } from "../src/domain/classify.js";

const base = {
  date: "2026-11-10",
  amount: 45000,
  merchant: "Exito",
  bank: "bancolombia",
  kind: "gasto" as const,
};

const categoryOf = (db: ReturnType<typeof openDb>, id: number) =>
  (db.prepare("SELECT category FROM movements WHERE id = ?").get(id) as { category: string | null })
    .category;

describe("clasificación de comercios", () => {
  it("normalizeMerchant recorta, pasa a minúsculas y colapsa espacios", () => {
    expect(normalizeMerchant("  EXITO   Express ")).toBe("exito express");
  });

  it("con regla existente el movimiento entra clasificado", () => {
    const db = openDb(":memory:");
    setMerchantRule(db, "Exito", "supermercado");
    const r = addMovement(db, { ...base, sourceId: "a1" });
    expect(r.needsClassification).toBe(false);
    expect(categoryOf(db, r.id)).toBe("supermercado");
  });

  it("comercio desconocido entra con category null y needsClassification true", () => {
    const db = openDb(":memory:");
    const r = addMovement(db, { ...base, sourceId: "a1" });
    expect(r.needsClassification).toBe(true);
    expect(categoryOf(db, r.id)).toBeNull();
  });

  it("setMerchantRule reclasifica movimientos previos y devuelve updated", () => {
    const db = openDb(":memory:");
    const a = addMovement(db, { ...base, sourceId: "a1" });
    const b = addMovement(db, { ...base, sourceId: "a2", merchant: "EXITO " });
    addMovement(db, { ...base, sourceId: "a3", merchant: "Netflix" });
    expect(setMerchantRule(db, "exito", "supermercado")).toEqual({ updated: 2 });
    expect(categoryOf(db, a.id)).toBe("supermercado");
    expect(categoryOf(db, b.id)).toBe("supermercado");
  });

  it("setMerchantRule reclasifica también gastos ya clasificados del comercio", () => {
    const db = openDb(":memory:");
    const a = addMovement(db, { ...base, sourceId: "a1", category: "otro" });
    const b = addMovement(db, { ...base, sourceId: "a2", category: "supermercado" });
    expect(setMerchantRule(db, "Exito", "supermercado")).toEqual({ updated: 1 });
    expect(categoryOf(db, a.id)).toBe("supermercado");
    expect(categoryOf(db, b.id)).toBe("supermercado");
  });

  it("ingreso y transferencia_propia no piden clasificación y quedan sin categoría", () => {
    const db = openDb(":memory:");
    const i = addMovement(db, { ...base, sourceId: "i1", kind: "ingreso" });
    const t = addMovement(db, { ...base, sourceId: "t1", kind: "transferencia_propia" });
    expect(i.needsClassification).toBe(false);
    expect(t.needsClassification).toBe(false);
    expect(categoryOf(db, i.id)).toBeNull();
    expect(categoryOf(db, t.id)).toBeNull();
  });

  it("setMerchantRule nunca reclasifica filas que no son gasto", () => {
    const db = openDb(":memory:");
    const i = addMovement(db, { ...base, sourceId: "i1", kind: "ingreso" });
    const g = addMovement(db, { ...base, sourceId: "g1" });
    expect(setMerchantRule(db, "Exito", "supermercado")).toEqual({ updated: 1 });
    expect(categoryOf(db, i.id)).toBeNull();
    expect(categoryOf(db, g.id)).toBe("supermercado");
  });

  it("la regla ignora mayúsculas y espacios", () => {
    const db = openDb(":memory:");
    setMerchantRule(db, "  EXITO ", "supermercado");
    const r = addMovement(db, { ...base, sourceId: "a1", merchant: "exito" });
    expect(categoryOf(db, r.id)).toBe("supermercado");
  });

  it("una categoría pasada en el input pisa la regla", () => {
    const db = openDb(":memory:");
    setMerchantRule(db, "Exito", "supermercado");
    const r = addMovement(db, { ...base, sourceId: "a1", category: "otro" });
    expect(r.needsClassification).toBe(false);
    expect(categoryOf(db, r.id)).toBe("otro");
  });

  it("un duplicado devuelve needsClassification false", () => {
    const db = openDb(":memory:");
    addMovement(db, { ...base, sourceId: "a1" });
    expect(addMovement(db, { ...base, sourceId: "a1" }).needsClassification).toBe(false);
  });
});
