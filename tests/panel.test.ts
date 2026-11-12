import { request } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/db.js";
import { addMovement } from "../src/domain/movements.js";
import { panelUrl, startPanel } from "../src/panel/server.js";
import type { Panel } from "../src/panel/server.js";

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function get(panel: Panel, path: string, headers: Record<string, string> = {}, method = "GET"): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: panel.port, path, method, headers: { host: `127.0.0.1:${panel.port}`, ...headers } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("panel server", () => {
  let db: DatabaseSync;
  let panel: Panel;
  beforeEach(async () => {
    db = openDb(":memory:");
    addMovement(db, { sourceId: "a", date: "2026-10-02", amount: 200_000, merchant: "<script>alert(1)</script>", bank: "bbva", kind: "gasto" });
    panel = await startPanel(db, { now: () => Date.parse("2026-10-20T15:00:00Z") });
  });
  afterEach(async () => {
    await panel.close();
  });

  it("listens only on the loopback address with a random token", () => {
    expect(panel.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(panel.token.length).toBeGreaterThanOrEqual(30);
    expect(panelUrl(panel)).toBe(`${panel.url}/#t=${panel.token}`);
    expect(panelUrl(panel, "2026-09")).toBe(`${panel.url}/#t=${panel.token}&m=2026-09`);
  });

  it("serves the page without any data and with a strict security policy", async () => {
    const res = await get(panel, "/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).not.toContain("alert(1)");
    expect(res.body).not.toContain(panel.token);
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(res.body).toContain(`nonce="${nonce}"`);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("uses a fresh nonce on every page load", async () => {
    const a = String((await get(panel, "/")).headers["content-security-policy"]);
    const b = String((await get(panel, "/")).headers["content-security-policy"]);
    expect(a).not.toBe(b);
  });

  it("refuses API calls without the token or with a wrong one", async () => {
    expect((await get(panel, "/api/months")).status).toBe(401);
    expect((await get(panel, "/api/months", { "x-panel-token": "nope" })).status).toBe(401);
    expect((await get(panel, "/api/month?month=2026-10")).status).toBe(401);
  });

  it("refuses requests whose Host is not the loopback address (DNS rebinding)", async () => {
    const res = await get(panel, "/api/months", { "x-panel-token": panel.token, host: "evil.example" });
    expect(res.status).toBe(403);
    expect((await get(panel, "/", { host: "evil.example" })).status).toBe(403);
  });

  it("returns months and a month snapshot with the token", async () => {
    const months = await get(panel, "/api/months", { "x-panel-token": panel.token });
    expect(JSON.parse(months.body)).toEqual({ months: ["2026-10"], currentMonth: "2026-10" });

    const res = await get(panel, "/api/month?month=2026-10", { "x-panel-token": panel.token });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const data = JSON.parse(res.body);
    expect(data.totals.spent).toBe(200_000);
    expect(data.today).toBe("2026-10-20");
    // untrusted text travels as JSON data, never as markup
    expect(data.movements[0].merchant).toBe("<script>alert(1)</script>");
  });

  it("supports conditional requests so polling is cheap", async () => {
    const first = await get(panel, "/api/month?month=2026-10", { "x-panel-token": panel.token });
    const etag = String(first.headers.etag);
    expect(etag).toBeTruthy();
    const again = await get(panel, "/api/month?month=2026-10", { "x-panel-token": panel.token, "if-none-match": etag });
    expect(again.status).toBe(304);
    addMovement(db, { sourceId: "b", date: "2026-10-03", amount: 5000, merchant: "Nuevo", bank: "bbva", kind: "gasto" });
    const changed = await get(panel, "/api/month?month=2026-10", { "x-panel-token": panel.token, "if-none-match": etag });
    expect(changed.status).toBe(200);
  });

  it("validates the month and bank parameters", async () => {
    const h = { "x-panel-token": panel.token };
    expect((await get(panel, "/api/month?month=2026-13", h)).status).toBe(400);
    expect((await get(panel, "/api/month", h)).status).toBe(400);
    expect((await get(panel, `/api/month?month=2026-10&bank=${"x".repeat(80)}`, h)).status).toBe(400);
    expect((await get(panel, "/api/month?month=2026-10&bank=bbva", h)).status).toBe(200);
  });

  it("is read only and has no other routes", async () => {
    const h = { "x-panel-token": panel.token };
    expect((await get(panel, "/api/month?month=2026-10", h, "POST")).status).toBe(405);
    expect((await get(panel, "/api/month?month=2026-10", h, "DELETE")).status).toBe(405);
    expect((await get(panel, "/etc/passwd", h)).status).toBe(404);
    expect((await get(panel, "/api/nope", h)).status).toBe(404);
  });

  it("frees the port when closed", async () => {
    await panel.close();
    await expect(get(panel, "/")).rejects.toThrow();
    panel = await startPanel(db);
  });
});
