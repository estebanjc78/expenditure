import { describe, it, expect } from "vitest";
import { resolveDbPath } from "../src/db-path.js";

describe("resolveDbPath", () => {
  const home = "/home/u";
  it("vacío o en blanco usa el valor por defecto", () => {
    expect(resolveDbPath(undefined, home)).toBe("/home/u/.gastos-mcp/gastos.db");
    expect(resolveDbPath("", home)).toBe("/home/u/.gastos-mcp/gastos.db");
    expect(resolveDbPath("   ", home)).toBe("/home/u/.gastos-mcp/gastos.db");
  });
  it("expande ~ y ~/", () => {
    expect(resolveDbPath("~/x/y.db", home)).toBe("/home/u/x/y.db");
    expect(resolveDbPath("~", home)).toBe("/home/u");
  });
  it("respeta :memory: y rutas absolutas", () => {
    expect(resolveDbPath(":memory:", home)).toBe(":memory:");
    expect(resolveDbPath(" /tmp/a.db ", home)).toBe("/tmp/a.db");
  });
});
