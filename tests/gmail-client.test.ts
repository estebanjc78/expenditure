import { describe, expect, it } from "vitest";
import { GmailApiSource } from "../src/gmail/client.js";

const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

type Handler = (url: URL) => { status?: number; json: unknown };

function fakeFetch(handler: Handler): { fetchFn: typeof fetch; urls: URL[]; auth: (string | null)[] } {
  const urls: URL[] = [];
  const auth: (string | null)[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    auth.push(new Headers(init?.headers).get("authorization"));
    const r = handler(url);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetchFn, urls, auth };
}

const source = (fetchFn: typeof fetch) =>
  new GmailApiSource(async () => "token-123", { fetchFn, sleep: async () => undefined });

describe("GmailApiSource.listMessageIds", () => {
  it("follows pagination and stops at the limit", async () => {
    const { fetchFn, urls, auth } = fakeFetch((url) =>
      url.searchParams.get("pageToken") === "p2"
        ? { json: { messages: [{ id: "c" }, { id: "d" }] } }
        : { json: { messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" } },
    );
    const ids = await source(fetchFn).listMessageIds("from:(x@y.z) after:2026/11/01", 3);
    expect(ids).toEqual(["a", "b", "c"]);
    expect(urls[0]!.pathname).toBe("/gmail/v1/users/me/messages");
    expect(urls[0]!.searchParams.get("q")).toBe("from:(x@y.z) after:2026/11/01");
    expect(auth[0]).toBe("Bearer token-123");
  });

  it("returns an empty list when nothing matches", async () => {
    const { fetchFn } = fakeFetch(() => ({ json: { resultSizeEstimate: 0 } }));
    expect(await source(fetchFn).listMessageIds("q", 10)).toEqual([]);
  });
});

describe("GmailApiSource.getMessage", () => {
  const headers = [
    { name: "Subject", value: "Compra Exitosa" },
    { name: "From", value: "BBVA <bbva@bbvanet.com.co>" },
  ];

  it("prefers the text/plain part and decodes base64url UTF-8", async () => {
    const { fetchFn, urls } = fakeFetch(() => ({
      json: {
        id: "m1",
        internalDate: "1794414737000",
        payload: {
          mimeType: "multipart/alternative",
          headers,
          parts: [
            { mimeType: "text/html", body: { data: b64("<p>html</p>") } },
            { mimeType: "text/plain", body: { data: b64("Operación: $1,000.00") } },
          ],
        },
      },
    }));
    const msg = await source(fetchFn).getMessage("m1");
    expect(urls[0]!.pathname).toBe("/gmail/v1/users/me/messages/m1");
    expect(urls[0]!.searchParams.get("format")).toBe("full");
    expect(msg).toEqual({ id: "m1", subject: "Compra Exitosa", from: "BBVA <bbva@bbvanet.com.co>", receivedAt: 1794414737000, body: "Operación: $1,000.00" });
  });

  it("falls back to nested HTML when there is no plain text", async () => {
    const { fetchFn } = fakeFetch(() => ({
      json: {
        id: "m2",
        internalDate: "1",
        payload: {
          mimeType: "multipart/mixed",
          headers,
          parts: [{ mimeType: "multipart/related", parts: [{ mimeType: "text/html", body: { data: b64("<b>Valor</b>") } }] }],
        },
      },
    }));
    expect((await source(fetchFn).getMessage("m2")).body).toBe("<b>Valor</b>");
  });

  it("reads a single-part message body", async () => {
    const { fetchFn } = fakeFetch(() => ({ json: { id: "m3", internalDate: "5", payload: { mimeType: "text/plain", headers, body: { data: b64("hola") } } } }));
    expect((await source(fetchFn).getMessage("m3")).body).toBe("hola");
  });
});

describe("GmailApiSource errors", () => {
  it("retries transient failures", async () => {
    let calls = 0;
    const { fetchFn } = fakeFetch(() => (++calls < 3 ? { status: 503, json: { error: { message: "busy" } } } : { json: { messages: [{ id: "a" }] } }));
    expect(await source(fetchFn).listMessageIds("q", 5)).toEqual(["a"]);
    expect(calls).toBe(3);
  });

  it("does not retry permission errors and explains them", async () => {
    let calls = 0;
    const { fetchFn } = fakeFetch(() => (calls++, { status: 403, json: { error: { message: "Gmail API has not been used in project" } } }));
    await expect(source(fetchFn).listMessageIds("q", 5)).rejects.toThrow(/403.*Gmail API has not been used/);
    expect(calls).toBe(1);
  });
});

describe("GmailApiSource limits", () => {
  it("truncates oversized bodies", async () => {
    const big = "x".repeat(300_000);
    const { fetchFn } = fakeFetch(() => ({
      json: { id: "big", internalDate: "1", payload: { mimeType: "text/plain", headers: [], body: { data: Buffer.from(big).toString("base64url") } } },
    }));
    expect((await source(fetchFn).getMessage("big")).body).toHaveLength(200_000);
  });

  it("stops paginating after a page cap even if Gmail keeps returning tokens", async () => {
    let calls = 0;
    const { fetchFn } = fakeFetch(() => (calls++, { json: { messages: [], nextPageToken: "again" } }));
    expect(await source(fetchFn).listMessageIds("q", 100)).toEqual([]);
    expect(calls).toBe(50);
  });
});
