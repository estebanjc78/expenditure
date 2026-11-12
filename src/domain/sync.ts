import type { DatabaseSync } from "node:sqlite";
import type { MailMessage, MailSource } from "../gmail/source.js";
import { cleanText } from "./sanitize.js";
import { parserForSender } from "../parsers/index.js";
import type { ParseResult } from "../parsers/types.js";
import { addMovements, filterUnregistered, MAX_BATCH } from "./batch.js";
import { gmailSenderQuery, listSenders } from "./senders.js";
import type { MovementInput } from "./types.js";

export const DEFAULT_MAX_MESSAGES = 150;
const MAX_SCAN = 2000;
const FETCH_CONCURRENCY = 6;
const MAX_LISTED = 20;
const MAX_SUBJECT_CHARS = 80;
const MAX_ERROR_CHARS = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SyncOptions {
  /** First day to look at, YYYY-MM-DD. */
  readonly since: string;
  /** Last day to look at (inclusive), YYYY-MM-DD. Defaults to today and later. */
  readonly until?: string;
  /** Mails processed per call; run again if `remaining` > 0. */
  readonly maxMessages?: number;
}

export interface UncategorizedMerchant {
  readonly merchant: string;
  readonly count: number;
  readonly total: number;
}

export interface SyncSummary {
  readonly scanned: number;
  readonly alreadyKnown: number;
  readonly processed: number;
  readonly registered: number;
  readonly duplicates: number;
  readonly skipped: number;
  readonly review: readonly { id: string; subject: string; reason: string }[];
  readonly unrecognized: readonly { id: string; subject: string }[];
  readonly unrecognizedCount: number;
  readonly failed: readonly { id: string; error: string }[];
  readonly remaining: number;
  readonly uncategorizedMerchants: readonly UncategorizedMerchant[];
}

interface Fetched {
  readonly id: string;
  readonly message?: MailMessage;
  readonly error?: string;
}

function assertDate(value: string, name: string): void {
  const t = Date.parse(`${value}T00:00:00Z`);
  if (!DATE_RE.test(value) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${name}: must be a real date in YYYY-MM-DD format`);
  }
}

const gmailDate = (iso: string): string => iso.replaceAll("-", "/");

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function buildQuery(db: DatabaseSync, options: SyncOptions): string {
  assertDate(options.since, "since");
  if (options.until !== undefined) assertDate(options.until, "until");
  const senders = listSenders(db);
  if (senders.length === 0) {
    throw new Error("No hay remitentes autorizados: agrega uno con agregar_remitente antes de sincronizar");
  }
  const parts = [gmailSenderQuery(senders), `after:${gmailDate(options.since)}`];
  if (options.until !== undefined) parts.push(`before:${gmailDate(nextDay(options.until))}`);
  return parts.join(" ");
}

function loggedIds(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT message_id FROM mail_log").all() as { message_id: string }[];
  return new Set(rows.map((r) => r.message_id));
}

async function fetchAll(source: MailSource, ids: readonly string[]): Promise<Fetched[]> {
  const out: Fetched[] = [];
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const chunk = ids.slice(i, i + FETCH_CONCURRENCY);
    out.push(
      ...(await Promise.all(
        chunk.map(async (id): Promise<Fetched> => {
          try {
            return { id, message: await source.getMessage(id) };
          } catch (err) {
            return { id, error: err instanceof Error ? err.message : String(err) };
          }
        }),
      )),
    );
  }
  return out;
}

function uncategorizedMerchants(db: DatabaseSync): UncategorizedMerchant[] {
  return db
    .prepare(
      `SELECT MIN(merchant) AS merchant, COUNT(*) AS count, SUM(amount) AS total
       FROM movements WHERE kind = 'gasto' AND category IS NULL
       GROUP BY lower(trim(merchant)) ORDER BY total DESC LIMIT 100`,
    )
    .all() as unknown as UncategorizedMerchant[];
}

interface Classified {
  readonly inputs: MovementInput[];
  readonly skipped: { id: string; subject: string }[];
  readonly review: { id: string; subject: string; reason: string }[];
  readonly unrecognized: { id: string; subject: string }[];
}

function parseMessage(message: MailMessage): { bank: string | null; result: ParseResult } {
  const parser = parserForSender(message.from);
  if (!parser) return { bank: null, result: { status: "unrecognized" } };
  try {
    return { bank: parser.bank, result: parser.parse({ subject: message.subject, text: message.body, receivedAt: message.receivedAt }) };
  } catch {
    // One malformed mail must never abort the whole sync: report it as unreadable instead.
    return { bank: parser.bank, result: { status: "unrecognized" } };
  }
}

function classify(fetched: readonly Fetched[]): Classified & { failed: { id: string; error: string }[] } {
  const inputs: MovementInput[] = [];
  const skipped: { id: string; subject: string }[] = [];
  const review: { id: string; subject: string; reason: string }[] = [];
  const unrecognized: { id: string; subject: string }[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const f of fetched) {
    if (!f.message) {
      failed.push({ id: f.id, error: cleanText(f.error ?? "unknown error", MAX_ERROR_CHARS) });
      continue;
    }
    const { bank, result } = parseMessage(f.message);
    const ref = { id: f.id, subject: cleanText(f.message.subject, MAX_SUBJECT_CHARS) };
    if (result.status === "movement" && bank) inputs.push({ sourceId: f.id, bank, ...result.movement });
    else if (result.status === "skip") skipped.push(ref);
    else if (result.status === "review") review.push({ ...ref, reason: result.reason });
    else unrecognized.push(ref);
  }
  return { inputs, skipped, review, unrecognized, failed };
}

function register(db: DatabaseSync, inputs: readonly MovementInput[]) {
  let registered = 0;
  let duplicates = 0;
  const failed: { id: string; error: string }[] = [];
  for (let i = 0; i < inputs.length; i += MAX_BATCH) {
    const chunk = inputs.slice(i, i + MAX_BATCH);
    const { results } = addMovements(db, chunk);
    for (const r of results) {
      if (r.error) failed.push({ id: chunk[r.index]?.sourceId ?? "?", error: r.error });
      else if (r.duplicate) duplicates += 1;
      else registered += 1;
    }
  }
  return { registered, duplicates, failed };
}

function logSkipped(db: DatabaseSync, skipped: readonly { id: string; subject: string }[]): void {
  const stmt = db.prepare("INSERT OR IGNORE INTO mail_log (message_id, outcome, subject) VALUES (?, 'skip', ?)");
  for (const s of skipped) stmt.run(s.id, s.subject);
}

/**
 * Downloads the mails of the authorized senders for a date range, extracts the movements with the
 * per-bank parsers (no language model involved) and stores them. Mails already registered or already
 * discarded are not downloaded again. Safe to run repeatedly: a second run only handles new mails.
 */
export async function syncMail(db: DatabaseSync, source: MailSource, options: SyncOptions): Promise<SyncSummary> {
  const query = buildQuery(db, options);
  const ids = [...new Set(await source.listMessageIds(query, MAX_SCAN))];
  const logged = loggedIds(db);
  const pending = filterUnregistered(db, ids).filter((id) => !logged.has(id));
  const batch = pending.slice(0, options.maxMessages ?? DEFAULT_MAX_MESSAGES);

  const c = classify(await fetchAll(source, batch));
  const saved = register(db, c.inputs);
  logSkipped(db, c.skipped);

  return {
    scanned: ids.length,
    alreadyKnown: ids.length - pending.length,
    processed: batch.length,
    registered: saved.registered,
    duplicates: saved.duplicates,
    skipped: c.skipped.length,
    review: c.review.slice(0, MAX_LISTED),
    unrecognized: c.unrecognized.slice(0, MAX_LISTED),
    unrecognizedCount: c.unrecognized.length,
    failed: [...c.failed, ...saved.failed].slice(0, MAX_LISTED),
    remaining: pending.length - batch.length,
    uncategorizedMerchants: uncategorizedMerchants(db),
  };
}
