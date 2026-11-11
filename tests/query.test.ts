import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { queryMovements, querySchema } from "../src/domain/query.js";
import type { MovementInput } from "../src/domain/types.js";

function seed() {
  const db = openDb(":memory:");
  const rows: MovementInput[] = [
    { date: "2026-10-05", amount: 100000, merchant: "Exito", bank: "bbva", kind: "gasto", category: "supermercado" },
    { date: "2026-10-12", amount: 50000, merchant: "Jumbo", bank: "bancolombia", kind: "gasto", category: "supermercado" },
    { date: "2026-10-20", amount: 30000, merchant: "Netflix", bank: "bbva", kind: "gasto", category: "suscripcion" },
    { date: "2026-10-25", amount: 200000, merchant: "Rappi", bank: "bbva", kind: "gasto" },
    { date: "2026-10-31", amount: 7000, merchant: "Tienda 100%", bank: "bbva", kind: "gasto", category: "otro" },
    { date: "2026-11-01", amount: 9000, merchant: "Exito", bank: "bbva", kind: "gasto", category: "supermercado" },
    { date: "2026-10-28", amount: 3000000, merchant: "Empresa", bank: "bbva", kind: "ingreso" },
    { date: "2026-10-29", amount: 500000, merchant: "Ahorros", bank: "bbva", kind: "transferencia_propia" },
  ];
  for (const r of rows) addMovement(db, r);
  return db;
}

describe("queryMovements", () => {
  it("agrupa por categoría y ordena de mayor a menor", () => {
    const r = queryMovements(seed(), { filters: { month: "2026-10" }, groupBy: ["category"] });
    expect(r.groups.map((g) => [g.key, g.total, g.count])).toEqual([
      ["sin_categoria", 200000, 1],
      ["supermercado", 150000, 2],
      ["suscripcion", 30000, 1],
      ["otro", 7000, 1],
    ]);
  });

  it("groupBy [category, merchant] anida comercios dentro de cada categoría", () => {
    const r = queryMovements(seed(), { filters: { month: "2026-10" }, groupBy: ["category", "merchant"] });
    const sup = r.groups.find((g) => g.key === "supermercado")!;
    expect(sup.children!.map((c) => [c.key, c.total])).toEqual([
      ["exito", 100000],
      ["jumbo", 50000],
    ]);
  });

  it("includeMovements devuelve los movimientos en las hojas", () => {
    const r = queryMovements(seed(), {
      filters: { month: "2026-10", category: "supermercado" },
      groupBy: ["merchant"],
      includeMovements: true,
    });
    expect(r.groups[0]!.key).toBe("exito");
    expect(r.groups[0]!.movements).toHaveLength(1);
    expect(r.groups[0]!.movements![0]).toMatchObject({ merchant: "Exito", amount: 100000 });
    expect(r.groups[0]!.children).toBeUndefined();
  });

  it("ingresos y transferencia_propia no suman en groups pero sí aparecen en totals", () => {
    const r = queryMovements(seed(), { filters: { month: "2026-10" }, groupBy: ["month"] });
    expect(r.groups).toEqual([{ key: "2026-10", total: 387000, count: 5 }]);
    expect(r.totals).toEqual({ gasto: 387000, ingreso: 3000000, transferenciaPropia: 500000 });
  });

  it("filtro kind ingreso agrupa ingresos pero totals ignora kind", () => {
    const r = queryMovements(seed(), { filters: { month: "2026-10", kind: "ingreso" }, groupBy: ["bank"] });
    expect(r.groups).toEqual([{ key: "bbva", total: 3000000, count: 1 }]);
    expect(r.totals.gasto).toBe(387000);
  });

  it("31-oct y 01-nov caen en meses distintos (month: 2026-10)", () => {
    const oct = queryMovements(seed(), { filters: { month: "2026-10", merchant: "Tienda 100%" }, groupBy: ["day"] });
    expect(oct.groups).toEqual([{ key: "2026-10-31", total: 7000, count: 1 }]);
    const nov = queryMovements(seed(), { filters: { month: "2026-11" }, groupBy: ["day"] });
    expect(nov.groups).toEqual([{ key: "2026-11-01", total: 9000, count: 1 }]);
    const all = queryMovements(seed(), { filters: {}, groupBy: ["month"] });
    expect(all.groups.map((g) => g.key)).toEqual(["2026-10", "2026-11"]);
  });

  it("filtro bank y filtro text combinados", () => {
    const r = queryMovements(seed(), { filters: { bank: "bbva", text: "xit" }, groupBy: ["merchant"] });
    expect(r.groups).toEqual([{ key: "exito", total: 109000, count: 2 }]);
  });

  it("text escapa % y _ como literales", () => {
    const db = seed();
    expect(queryMovements(db, { filters: { text: "100%" }, groupBy: ["merchant"] }).groups).toHaveLength(1);
    expect(queryMovements(db, { filters: { text: "%" }, groupBy: ["merchant"] }).groups).toHaveLength(1);
    expect(queryMovements(db, { filters: { text: "_" }, groupBy: ["merchant"] }).groups).toEqual([]);
  });

  it("mes sin movimientos devuelve groups [] y totals en cero", () => {
    const r = queryMovements(seed(), { filters: { month: "2026-09" }, groupBy: ["category"] });
    expect(r).toEqual({ groups: [], totals: { gasto: 0, ingreso: 0, transferenciaPropia: 0 } });
  });

  it('category "sin_categoria" devuelve los no clasificados', () => {
    const r = queryMovements(seed(), { filters: { category: "sin_categoria" }, groupBy: ["merchant"] });
    expect(r.groups).toEqual([{ key: "rappi", total: 200000, count: 1 }]);
  });

  it("from/to y minAmount/maxAmount filtran", () => {
    const r = queryMovements(seed(), {
      filters: { from: "2026-10-10", to: "2026-10-25", minAmount: 40000, maxAmount: 200000 },
      groupBy: ["merchant"],
    });
    expect(r.groups.map((g) => g.key)).toEqual(["rappi", "jumbo"]);
  });

  it("valores con comillas no rompen la consulta (parámetros enlazados)", () => {
    const r = queryMovements(seed(), { filters: { bank: "x' OR '1'='1" }, groupBy: ["bank"] });
    expect(r.groups).toEqual([]);
  });

  it("no muta la consulta de entrada", () => {
    const q = { filters: { month: "2026-10" }, groupBy: ["category" as const] };
    const copy = structuredClone(q);
    queryMovements(seed(), q);
    expect(q).toEqual(copy);
  });
});

describe("querySchema", () => {
  it("rechaza groupBy con dimensiones duplicadas", () => {
    expect(querySchema.safeParse({ filters: {}, groupBy: ["bank", "bank"] }).success).toBe(false);
  });
  it("rechaza month mal formado y fechas irreales", () => {
    expect(querySchema.safeParse({ filters: { month: "2026-13" }, groupBy: [] }).success).toBe(false);
    expect(querySchema.safeParse({ filters: { from: "2026-02-30" }, groupBy: [] }).success).toBe(false);
  });
  it("queryMovements lanza error claro con consulta inválida", () => {
    expect(() => queryMovements(openDb(":memory:"), { filters: {}, groupBy: ["bank", "bank"] })).toThrow(/Invalid query/);
  });
  it("acepta consulta válida", () => {
    expect(querySchema.safeParse({ filters: { month: "2026-10" }, groupBy: ["category"] }).success).toBe(true);
  });

  it("agrupa banco y comercio con valores normalizados", () => {
    const db = openDb(":memory:");
    const m = { date: "2026-10-05", amount: 10, kind: "gasto" as const, category: "otro" as const };
    addMovement(db, { ...m, merchant: "EXITO", bank: "BBVA" });
    addMovement(db, { ...m, merchant: "Exito ", bank: "bbva " });
    const banks = queryMovements(db, { filters: {}, groupBy: ["bank"] });
    expect(banks.groups.map((g) => [g.key, g.count])).toEqual([["bbva", 2]]);
    const merchants = queryMovements(db, { filters: { bank: " BBVA" }, groupBy: ["merchant"] });
    expect(merchants.groups.map((g) => [g.key, g.count])).toEqual([["exito", 2]]);
  });
});
