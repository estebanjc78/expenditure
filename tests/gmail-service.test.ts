import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGmailService } from "../src/gmail/service.js";

describe("createGmailService", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gastos-svc-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("explains the Google setup when no client is configured", async () => {
    const svc = createGmailService({ dataDir: dir, env: {}, openUrl: async () => true });
    expect(svc.status()).toEqual({ configured: false, connected: false, waitingForUser: false, lastError: null });
    await expect(svc.connect()).rejects.toThrow(/gmail-setup/);
    expect(() => svc.source()).toThrow(/gmail-setup/);
  });

  it("opens only one authorization flow when connect is called twice at once", async () => {
    let opened = 0;
    const svc = createGmailService({
      dataDir: dir,
      env: { GASTOS_GOOGLE_CLIENT_ID: "id" },
      openUrl: async () => (opened++, true),
      oauthTimeoutMs: 80,
    });
    const [a, b] = await Promise.all([svc.connect(), svc.connect()]);
    expect(a.url).toBe(b.url);
    expect(opened).toBe(1);
    expect(svc.status().waitingForUser).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(svc.status()).toMatchObject({ waitingForUser: false, connected: false });
    expect(svc.status().lastError).toMatch(/tiempo/i);
  });

  it("fails with guidance when configured but not connected, and disconnect reports nothing to delete", () => {
    writeFileSync(join(dir, "google-client.json"), JSON.stringify({ installed: { client_id: "id" } }));
    const svc = createGmailService({ dataDir: dir, env: {} });
    expect(svc.status().configured).toBe(true);
    expect(() => svc.source()).toThrow(/conectar_gmail/);
    expect(svc.disconnect()).toEqual({ disconnected: false });
  });
});
