import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { setBudget, monthStatus } from "../src/domain/budget.js";
import type { Category } from "../src/domain/types.js";

function gasto(db: ReturnType<typeof openDb>, amount: number, category: Category, bank = "bbva", date = "2026-10-10") {
  addMovement(db, { date, amount, merchant: "X", bank, kind: "gasto", category });
}

const find = (s: ReturnType<typeof monthStatus>, c: Category) => s.find((e) => e.category === c)!;

describe("budget", () => {
  it("calcula gastado, restante y porcentaje", () => {
    const db = openDb(":memory:");
    setBudget(db, "supermercado", "2026-10", 1000000);
    gasto(db, 250000, "supermercado");
    expect(find(monthStatus(db, "2026-10"), "supermercado")).toEqual({
      category: "supermercado", budget: 1000000, spent: 250000, remaining: 750000, percent: 25, alert: false,
    });
  });

  it("devuelve las cuatro categorías en orden", () => {
    const s = monthStatus(openDb(":memory:"), "2026-10");
    expect(s.map((e) => e.category)).toEqual(["supermercado", "suscripcion", "fijo", "otro"]);
  });

  it("alert es false al 79% y true al 80%", () => {
    const db = openDb(":memory:");
    setBudget(db, "otro", "default", 100000);
    gasto(db, 79000, "otro", "bbva", "2026-10-10");
    gasto(db, 80000, "otro", "bbva", "2026-11-10");
    expect(find(monthStatus(db, "2026-10"), "otro").alert).toBe(false);
    expect(find(monthStatus(db, "2026-11"), "otro").alert).toBe(true);
  });

  it("sin presupuesto definido devuelve budget null y no lanza error", () => {
    const db = openDb(":memory:");
    gasto(db, 5000, "fijo");
    expect(find(monthStatus(db, "2026-10"), "fijo")).toEqual({
      category: "fijo", budget: null, spent: 5000, remaining: null, percent: null, alert: false,
    });
  });

  it("un presupuesto del mes pisa el default", () => {
    const db = openDb(":memory:");
    setBudget(db, "fijo", "default", 100000);
    setBudget(db, "fijo", "2026-10", 200000);
    expect(find(monthStatus(db, "2026-10"), "fijo").budget).toBe(200000);
    expect(find(monthStatus(db, "2026-09"), "fijo").budget).toBe(100000);
    setBudget(db, "fijo", "2026-10", 300000);
    expect(find(monthStatus(db, "2026-10"), "fijo").budget).toBe(300000);
  });

  it("filtra por banco", () => {
    const db = openDb(":memory:");
    setBudget(db, "otro", "default", 100000);
    gasto(db, 10000, "otro", "bbva");
    gasto(db, 20000, "otro", "bancolombia");
    expect(find(monthStatus(db, "2026-10", "bbva"), "otro").spent).toBe(10000);
    expect(find(monthStatus(db, "2026-10"), "otro").spent).toBe(30000);
  });

  it("pasarse del presupuesto da remaining negativo", () => {
    const db = openDb(":memory:");
    setBudget(db, "otro", "default", 100000);
    gasto(db, 130000, "otro");
    const e = find(monthStatus(db, "2026-10"), "otro");
    expect(e.remaining).toBe(-30000);
    expect(e.percent).toBe(130);
    expect(e.alert).toBe(true);
  });

  it("solo cuenta gastos, no ingresos", () => {
    const db = openDb(":memory:");
    addMovement(db, { date: "2026-10-10", amount: 999, merchant: "Y", bank: "bbva", kind: "ingreso", category: "otro" });
    expect(find(monthStatus(db, "2026-10"), "otro").spent).toBe(0);
  });

  it("valida monto y mes", () => {
    const db = openDb(":memory:");
    expect(() => setBudget(db, "otro", "2026-10", 0)).toThrow();
    expect(() => setBudget(db, "otro", "2026-10", -5)).toThrow();
    expect(() => setBudget(db, "otro", "2026-10", 1.5)).toThrow();
    expect(() => setBudget(db, "otro", "2026-13", 100)).toThrow();
    expect(() => setBudget(db, "otro", "octubre", 100)).toThrow();
    expect(() => setBudget(db, "nope" as Category, "2026-10", 100)).toThrow();
    expect(() => monthStatus(db, "2026-13")).toThrow();
  });
});
