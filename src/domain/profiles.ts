import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { runProfile } from "../parsers/engine.js";
import { profileSchema } from "../parsers/profile.js";
import type { BankProfile } from "../parsers/profile.js";
import { normalizeEmailText } from "../parsers/text.js";

const ADDRESS_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const DOMAIN_KEY_RE = /^@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const MAX_BODY_CHARS = 20_000;

export interface StoredProfile {
  readonly sender: string;
  readonly profile: BankProfile;
  readonly samples: number;
  readonly updatedAt: string;
}

/** A sender is a full address (`avisos@banco.com`) or a whole domain (`@banco.com` or `banco.com`). */
export function normalizeSenderKey(input: string): string {
  const raw = input.trim().toLowerCase();
  const key = raw.includes("@") ? raw : `@${raw}`;
  if (!ADDRESS_RE.test(key) && !DOMAIN_KEY_RE.test(key)) {
    throw new Error(`Invalid sender "${input.trim().slice(0, 60)}": use an address (avisos@banco.com) or a domain (banco.com)`);
  }
  return key;
}

export function parseProfile(input: unknown): BankProfile {
  const result = profileSchema.safeParse(input);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "profile"}: ${i.message}`).join("; ");
    throw new Error(`Invalid format rules: ${detail}`);
  }
  return result.data;
}

export function saveProfile(db: DatabaseSync, sender: string, profile: BankProfile, samples: number, now: () => string = () => new Date().toISOString()): void {
  db.prepare(
    `INSERT INTO parser_profiles (sender, bank, profile_json, samples, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(sender) DO UPDATE SET bank = excluded.bank, profile_json = excluded.profile_json, samples = excluded.samples, updated_at = excluded.updated_at`,
  ).run(normalizeSenderKey(sender), profile.bank, JSON.stringify(profile), samples, now());
}

function fromRow(row: { sender: string; profile_json: string; samples: number; updated_at: string }): StoredProfile {
  return { sender: row.sender, profile: parseProfile(JSON.parse(row.profile_json)), samples: Number(row.samples), updatedAt: row.updated_at };
}

export function listProfiles(db: DatabaseSync): StoredProfile[] {
  const rows = db.prepare("SELECT sender, profile_json, samples, updated_at FROM parser_profiles ORDER BY sender").all() as unknown as Parameters<typeof fromRow>[0][];
  return rows.map(fromRow);
}

export function removeProfile(db: DatabaseSync, sender: string): boolean {
  return Number(db.prepare("DELETE FROM parser_profiles WHERE sender = ?").run(normalizeSenderKey(sender)).changes) > 0;
}

/** Profile for a bare sender address: the exact address first, then its domain, then parent domains. */
export function findProfile(db: DatabaseSync, address: string): StoredProfile | null {
  const domain = address.split("@")[1] ?? "";
  const labels = domain.split(".");
  const keys = [address, ...labels.slice(0, -1).map((_, i) => `@${labels.slice(i).join(".")}`)];
  const get = db.prepare("SELECT sender, profile_json, samples, updated_at FROM parser_profiles WHERE sender = ?");
  for (const key of keys) {
    const row = get.get(key) as unknown as Parameters<typeof fromRow>[0] | undefined;
    if (row) return fromRow(row);
  }
  return null;
}

/* ---------- testing rules against confirmed examples ---------- */

export const sampleSchema = z.object({
  subject: z.string().max(300),
  /** The notice text. It may be trimmed to the relevant part; legal footers are not needed. */
  body: z.string().min(1).max(MAX_BODY_CHARS),
  /** When the mail arrived (ISO 8601); only matters when the notice has no date of its own. */
  receivedAt: z.string().optional(),
  expected: z.union([
    z.object({ skip: z.literal(true) }),
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
      amount: z.number().int().positive(),
      merchant: z.string().min(1).max(120),
      kind: z.enum(["gasto", "ingreso", "transferencia_propia"]),
    }),
  ]),
});
export type Sample = z.infer<typeof sampleSchema>;

export interface SampleResult {
  readonly index: number;
  readonly subject: string;
  readonly pass: boolean;
  readonly status: string;
  readonly problems: readonly string[];
  readonly got?: unknown;
}

const same = (a: string, b: string): boolean => normalizeEmailText(a).toLowerCase() === normalizeEmailText(b).toLowerCase();

export function testProfile(profile: BankProfile, samples: readonly Sample[]): SampleResult[] {
  return samples.map((sample, index) => {
    const receivedAt = sample.receivedAt ? Date.parse(sample.receivedAt) : Date.now();
    const result = runProfile(profile, { subject: sample.subject, text: sample.body, receivedAt: Number.isNaN(receivedAt) ? Date.now() : receivedAt });
    const problems: string[] = [];
    const exp = sample.expected;
    if ("skip" in exp) {
      if (result.status !== "skip") problems.push(`se esperaba que se omitiera, pero el resultado fue "${result.status}"`);
    } else if (result.status !== "movement") {
      problems.push(`se esperaba un movimiento, pero el resultado fue "${result.status}"${result.status === "review" ? ` (${result.reason})` : ""}`);
    } else {
      const got = result.movement;
      if (got.date !== exp.date) problems.push(`fecha: esperada ${exp.date}, leída ${got.date}`);
      if (got.amount !== exp.amount) problems.push(`monto: esperado ${exp.amount}, leído ${got.amount}`);
      if (got.kind !== exp.kind) problems.push(`tipo: esperado ${exp.kind}, leído ${got.kind}`);
      if (!same(got.merchant, exp.merchant)) problems.push(`comercio: esperado "${exp.merchant}", leído "${got.merchant}"`);
    }
    return { index, subject: sample.subject.slice(0, 60), pass: problems.length === 0, status: result.status, problems, ...(result.status === "movement" ? { got: result.movement } : {}) };
  });
}
