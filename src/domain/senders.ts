import type { DatabaseSync } from "node:sqlite";

export interface Sender {
  readonly address: string;
  readonly label: string | null;
}

// Strict shape: the address is pasted into a Gmail search query, so it must not carry operators or parentheses.
const SENDER_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

function normalizeAddress(address: string): string {
  const a = address.trim().toLowerCase();
  if (!a.includes("@")) {
    throw new Error(`Invalid sender address "${address.trim()}": it must contain @`);
  }
  if (!SENDER_RE.test(a)) {
    throw new Error(`Invalid sender address "${address.trim().slice(0, 60)}": use only letters, digits and . _ % + - around a single @`);
  }
  return a;
}

export function addSender(
  db: DatabaseSync,
  address: string,
  label?: string,
): { address: string; added: boolean } {
  const a = normalizeAddress(address);
  const res = db
    .prepare("INSERT INTO senders (address, label) VALUES (?, ?) ON CONFLICT(address) DO NOTHING")
    .run(a, label ?? null);
  return { address: a, added: Number(res.changes) > 0 };
}

export function removeSender(db: DatabaseSync, address: string): { removed: boolean } {
  const res = db.prepare("DELETE FROM senders WHERE address = ?").run(address.trim().toLowerCase());
  return { removed: Number(res.changes) > 0 };
}

export function listSenders(db: DatabaseSync): Sender[] {
  return db.prepare("SELECT address, label FROM senders ORDER BY address").all() as unknown as Sender[];
}

export function gmailSenderQuery(senders: readonly Sender[]): string {
  if (senders.length === 0) return "";
  return `from:(${senders.map((s) => s.address).join(" OR ")})`;
}
