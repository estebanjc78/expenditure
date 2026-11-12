import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { pendingFixed } from "../src/domain/fixed.js";
import { addMovement } from "../src/domain/movements.js";

function paidFor(keyword: string, merchant: string): boolean {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run("Concepto", 1000, keyword);
  addMovement(db, { sourceId: "m", date: "2026-10-07", amount: 1000, merchant, bank: "bbva", kind: "gasto" });
  return pendingFixed(db, "2026-10")[0]!.paid;
}

describe("fixed expense keyword matching", () => {
  it("still matches whole words only", () => {
    expect(paidFor("microsoft", "Dlo*microsoft*sto")).toBe(true);
    expect(paidFor("luz", "Luzia Tienda")).toBe(false);
    expect(paidFor("etb", "Etbx Tienda")).toBe(false);
  });

  it("ignores accents and case", () => {
    expect(paidFor("compañia de", "COMPANIA DE MEDIC")).toBe(true);
    expect(paidFor("compania", "Compañia de Med")).toBe(true);
  });

  it("accepts a truncated last word only when the keyword ends with *", () => {
    expect(paidFor("compania de med*", "Compania de medic")).toBe(true);
    expect(paidFor("compania de med*", "Compañia de Med")).toBe(true);
    expect(paidFor("compania de med", "Compania de medic")).toBe(false);
    expect(paidFor("compania de med*", "Otra compania de panaderia")).toBe(false);
  });

  it("matches a keyword anywhere in the merchant, word by word", () => {
    expect(paidFor("graph works", "Graph works inc")).toBe(true);
    expect(paidFor("de med*", "Compania de medic")).toBe(true);
    expect(paidFor("medic compania", "Compania de medic")).toBe(false);
  });
});

describe("unlistedRecurring", () => {
  it("lists subscription and fixed charges that match nothing in the fixed-expenses list", async () => {
    const { unlistedRecurring } = await import("../src/domain/fixed.js");
    const { setMerchantRule } = await import("../src/domain/classify.js");
    const db = openDb(":memory:");
    db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run("Colsanitas", 1760000, "compania de med*");
    for (const [m, c] of [["Compania de medic", "fijo"], ["Kindle svcs", "suscripcion"], ["Merpago*melimas", "suscripcion"], ["Supermercado X", "supermercado"]] as const) setMerchantRule(db, m, c);
    const add = (sourceId: string, merchant: string, amount: number, date = "2026-10-05") => addMovement(db, { sourceId, date, amount, merchant, bank: "bbva", kind: "gasto" });
    add("a", "Compañia de Med", 1761480);
    add("b", "Kindle svcs", 32360);
    add("c", "Kindle svcs", 10000);
    add("d", "Merpago*melimas", 9990);
    add("e", "Supermercado X", 500000);
    add("f", "Kindle svcs", 5000, "2026-09-05");
    expect(unlistedRecurring(db, "2026-10")).toEqual([
      { merchant: "Kindle svcs", category: "suscripcion", count: 2, total: 42360 },
      { merchant: "Merpago*melimas", category: "suscripcion", count: 1, total: 9990 },
    ]);
  });
});
