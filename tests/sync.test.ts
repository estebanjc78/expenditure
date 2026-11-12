import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDb } from "../src/db.js";
import { addSender } from "../src/domain/senders.js";
import { setMerchantRule } from "../src/domain/classify.js";
import { syncMail } from "../src/domain/sync.js";
import type { MailMessage, MailSource } from "../src/gmail/source.js";

const SENDER = "bbva@bbvanet.com.co";
const RECEIVED = Date.parse("2026-11-11T16:32:17Z");

function purchase(merchant: string, amount: string): string {
  return `| Detalles de la operación: |\n| * Tarjeta terminada en: *1234* Fecha de la operación: 2026-11-11* Establecimiento: ${merchant}* Valor: ${amount}* Hora: 11:32 |\n| Gracias por utilizar nuestros canales |`;
}

class FakeSource implements MailSource {
  readonly fetched: string[] = [];
  readonly queries: string[] = [];
  constructor(private readonly messages: readonly MailMessage[]) {}
  async listMessageIds(query: string, limit: number): Promise<string[]> {
    this.queries.push(query);
    return this.messages.slice(0, limit).map((m) => m.id);
  }
  async getMessage(id: string): Promise<MailMessage> {
    this.fetched.push(id);
    const m = this.messages.find((x) => x.id === id);
    if (!m) throw new Error(`no message ${id}`);
    return m;
  }
}

function mail(id: string, subject: string, body: string, from = SENDER): MailMessage {
  return { id, subject, from, receivedAt: RECEIVED, body };
}

describe("syncMail", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = openDb(":memory:");
    addSender(db, SENDER, "BBVA");
  });

  it("registers parsed movements, skips non-movements and reports uncategorized merchants", async () => {
    const source = new FakeSource([
      mail("m1", "Compra Exitosa", purchase("Tienda ejemplo", "$134,588.00")),
      mail("m2", "Compra Exitosa", purchase("Tienda ejemplo", "$20,000.00")),
      mail("m3", "Compra No Exitosa", "Compra en Rappi no fue exitosa"),
    ]);
    const summary = await syncMail(db, source, { since: "2026-11-01" });

    expect(summary.registered).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.unrecognized).toEqual([]);
    expect(summary.uncategorizedMerchants).toEqual([{ merchant: "Tienda ejemplo", count: 2, total: 154588 }]);
    const rows = db.prepare("SELECT source_id, bank, kind, amount FROM movements ORDER BY source_id").all();
    expect(rows).toEqual([
      { source_id: "m1", bank: "bbva", kind: "gasto", amount: 134588 },
      { source_id: "m2", bank: "bbva", kind: "gasto", amount: 20000 },
    ]);
  });

  it("builds a Gmail query from the senders and the date range (until is inclusive)", async () => {
    const source = new FakeSource([]);
    await syncMail(db, source, { since: "2026-09-01", until: "2026-10-31" });
    expect(source.queries[0]).toBe(`from:(${SENDER}) after:2026/09/01 before:2026/11/01`);
  });

  it("does not download messages that are already registered or already discarded", async () => {
    const messages = [
      mail("m1", "Compra Exitosa", purchase("Tienda ejemplo", "$10,000.00")),
      mail("m2", "Compra No Exitosa", "no fue exitosa"),
    ];
    await syncMail(db, new FakeSource(messages), { since: "2026-11-01" });

    const second = new FakeSource(messages);
    const summary = await syncMail(db, second, { since: "2026-11-01" });
    expect(second.fetched).toEqual([]);
    expect(summary.registered).toBe(0);
    expect(summary.alreadyKnown).toBe(2);
  });

  it("applies known merchant rules so those expenses need no classification", async () => {
    setMerchantRule(db, "Tienda ejemplo", "supermercado");
    const summary = await syncMail(db, new FakeSource([mail("m1", "Compra Exitosa", purchase("Tienda ejemplo", "$10,000.00"))]), { since: "2026-11-01" });
    expect(summary.uncategorizedMerchants).toEqual([]);
  });

  it("lists mails it cannot read and retries them next time", async () => {
    const weird = mail("m9", "Algo raro", "Contenido sin formato");
    const first = await syncMail(db, new FakeSource([weird]), { since: "2026-11-01" });
    expect(first.unrecognized).toEqual([{ id: "m9", subject: "Algo raro" }]);

    const retry = new FakeSource([weird]);
    await syncMail(db, retry, { since: "2026-11-01" });
    expect(retry.fetched).toEqual(["m9"]);
  });

  it("flags foreign-currency transfers for review instead of registering them", async () => {
    const body = "Detalles de la operación Tipo de transferencia: Propia - Entre cuentas Divisa: EUR A USD Valor: EUR 4,690.00 Fecha: 2026-11-09 Hora: 10:37 Cuenta de origen: *1111";
    const summary = await syncMail(db, new FakeSource([mail("t1", "Transferencia exitosa", body)]), { since: "2026-11-01" });
    expect(summary.registered).toBe(0);
    expect(summary.review).toHaveLength(1);
    expect(summary.review[0]).toMatchObject({ id: "t1" });
  });

  it("processes at most maxMessages per call and reports how many remain", async () => {
    const messages = ["a", "b", "c"].map((id) => mail(id, "Compra Exitosa", purchase(`Comercio ${id}`, "$1,000.00")));
    const summary = await syncMail(db, new FakeSource(messages), { since: "2026-11-01", maxMessages: 2 });
    expect(summary.registered).toBe(2);
    expect(summary.remaining).toBe(1);

    const rest = await syncMail(db, new FakeSource(messages), { since: "2026-11-01", maxMessages: 2 });
    expect(rest.registered).toBe(1);
    expect(rest.remaining).toBe(0);
  });

  it("reports mails from senders without a parser as unrecognized", async () => {
    addSender(db, "avisos@otrobanco.test");
    const summary = await syncMail(db, new FakeSource([mail("x1", "Aviso", "texto", "avisos@otrobanco.test")]), { since: "2026-11-01" });
    expect(summary.unrecognized).toEqual([{ id: "x1", subject: "Aviso" }]);
  });

  it("fails clearly when there are no authorized senders", async () => {
    const empty = openDb(":memory:");
    await expect(syncMail(empty, new FakeSource([]), { since: "2026-11-01" })).rejects.toThrow(/remitente/i);
  });

  it("rejects malformed dates", async () => {
    await expect(syncMail(db, new FakeSource([]), { since: "01/11/2026" })).rejects.toThrow(/YYYY-MM-DD/);
  });
});
