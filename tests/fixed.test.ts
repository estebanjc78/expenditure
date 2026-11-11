import { describe, it, expect, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { importFixedExpenses, pendingFixed } from "../src/domain/fixed.js";

const dir = mkdtempSync(join(tmpdir(), "fijos-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
async function makeXlsx(rows: unknown[][], header: string[] = ["nombre", "monto", "comercio"]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Fijos");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const path = join(dir, `fijos-${n++}.xlsx`);
  await wb.xlsx.writeFile(path);
  return path;
}

describe("fixed expenses", () => {
  it("importa filas del Excel", async () => {
    const db = openDb(":memory:");
    const p = await makeXlsx([["Arriendo", 1500000, "inmobiliaria"], ["Internet", 90000, "claro"]]);
    expect(await importFixedExpenses(db, p)).toEqual({ imported: 2 });
    const s = pendingFixed(db, "2026-10");
    expect(s.map((e) => [e.name, e.expected])).toEqual([["Arriendo", 1500000], ["Internet", 90000]]);
  });

  it("un fijo con pago en el mes figura paid:true", async () => {
    const db = openDb(":memory:");
    await importFixedExpenses(db, await makeXlsx([["Internet", 90000, "claro"]]));
    addMovement(db, { date: "2026-10-05", amount: 90000, merchant: "CLARO Hogar", bank: "bbva", kind: "gasto", category: "fijo" });
    expect(pendingFixed(db, "2026-10")).toEqual([{ name: "Internet", expected: 90000, paid: true, paidAmount: 90000 }]);
  });

  it("uno sin pago figura paid:false", async () => {
    const db = openDb(":memory:");
    await importFixedExpenses(db, await makeXlsx([["Internet", 90000, "claro"]]));
    addMovement(db, { date: "2026-09-05", amount: 90000, merchant: "Claro", bank: "bbva", kind: "gasto", category: "fijo" });
    addMovement(db, { date: "2026-10-05", amount: 90000, merchant: "Claro", bank: "bbva", kind: "ingreso" });
    expect(pendingFixed(db, "2026-10")).toEqual([{ name: "Internet", expected: 90000, paid: false }]);
  });

  it("sin comercio usa el nombre como palabra clave", async () => {
    const db = openDb(":memory:");
    await importFixedExpenses(db, await makeXlsx([["Netflix", 40000, null]]));
    addMovement(db, { date: "2026-10-05", amount: 40000, merchant: "NETFLIX.COM", bank: "bbva", kind: "gasto", category: "suscripcion" });
    expect(pendingFixed(db, "2026-10")[0]).toMatchObject({ paid: true, paidAmount: 40000 });
  });

  it("fila sin nombre o con monto inválido se rechaza con el número de fila", async () => {
    const db = openDb(":memory:");
    await expect(importFixedExpenses(db, await makeXlsx([["A", 100, "a"], ["B", 100, "b"], ["C", -5, "c"]]))).rejects.toThrow("row 4: monto must be a positive integer");
    await expect(importFixedExpenses(db, await makeXlsx([["", 100, "a"]]))).rejects.toThrow("row 2: nombre is required");
    expect(pendingFixed(db, "2026-10")).toEqual([]);
  });

  it("reimportar reemplaza la lista anterior y un error deja la anterior", async () => {
    const db = openDb(":memory:");
    await importFixedExpenses(db, await makeXlsx([["Viejo", 1, "v"]]));
    await expect(importFixedExpenses(db, await makeXlsx([["Nuevo", 2, "n"], ["Mal", 0, "m"]]))).rejects.toThrow("row 3");
    expect(pendingFixed(db, "2026-10").map((e) => e.name)).toEqual(["Viejo"]);
    await importFixedExpenses(db, await makeXlsx([["Nuevo", 2, "n"], [null, null, null]]));
    expect(pendingFixed(db, "2026-10").map((e) => e.name)).toEqual(["Nuevo"]);
  });

  it("falla si falta una columna requerida", async () => {
    const db = openDb(":memory:");
    await expect(importFixedExpenses(db, await makeXlsx([["A", 1]], ["nombre", "valor"]))).rejects.toThrow("monto");
  });
});
