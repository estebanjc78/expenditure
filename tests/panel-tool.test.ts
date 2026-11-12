import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";

async function connect(opened: string[], canOpen = true) {
  const server = createServer(openDb(":memory:"), { panel: { openUrl: async (u) => (opened.push(u), canOpen) } });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name: "abrir_panel", arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: res.isError === true, text: res.content[0]!.text };
  };
  return { call, client };
}

describe("abrir_panel", () => {
  it("opens the dashboard on loopback with a token and reuses the same panel", async () => {
    const opened: string[] = [];
    const { call, client } = await connect(opened);
    const first = JSON.parse((await call()).text);
    expect(first.opened).toBe(true);
    expect(first.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#t=[\w-]+$/);

    const second = JSON.parse((await call({ month: "2026-09" })).text);
    expect(second.url).toBe(`${first.url}&m=2026-09`);
    expect(opened).toHaveLength(2);

    // the page is really being served
    const page = await fetch(first.url.split("#")[0]);
    expect(page.status).toBe(200);
    await client.close();
  });

  it("returns the url when the browser cannot be opened", async () => {
    const { call, client } = await connect([], false);
    expect(JSON.parse((await call()).text)).toMatchObject({ opened: false, url: expect.stringContaining("127.0.0.1") });
    await client.close();
  });

  it("rejects a malformed month", async () => {
    const { call, client } = await connect([]);
    expect((await call({ month: "octubre" })).isError).toBe(true);
    await client.close();
  });

  it("stops serving when the MCP connection closes", async () => {
    const { call, client } = await connect([]);
    const { url } = JSON.parse((await call()).text);
    await client.close();
    await new Promise((r) => setTimeout(r, 50));
    await expect(fetch(url.split("#")[0])).rejects.toThrow();
  });
});
