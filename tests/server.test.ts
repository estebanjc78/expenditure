import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";

async function connect() {
  const server = createServer(openDb(":memory:"));
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };
    return { isError: res.isError === true, text: res.content[0]!.text };
  };
  return { client, call };
}

const mov = { date: "2026-10-05", amount: 50000, merchant: "Exito", bank: "bbva", kind: "gasto" };

describe("servidor MCP", () => {
  it("lista las 8 herramientas", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "clasificar_comercio", "consultar_movimientos", "estado_presupuesto", "fijar_presupuesto",
      "gastos_fijos_pendientes", "importar_gastos_fijos", "registrar_movimiento", "ultimo_movimiento_registrado",
    ]);
  });

  it("registrar dos veces el mismo sourceId devuelve duplicate:true la segunda", async () => {
    const { call } = await connect();
    const first = JSON.parse((await call("registrar_movimiento", { ...mov, sourceId: "m1" })).text);
    const second = JSON.parse((await call("registrar_movimiento", { ...mov, sourceId: "m1" })).text);
    expect(first).toMatchObject({ duplicate: false, needsClassification: true });
    expect(second).toMatchObject({ id: first.id, duplicate: true });
  });

  it("consultar devuelve los totales esperados", async () => {
    const { call } = await connect();
    await call("registrar_movimiento", { ...mov, category: "supermercado" });
    await call("registrar_movimiento", { ...mov, amount: 20000, category: "otro" });
    const r = JSON.parse((await call("consultar_movimientos", { filters: { month: "2026-10" }, groupBy: [] })).text);
    expect(r.totals.gasto).toBe(70000);
    expect(r.groups[0]).toMatchObject({ key: "total", total: 70000 });
  });

  it("entrada inválida devuelve isError sin caerse", async () => {
    const { call } = await connect();
    const bad = await call("registrar_movimiento", { ...mov, amount: -5 });
    expect(bad.isError).toBe(true);
    const badMonth = await call("estado_presupuesto", { month: "oct" });
    expect(badMonth.isError).toBe(true);
    expect((await call("gastos_fijos_pendientes", { month: "2026-1" })).isError).toBe(true);
    expect((await call("importar_gastos_fijos", { path: "/no/existe.xlsx" })).isError).toBe(true);
    expect((await call("ultimo_movimiento_registrado")).isError).toBe(false);
  });

  it("clasificar_comercio exige comercio no vacío y categoría válida", async () => {
    const { call } = await connect();
    expect((await call("clasificar_comercio", { merchant: "   ", category: "otro" })).isError).toBe(true);
    expect((await call("clasificar_comercio", { merchant: "x", category: "nada" })).isError).toBe(true);
    await call("registrar_movimiento", mov);
    const ok = await call("clasificar_comercio", { merchant: " exito ", category: "supermercado" });
    expect(JSON.parse(ok.text)).toEqual({ updated: 1 });
  });

  it("estado_presupuesto incluye sinCategoria", async () => {
    const { call } = await connect();
    await call("fijar_presupuesto", { category: "supermercado", month: "2026-10", amount: 100000 });
    await call("registrar_movimiento", mov);
    const r = JSON.parse((await call("estado_presupuesto", { month: "2026-10" })).text);
    expect(r.categories).toHaveLength(4);
    expect(r.sinCategoria).toBe(50000);
  });

  it("gastos_fijos_pendientes y ultimo_movimiento_registrado responden", async () => {
    const { call } = await connect();
    expect(JSON.parse((await call("gastos_fijos_pendientes", { month: "2026-10" })).text)).toEqual([]);
    await call("registrar_movimiento", mov);
    expect(JSON.parse((await call("ultimo_movimiento_registrado")).text)).toEqual([
      { bank: "bbva", lastDate: "2026-10-05" },
    ]);
  });
});
