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

describe("PSE payments are matched to fixed expenses by amount (the payee is not in the notice)", () => {
  function setup(items: [string, number, string | null][], payments: [string, number, string?][]) {
    const db = openDb(":memory:");
    for (const [name, amount, kw] of items) db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run(name, amount, kw);
    payments.forEach(([merchant, amount, date], i) => addMovement(db, { sourceId: `p${i}`, date: date ?? "2026-10-07", amount, merchant, bank: "bbva", kind: "gasto" }));
    return pendingFixed(db, "2026-10");
  }

  it("marks a fixed expense as paid by amount, flagged as such, within 10%", () => {
    const s = setup([["Colegio", 3259029, "colegio"]], [["PSE · PAGOS ELECTRONI", 3259029]]);
    expect(s[0]).toEqual({ name: "Colegio", expected: 3259029, paid: true, paidAmount: 3259029, matchedBy: "amount" });
    const near = setup([["Codensa", 400000, "codensa"]], [["PSE · PAGOS ELECTRONI", 372000]]);
    expect(near[0]).toMatchObject({ paid: true, matchedBy: "amount", paidAmount: 372000 });
  });

  it("does not match when the amount is too different or the payment is not a PSE payment", () => {
    expect(setup([["Codensa", 400000, "codensa"]], [["PSE · PAGOS ELECTRONI", 200000]])[0]).toEqual({ name: "Codensa", expected: 400000, paid: false });
    expect(setup([["Codensa", 400000, "codensa"]], [["Tienda Cualquiera", 400000]])[0]).toEqual({ name: "Codensa", expected: 400000, paid: false });
  });

  it("uses each payment once, giving it to the closest expected amount", () => {
    const s = setup(
      [["Movistar", 80000, "movistar"], ["Fenosa", 82000, "fenosa"]],
      [["PSE · PAGOS ELECTRONI", 81900]],
    );
    expect(s.find((x) => x.name === "Fenosa")).toMatchObject({ paid: true, matchedBy: "amount" });
    expect(s.find((x) => x.name === "Movistar")).toEqual({ name: "Movistar", expected: 80000, paid: false });
  });

  it("prefers a payment named after the concept over an amount match", () => {
    const s = setup([["Netflix", 44000, "netflix"]], [["Netflix", 44000], ["PSE · PAGOS ELECTRONI", 44000]]);
    expect(s[0]).toEqual({ name: "Netflix", expected: 44000, paid: true, paidAmount: 44000 });
  });

  it("does not report a PSE payment that matched a fixed expense as an unlisted recurring charge", async () => {
    const { unlistedRecurring } = await import("../src/domain/fixed.js");
    const { setMerchantRule } = await import("../src/domain/classify.js");
    const db = openDb(":memory:");
    setMerchantRule(db, "PSE · PAGOS ELECTRONI", "fijo");
    db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES (?, ?, ?)").run("Colegio", 3259029, "colegio");
    addMovement(db, { sourceId: "a", date: "2026-10-07", amount: 3259029, merchant: "PSE · PAGOS ELECTRONI", bank: "bbva", kind: "gasto" });
    addMovement(db, { sourceId: "b", date: "2026-10-09", amount: 777000, merchant: "PSE · PAGOS ELECTRONI", bank: "bbva", kind: "gasto" });
    expect(unlistedRecurring(db, "2026-10")).toEqual([{ merchant: "PSE · PAGOS ELECTRONI", category: "fijo", count: 1, total: 777000 }]);
  });
});

describe("PSE category", () => {
  it("gives every PSE payment the pse category automatically, unless the user decides otherwise", async () => {
    const { setMerchantRule } = await import("../src/domain/classify.js");
    const db = openDb(":memory:");
    const r = addMovement(db, { sourceId: "x1", date: "2026-10-07", amount: 499000, merchant: "PSE · PAGOS ELECTRONI", bank: "bbva", kind: "gasto" });
    expect(r.needsClassification).toBe(false);
    expect(db.prepare("SELECT category FROM movements WHERE source_id = 'x1'").get()).toEqual({ category: "pse" });
    setMerchantRule(db, "PSE · PAGOS ELECTRONI", "fijo");
    addMovement(db, { sourceId: "x2", date: "2026-10-08", amount: 1000, merchant: "PSE · PAGOS ELECTRONI", bank: "bbva", kind: "gasto" });
    expect(db.prepare("SELECT category FROM movements WHERE source_id = 'x2'").get()).toEqual({ category: "fijo" });
  });
});

describe("transferencia category", () => {
  it("is suggested for transfers to people, but a merchant rule or an explicit category wins", async () => {
    const { setMerchantRule } = await import("../src/domain/classify.js");
    const db = openDb(":memory:");
    const add = (id: string, merchant: string, extra: object = {}) => addMovement(db, { sourceId: id, date: "2026-10-07", amount: 1000, merchant, bank: "bbva", kind: "gasto", suggestedCategory: "transferencia", ...extra });
    expect(add("t1", "Persona Destino").needsClassification).toBe(false);
    setMerchantRule(db, "Propietario Ejemplo", "fijo");
    add("t2", "Propietario Ejemplo");
    add("t3", "Otra Persona", { category: "otro" });
    const rows = db.prepare("SELECT source_id, category FROM movements ORDER BY source_id").all();
    expect(rows).toEqual([{ source_id: "t1", category: "transferencia" }, { source_id: "t2", category: "fijo" }, { source_id: "t3", category: "otro" }]);
  });
});
