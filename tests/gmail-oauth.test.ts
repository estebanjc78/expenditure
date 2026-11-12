import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { beginAuthorization, getAccessToken, loadClientConfig, TokenStore } from "../src/gmail/oauth.js";

const CONFIG = { clientId: "client-id.apps.googleusercontent.com", clientSecret: "client-secret" };

interface Call {
  url: string;
  body: URLSearchParams;
}

function fakeGoogle(responses: unknown[]): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    const next = queue.shift() as { status?: number; json: unknown };
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("gmail oauth", () => {
  let dir: string;
  let store: TokenStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gastos-oauth-"));
    store = new TokenStore(join(dir, "gmail-token.json"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe("loadClientConfig", () => {
    it("reads the client from environment variables", () => {
      expect(loadClientConfig(dir, { GASTOS_GOOGLE_CLIENT_ID: "id", GASTOS_GOOGLE_CLIENT_SECRET: "sec" })).toEqual({ clientId: "id", clientSecret: "sec" });
    });

    it("reads the JSON downloaded from Google Cloud (installed app format)", () => {
      writeFileSync(join(dir, "google-client.json"), JSON.stringify({ installed: { client_id: "file-id", client_secret: "file-sec" } }));
      expect(loadClientConfig(dir, {})).toEqual({ clientId: "file-id", clientSecret: "file-sec" });
    });

    it("returns null when nothing is configured", () => {
      expect(loadClientConfig(dir, {})).toBeNull();
    });
  });

  describe("beginAuthorization", () => {
    it("builds a PKCE read-only authorization URL and stores the token after the callback", async () => {
      const { fetchFn, calls } = fakeGoogle([{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }]);
      const { url, completion } = await beginAuthorization(CONFIG, store, { fetchFn, now: () => 1_000_000 });

      const auth = new URL(url);
      expect(auth.origin + auth.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
      expect(auth.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
      expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
      expect(auth.searchParams.get("access_type")).toBe("offline");
      const redirect = new URL(auth.searchParams.get("redirect_uri")!);
      expect(redirect.hostname).toBe("127.0.0.1");

      const cb = new URL(redirect);
      cb.searchParams.set("code", "auth-code");
      cb.searchParams.set("state", auth.searchParams.get("state")!);
      const res = await fetch(cb);
      expect(res.status).toBe(200);
      await completion;

      expect(calls[0]!.body.get("grant_type")).toBe("authorization_code");
      expect(calls[0]!.body.get("code")).toBe("auth-code");
      expect(calls[0]!.body.get("code_verifier")).toBeTruthy();
      expect(store.read()).toEqual({ refreshToken: "rt-1", accessToken: "at-1", expiresAt: 1_000_000 + 3_600_000 });
      expect(statSync(join(dir, "gmail-token.json")).mode & 0o777).toBe(0o600);
    });

    it("rejects a callback with the wrong state and stores nothing", async () => {
      const { fetchFn } = fakeGoogle([]);
      const { url, completion } = await beginAuthorization(CONFIG, store, { fetchFn });
      const redirect = new URL(new URL(url).searchParams.get("redirect_uri")!);
      redirect.searchParams.set("code", "x");
      redirect.searchParams.set("state", "forged");
      const caught = completion.catch((e: Error) => e);
      const res = await fetch(redirect);
      expect(res.status).toBe(400);
      expect(((await caught) as Error).message).toMatch(/state/i);
      expect(store.read()).toBeNull();
    });

    it("fails when the user denies access", async () => {
      const { fetchFn } = fakeGoogle([]);
      const { url, completion } = await beginAuthorization(CONFIG, store, { fetchFn });
      const redirect = new URL(new URL(url).searchParams.get("redirect_uri")!);
      redirect.searchParams.set("error", "access_denied");
      redirect.searchParams.set("state", new URL(url).searchParams.get("state")!);
      const caught = completion.catch((e: Error) => e);
      await fetch(redirect);
      expect(((await caught) as Error).message).toMatch(/access_denied/);
    });

    it("times out and frees the port when nobody answers", async () => {
      const { fetchFn } = fakeGoogle([]);
      const { completion } = await beginAuthorization(CONFIG, store, { fetchFn, timeoutMs: 30 });
      await expect(completion).rejects.toThrow(/tiempo/i);
    });
  });

  describe("getAccessToken", () => {
    it("fails with guidance when Gmail was never connected", async () => {
      const { fetchFn } = fakeGoogle([]);
      await expect(getAccessToken(CONFIG, store, { fetchFn })).rejects.toThrow(/conectar_gmail/);
    });

    it("reuses a valid access token without calling Google", async () => {
      store.write({ refreshToken: "rt", accessToken: "at", expiresAt: 10_000_000 });
      const { fetchFn, calls } = fakeGoogle([]);
      expect(await getAccessToken(CONFIG, store, { fetchFn, now: () => 1_000 })).toBe("at");
      expect(calls).toHaveLength(0);
    });

    it("refreshes an expired access token and saves the new one", async () => {
      store.write({ refreshToken: "rt", accessToken: "old", expiresAt: 500 });
      const { fetchFn, calls } = fakeGoogle([{ json: { access_token: "new", expires_in: 3600 } }]);
      expect(await getAccessToken(CONFIG, store, { fetchFn, now: () => 1_000 })).toBe("new");
      expect(calls[0]!.body.get("grant_type")).toBe("refresh_token");
      expect(calls[0]!.body.get("refresh_token")).toBe("rt");
      expect(store.read()).toMatchObject({ refreshToken: "rt", accessToken: "new" });
    });

    it("clears the stored token when Google says the grant is no longer valid", async () => {
      store.write({ refreshToken: "rt", expiresAt: 0 });
      const { fetchFn } = fakeGoogle([{ status: 400, json: { error: "invalid_grant" } }]);
      await expect(getAccessToken(CONFIG, store, { fetchFn, now: () => 1_000 })).rejects.toThrow(/conectar_gmail/);
      expect(store.read()).toBeNull();
      expect(existsSync(join(dir, "gmail-token.json"))).toBe(false);
    });
  });
});
