import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { setBudget } from "../src/domain/budget.js";
import { budgetOverview } from "../src/domain/budget-overview.js";
import { lastMovementByBank } from "../src/domain/last-movement.js";

describe("budgetOverview", () => {
  it("incluye sinCategoria con el gasto sin clasificar del mes", () => {
    const db = openDb(":memory:");
    setBudget(db, "otro", "default", 100000);
    addMovement(db, { date: "2026-10-05", amount: 30000, merchant: "A", bank: "bbva", kind: "gasto", category: "otro" });
    addMovement(db, { date: "2026-10-06", amount: 7000, merchant: "B", bank: "bbva", kind: "gasto" });
    addMovement(db, { date: "2026-11-06", amount: 9000, merchant: "C", bank: "bbva", kind: "gasto" });
    const o = budgetOverview(db, "2026-10");
    expect(o.categories).toHaveLength(5);
    expect(o.sinCategoria).toBe(7000);
  });

  it("respeta el filtro de banco", () => {
    const db = openDb(":memory:");
    addMovement(db, { date: "2026-10-06", amount: 7000, merchant: "B", bank: "bbva", kind: "gasto" });
    addMovement(db, { date: "2026-10-06", amount: 2000, merchant: "D", bank: "nu", kind: "gasto" });
    expect(budgetOverview(db, "2026-10", "nu").sinCategoria).toBe(2000);
  });

  it("sinCategoria es 0 sin movimientos", () => {
    expect(budgetOverview(openDb(":memory:"), "2026-10").sinCategoria).toBe(0);
  });
});

describe("lastMovementByBank", () => {
  it("devuelve la fecha más reciente por banco y [] si no hay", () => {
    const db = openDb(":memory:");
    expect(lastMovementByBank(db)).toEqual([]);
    addMovement(db, { date: "2026-10-06", amount: 1, merchant: "B", bank: "bbva", kind: "gasto" });
    addMovement(db, { date: "2026-10-09", amount: 1, merchant: "B", bank: "bbva", kind: "ingreso" });
    addMovement(db, { date: "2026-10-02", amount: 1, merchant: "D", bank: "nu", kind: "gasto" });
    expect(lastMovementByBank(db)).toEqual([
      { bank: "bbva", lastDate: "2026-10-09" },
      { bank: "nu", lastDate: "2026-10-02" },
    ]);
  });
});
