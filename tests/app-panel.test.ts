import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { createServer } from "../src/server.js";
import { PANEL_UI } from "../src/tools/app-panel.js";
import { renderAppPage } from "../src/panel/web-page.js";

const NOW = Date.parse("2026-11-12T15:00:00Z");

async function connect(seed = true) {
  const db = openDb(":memory:");
  if (seed) {
    addMovement(db, { sourceId: "a", date: "2026-11-02", amount: 200_000, merchant: "Comercio Secreto SA", bank: "bbva", kind: "gasto" });
    addMovement(db, { sourceId: "b", date: "2026-10-05", amount: 90_000, merchant: "Otro Comercio", bank: "bbva", kind: "gasto" });
  }
  const server = createServer(db, { panel: { openUrl: async () => false, now: () => NOW } });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe("the report as an MCP App", () => {
  it("links ver_panel to a ui:// resource, and keeps the data tool away from the model", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const view = tools.find((t) => t.name === "ver_panel")!;
    const data = tools.find((t) => t.name === "datos_panel")!;
    expect((view._meta as { ui: { resourceUri: string } }).ui.resourceUri).toBe(PANEL_UI);
    expect((data._meta as { ui: { visibility: string[] } }).ui.visibility).toEqual(["app"]);
  });

  it("serves the report as an MCP App resource that needs nothing from the internet", async () => {
    const client = await connect();
    const res = await client.readResource({ uri: PANEL_UI });
    const content = res.contents[0] as { mimeType: string; text: string };
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toContain("datos_panel");
    expect(content.text).not.toMatch(/<(?:script|link)[^>]*(?:src|href)="https?:/i);
    expect(content.text).not.toMatch(/<[a-z][^>]*\sstyle="/i);
  });

  it("gives the model only a short summary, never the movements", async () => {
    const client = await connect();
    const res = (await client.callTool({ name: "ver_panel", arguments: {} })) as unknown as { content: { text: string }[]; structuredContent: { month: string } };
    expect(res.structuredContent).toEqual({ month: "2026-11" });
    const text = res.content[0]!.text;
    expect(text.length).toBeLessThan(300);
    expect(text).toContain("2026-11");
    expect(text).not.toContain("Comercio Secreto");
  });

  it("opens on the latest month with data when the current month has none, and honors an explicit month", async () => {
    const client = await connect();
    const explicit = (await client.callTool({ name: "ver_panel", arguments: { month: "2026-10" } })) as unknown as { structuredContent: { month: string } };
    expect(explicit.structuredContent.month).toBe("2026-10");
    const empty = await connect(false);
    const res = (await empty.callTool({ name: "ver_panel", arguments: {} })) as unknown as { content: { text: string }[] };
    expect(res.content[0]!.text).toMatch(/Todavía no hay movimientos/);
  });

  it("serves the report its data: the list of months, then a month snapshot", async () => {
    const client = await connect();
    const months = (await client.callTool({ name: "datos_panel", arguments: {} })) as unknown as { structuredContent: { months: string[]; currentMonth: string } };
    expect(months.structuredContent).toEqual({ months: ["2026-10", "2026-11"], currentMonth: "2026-11" });
    const month = (await client.callTool({ name: "datos_panel", arguments: { month: "2026-11" } })) as unknown as { structuredContent: { totals: { spent: number }; movements: { merchant: string }[] } };
    expect(month.structuredContent.totals.spent).toBe(200_000);
    expect(month.structuredContent.movements[0]!.merchant).toBe("Comercio Secreto SA");
  });

  it("rejects malformed months", async () => {
    const client = await connect();
    const res = (await client.callTool({ name: "datos_panel", arguments: { month: "noviembre" } })) as unknown as { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});

describe("ver_panel resaltar: Claude points at a movement inside the report", () => {
  async function withRent() {
    const db = openDb(":memory:");
    addMovement(db, { sourceId: "r1", date: "2026-10-15", amount: 9_000_000, merchant: "Transferencia a Propietario Ejemplo", bank: "bbva", kind: "gasto" });
    addMovement(db, { sourceId: "r2", date: "2026-11-03", amount: 50_000, merchant: "Tienda", bank: "bbva", kind: "gasto" });
    db.prepare("INSERT INTO fixed_expenses (name, amount, merchant) VALUES ('Alquiler', 9000000, 'propietario')").run();
    const server = createServer(db, { panel: { openUrl: async () => false, now: () => NOW } });
    const client = new Client({ name: "test", version: "0.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  }

  it("opens the report on the month where the movement is, with its id highlighted, and tells Claude what it found", async () => {
    const client = await withRent();
    const res = (await client.callTool({ name: "ver_panel", arguments: { resaltar: "alquiler" } })) as unknown as {
      content: { text: string }[];
      structuredContent: { month: string; highlight: { query: string; ids: number[] } };
    };
    expect(res.structuredContent.month).toBe("2026-10");
    expect(res.structuredContent.highlight.query).toBe("alquiler");
    expect(res.structuredContent.highlight.ids).toHaveLength(1);
    expect(res.content[0]!.text).toMatch(/Resalté en el reporte 1 movimiento/);
    expect(res.content[0]!.text).toContain("9.000.000");
  });

  it("says plainly when nothing matches, so Claude can suggest the month may not be loaded", async () => {
    const client = await withRent();
    const res = (await client.callTool({ name: "ver_panel", arguments: { resaltar: "dentista" } })) as unknown as { content: { text: string }[]; structuredContent: { highlight: { ids: number[] } } };
    expect(res.structuredContent.highlight.ids).toEqual([]);
    expect(res.content[0]!.text).toMatch(/No encontré movimientos para «dentista»/);
  });
});

describe("renderAppPage", () => {
  it("embeds the whole dashboard in one self-contained page", () => {
    const html = renderAppPage();
    expect(html).toContain('<script type="module">');
    expect(html).toContain("window.__MCP_APP__");
    expect(html).not.toContain("innerHTML");
  });
});
