import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { dashboardData, listMonths } from "../domain/dashboard.js";
import { assertMonth } from "../domain/month.js";
import { bogotaDate } from "../parsers/types.js";
import { renderPage } from "./web-page.js";

const MAX_BANK_CHARS = 40;

export interface PanelOptions {
  readonly now?: () => number;
}

export interface Panel {
  /** `http://127.0.0.1:<port>`, without the token. */
  readonly url: string;
  readonly port: number;
  /** Secret that the page sends in a header; it travels in the URL fragment, which browsers never send over the wire. */
  readonly token: string;
  close(): Promise<void>;
}

/** The address to open in the browser (token in the fragment, optionally a month to start on). */
export function panelUrl(panel: Panel, month?: string): string {
  return `${panel.url}/#t=${panel.token}${month ? `&m=${month}` : ""}`;
}

function sameToken(provided: string | undefined, expected: string): boolean {
  if (provided === undefined || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-resource-policy": "same-origin",
    ...extra,
  };
}

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(status, baseHeaders({ "content-type": "text/plain; charset=utf-8", ...headers }));
  res.end(body);
}

function sendJson(res: ServerResponse, value: unknown, req: IncomingMessage): void {
  const body = JSON.stringify(value);
  const etag = `"${createHash("sha1").update(body).digest("hex").slice(0, 16)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, baseHeaders({ etag }));
    res.end();
    return;
  }
  res.writeHead(200, baseHeaders({ "content-type": "application/json; charset=utf-8", etag }));
  res.end(body);
}

function sendPage(res: ServerResponse): void {
  const nonce = randomBytes(16).toString("base64");
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  res.writeHead(200, baseHeaders({ "content-type": "text/html; charset=utf-8", "content-security-policy": csp }));
  res.end(renderPage(nonce));
}

function monthApi(db: DatabaseSync, url: URL, now: () => number, req: IncomingMessage, res: ServerResponse): void {
  const month = url.searchParams.get("month") ?? "";
  const bank = url.searchParams.get("bank") ?? undefined;
  try {
    assertMonth(month);
  } catch {
    send(res, 400, "month must be YYYY-MM");
    return;
  }
  if (bank !== undefined && bank.length > MAX_BANK_CHARS) {
    send(res, 400, "bank is too long");
    return;
  }
  sendJson(res, dashboardData(db, month, { today: bogotaDate(now()), bank }), req);
}

function handle(db: DatabaseSync, port: number, token: string, now: () => number, req: IncomingMessage, res: ServerResponse): void {
  const host = req.headers.host;
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(res, 403, "Forbidden");
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", { allow: "GET, HEAD" });

  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/") return sendPage(res);
  if (!url.pathname.startsWith("/api/")) return send(res, 404, "Not found");

  const provided = req.headers["x-panel-token"];
  if (!sameToken(Array.isArray(provided) ? provided[0] : provided, token)) return send(res, 401, "Unauthorized");
  if (url.pathname === "/api/months") return sendJson(res, { months: listMonths(db), currentMonth: bogotaDate(now()).slice(0, 7) }, req);
  if (url.pathname === "/api/month") return monthApi(db, url, now, req, res);
  return send(res, 404, "Not found");
}

/**
 * Starts the read-only local dashboard. It binds to 127.0.0.1 on a random port, serves one static page
 * and a JSON API that needs a secret token, and refuses any Host other than loopback (DNS rebinding).
 */
export async function startPanel(db: DatabaseSync, options: PanelOptions = {}): Promise<Panel> {
  const now = options.now ?? Date.now;
  const token = randomBytes(24).toString("base64url");
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  server.on("request", (req, res) => {
    try {
      handle(db, port, token, now, req, res);
    } catch {
      send(res, 500, "Internal error");
    }
  });

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
