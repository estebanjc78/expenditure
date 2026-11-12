import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/db.js";
import { setBudget } from "../src/domain/budget.js";
import { dashboardData, listMonths } from "../src/domain/dashboard.js";
import { addMovement } from "../src/domain/movements.js";
import { setMerchantRule } from "../src/domain/classify.js";
import { shiftMonth } from "../src/domain/month.js";
import type { MovementInput } from "../src/domain/types.js";

let n = 0;
function add(db: DatabaseSync, m: Partial<MovementInput> & Pick<MovementInput, "date" | "amount" | "merchant">): void {
  n += 1;
  addMovement(db, { sourceId: `t${n}`, bank: "bbva", kind: "gasto", ...m });
}

describe("shiftMonth", () => {
  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
  });
});

describe("dashboardData", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = openDb(":memory:");
    setMerchantRule(db, "Super Ejemplo", "supermercado");
    setMerchantRule(db, "Streaming Demo", "suscripcion");
    add(db, { date: "2026-09-05", amount: 100_000, merchant: "Super Ejemplo" });
    add(db, { date: "2026-09-20", amount: 50_000, merchant: "Streaming Demo" });
    add(db, { date: "2026-10-02", amount: 200_000, merchant: "Super Ejemplo" });
    add(db, { date: "2026-10-02", amount: 30_000, merchant: "Tienda Rara" });
    add(db, { date: "2026-10-15", amount: 50_000, merchant: "Streaming Demo" });
    add(db, { date: "2026-10-10", amount: 900_000, merchant: "Cliente Demo", kind: "ingreso" });
    add(db, { date: "2026-10-11", amount: 500_000, merchant: "Transferencia propia", kind: "transferencia_propia" });
  });

  it("totals the month and compares it with the previous one", () => {
    const d = dashboardData(db, "2026-10", { today: "2026-10-20" });
    expect(d.month).toBe("2026-10");
    expect(d.prevMonth).toBe("2026-09");
    expect(d.totals).toMatchObject({ spent: 280_000, prevSpent: 150_000, income: 900_000, prevIncome: 0 });
    expect(d.totals.uncategorized).toEqual({ amount: 30_000, count: 1 });
  });

  it("compares a running month with the same days of the previous month", () => {
    const d = dashboardData(db, "2026-10", { today: "2026-10-10" });
    expect(d.totals.prevSpent).toBe(150_000);
    expect(d.totals.prevSpentToDate).toBe(100_000);
    expect(d.categories.find((c) => c.category === "suscripcion")!.prevSpent).toBe(0);
    expect(d.categories.find((c) => c.category === "supermercado")!.prevSpent).toBe(100_000);
    const past = dashboardData(db, "2026-10", { today: "2026-12-01" });
    expect(past.totals.prevSpentToDate).toBe(150_000);
  });

  it("breaks spending down by category, with budgets and the previous month", () => {
    setBudget(db, "supermercado", "default", 250_000);
    const d = dashboardData(db, "2026-10", { today: "2026-10-20" });
    const sup = d.categories.find((c) => c.category === "supermercado")!;
    expect(sup).toMatchObject({ spent: 200_000, prevSpent: 100_000, count: 1, budget: 250_000, percent: 80, alert: true });
    const sin = d.categories.find((c) => c.category === "sin_categoria")!;
    expect(sin).toMatchObject({ spent: 30_000, count: 1, budget: null });
    expect(d.categories.map((c) => c.category)).toEqual(["supermercado", "suscripcion", "fijo", "otro", "sin_categoria"]);
  });

  it("returns daily spending for the month and the previous month by day of month", () => {
    const d = dashboardData(db, "2026-10", { today: "2026-10-20" });
    expect(d.daily).toEqual([
      { date: "2026-10-02", total: 230_000, count: 2 },
      { date: "2026-10-15", total: 50_000, count: 1 },
    ]);
    expect(d.prevDaily).toEqual([
      { day: 5, total: 100_000 },
      { day: 20, total: 50_000 },
    ]);
  });

  it("ranks merchants and lists every movement kind, newest first", () => {
    const d = dashboardData(db, "2026-10", { today: "2026-10-20" });
    expect(d.topMerchants[0]).toEqual({ merchant: "Super Ejemplo", total: 200_000, count: 1 });
    expect(d.movements.map((m) => m.date)).toEqual(["2026-10-15", "2026-10-11", "2026-10-10", "2026-10-02", "2026-10-02"]);
    expect(d.movements.find((m) => m.kind === "ingreso")).toMatchObject({ merchant: "Cliente Demo", amount: 900_000 });
    expect(d.movementsTruncated).toBe(false);
  });

  it("filters by bank and lists the banks available", () => {
    add(db, { date: "2026-10-03", amount: 40_000, merchant: "Otra Tienda", bank: "otrobanco" });
    expect(dashboardData(db, "2026-10", { today: "2026-10-20" }).banks).toEqual(["bbva", "otrobanco"]);
    const d = dashboardData(db, "2026-10", { today: "2026-10-20", bank: "OtroBanco" });
    expect(d.totals.spent).toBe(40_000);
    expect(d.movements).toHaveLength(1);
  });

  it("is well formed for a month without data", () => {
    const d = dashboardData(db, "2025-01", { today: "2026-10-20" });
    expect(d.totals).toMatchObject({ spent: 0, income: 0, uncategorized: { amount: 0, count: 0 } });
    expect(d.daily).toEqual([]);
    expect(d.topMerchants).toEqual([]);
    expect(d.categories).toHaveLength(5);
  });

  it("caps the movement list and says so", () => {
    for (let i = 0; i < 1005; i += 1) add(db, { date: "2026-11-01", amount: 1000, merchant: `Comercio ${i}` });
    const d = dashboardData(db, "2026-11", { today: "2026-11-20" });
    expect(d.movements).toHaveLength(1000);
    expect(d.movementsTruncated).toBe(true);
    expect(d.totals.spent).toBe(1_005_000);
  });

  it("rejects malformed months", () => {
    expect(() => dashboardData(db, "2026-13", { today: "2026-10-20" })).toThrow(/month/i);
  });
});

describe("listMonths", () => {
  it("returns the months that have movements, oldest first", () => {
    const db = openDb(":memory:");
    add(db, { date: "2026-10-02", amount: 1000, merchant: "A" });
    add(db, { date: "2026-08-02", amount: 1000, merchant: "B" });
    add(db, { date: "2026-10-09", amount: 1000, merchant: "C" });
    expect(listMonths(db)).toEqual(["2026-08", "2026-10"]);
  });
});
