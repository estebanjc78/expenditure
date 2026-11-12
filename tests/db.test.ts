import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";

describe("openDb", () => {
  it("crea las tablas esperadas", () => {
    const db = openDb(":memory:");
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const names = rows.map((r) => r.name);
    for (const t of ["movements", "merchant_rules", "budgets", "fixed_expenses"]) {
      expect(names).toContain(t);
    }
  });

  it("es idempotente", () => {
    const path = join(mkdtempSync(join(tmpdir(), "gastos-")), "t.db");
    openDb(path).close();
    expect(() => openDb(path).close()).not.toThrow();
  });
});
