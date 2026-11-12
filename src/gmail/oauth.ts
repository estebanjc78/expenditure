import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60_000;
const RECONNECT_HINT = "vuelve a llamar a conectar_gmail";

export interface GoogleClientConfig {
  readonly clientId: string;
  readonly clientSecret?: string;
}

export interface StoredToken {
  readonly refreshToken: string;
  readonly accessToken?: string;
  readonly expiresAt?: number;
}

export interface OAuthDeps {
  readonly fetchFn?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

/** Client id/secret come from env vars or from the JSON downloaded in Google Cloud (`google-client.json`). */
export function loadClientConfig(dir: string, env: Readonly<Record<string, string | undefined>>): GoogleClientConfig | null {
  const id = env.GASTOS_GOOGLE_CLIENT_ID?.trim();
  if (id) return { clientId: id, clientSecret: env.GASTOS_GOOGLE_CLIENT_SECRET?.trim() || undefined };
  const file = join(dir, "google-client.json");
  if (!existsSync(file)) return null;
  const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, { client_id?: string; client_secret?: string } | undefined>;
  const section = json.installed ?? json.web ?? (json as { client_id?: string; client_secret?: string });
  return section?.client_id ? { clientId: section.client_id, clientSecret: section.client_secret } : null;
}

/** Token file with owner-only permissions. */
export class TokenStore {
  constructor(private readonly file: string) {}

  read(): StoredToken | null {
    if (!existsSync(this.file)) return null;
    return JSON.parse(readFileSync(this.file, "utf8")) as StoredToken;
  }

  write(token: StoredToken): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, JSON.stringify(token), { mode: 0o600 });
    chmodSync(this.file, 0o600);
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function requestToken(params: Record<string, string>, fetchFn: typeof fetch): Promise<{ ok: boolean; body: TokenResponse }> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { ok: res.ok, body: (await res.json()) as TokenResponse };
}

const base64url = (buf: Buffer): string => buf.toString("base64url");

function withClient(config: GoogleClientConfig, params: Record<string, string>): Record<string, string> {
  return { client_id: config.clientId, ...(config.clientSecret ? { client_secret: config.clientSecret } : {}), ...params };
}

/**
 * Starts the Google consent flow (authorization code + PKCE) with a loopback listener on 127.0.0.1.
 * Returns the URL for the user to open and a promise that resolves once the token is stored.
 */
export async function beginAuthorization(
  config: GoogleClientConfig,
  store: TokenStore,
  deps: OAuthDeps = {},
): Promise<{ url: string; completion: Promise<void> }> {
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(16));
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const completion = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Se agotó el tiempo esperando la autorización de Google")), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    function finish(err?: Error): void {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
      if (err) reject(err);
      else resolve();
    }
    server.on("request", (req, res) => {
      const q = new URL(req.url ?? "/", redirectUri).searchParams;
      if (!q.has("code") && !q.has("error")) {
        res.writeHead(404).end();
        return;
      }
      const failure = q.get("state") !== state ? "Respuesta de Google inválida (state no coincide)" : q.get("error");
      if (failure) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("No se pudo conectar Gmail. Vuelve a Claude.");
        finish(new Error(failure));
        return;
      }
      requestToken(withClient(config, { grant_type: "authorization_code", code: q.get("code")!, code_verifier: verifier, redirect_uri: redirectUri }), fetchFn)
        .then(({ ok, body }) => {
          if (!ok || !body.refresh_token || !body.access_token) throw new Error(body.error_description ?? body.error ?? "Google no entregó el token");
          store.write({ refreshToken: body.refresh_token, accessToken: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 });
          res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Gmail conectado. Ya puedes volver a Claude.");
          finish();
        })
        .catch((err: unknown) => {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("Error al conectar Gmail. Vuelve a Claude.");
          finish(err instanceof Error ? err : new Error(String(err)));
        });
    });
  });

  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
  }).toString();
  return { url: url.toString(), completion };
}

/** Returns a valid access token, refreshing it with the stored refresh token when needed. */
export async function getAccessToken(config: GoogleClientConfig, store: TokenStore, deps: OAuthDeps = {}): Promise<string> {
  const token = store.read();
  if (!token) throw new Error(`Gmail no está conectado: ${RECONNECT_HINT}`);
  const now = (deps.now ?? Date.now)();
  if (token.accessToken && (token.expiresAt ?? 0) > now + EXPIRY_MARGIN_MS) return token.accessToken;

  const { ok, body } = await requestToken(withClient(config, { grant_type: "refresh_token", refresh_token: token.refreshToken }), deps.fetchFn ?? fetch);
  if (!ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      store.clear();
      throw new Error(`La autorización de Gmail venció o fue revocada: ${RECONNECT_HINT}`);
    }
    throw new Error(`No se pudo renovar el acceso a Gmail: ${body.error_description ?? body.error ?? "error desconocido"}`);
  }
  store.write({ ...token, accessToken: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}
