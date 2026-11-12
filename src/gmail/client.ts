import type { MailMessage, MailSource } from "./source.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 500;
const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

interface Part {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Part[];
}

interface ApiMessage {
  id: string;
  internalDate?: string;
  payload?: Part;
}

export interface GmailClientDeps {
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

const decode = (data: string): string => Buffer.from(data, "base64url").toString("utf8");

function findBody(part: Part | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const found = findBody(child, mime);
    if (found !== null) return found;
  }
  return null;
}

function header(part: Part | undefined, name: string): string {
  return part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** Gmail REST API (read-only) as a MailSource. */
export class GmailApiSource implements MailSource {
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly getToken: () => Promise<string>,
    deps: GmailClientDeps = {},
  ) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${API}${path}?${new URLSearchParams(params).toString()}`;
    for (let attempt = 1; ; attempt += 1) {
      const res = await this.fetchFn(url, { headers: { authorization: `Bearer ${await this.getToken()}` } });
      if (res.ok) return (await res.json()) as T;
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        await this.sleep(500 * attempt);
        continue;
      }
      const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? res.statusText;
      throw new Error(`Gmail API ${res.status}: ${detail}`);
    }
  }

  async listMessageIds(query: string, limit: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ messages?: { id: string }[]; nextPageToken?: string }>("/messages", {
        q: query,
        maxResults: String(Math.min(PAGE_SIZE, limit - ids.length)),
        ...(pageToken ? { pageToken } : {}),
      });
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < limit);
    return ids.slice(0, limit);
  }

  async getMessage(id: string): Promise<MailMessage> {
    const m = await this.get<ApiMessage>(`/messages/${encodeURIComponent(id)}`, { format: "full" });
    const body = findBody(m.payload, "text/plain") ?? findBody(m.payload, "text/html") ?? decode(m.payload?.body?.data ?? "");
    return {
      id: m.id,
      subject: header(m.payload, "Subject"),
      from: header(m.payload, "From"),
      receivedAt: Number(m.internalDate ?? 0),
      body,
    };
  }
}
