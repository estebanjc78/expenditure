import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";
import { syncMail } from "../src/domain/sync.js";
import { parseProfile, saveProfile } from "../src/domain/profiles.js";
import { resolveParser } from "../src/parsers/resolve.js";
import type { MailMessage, MailSource } from "../src/gmail/source.js";

const SENDER = "avisos@bancoejemplo.com.ar";

const profile = {
  bank: "ejemploar",
  currency: "ARS",
  timezone: "America/Argentina/Buenos_Aires",
  dateFormats: ["DD/MM/YYYY"],
  endMarkers: ["Este mensaje es confidencial"],
  templates: [
    { name: "login", subjectContains: ["Ingreso a Home Banking"], action: "skip" },
    { name: "compra", subjectContains: ["Compra con tarjeta"], kind: "gasto", amount: { label: "Importe" }, merchant: { label: "Comercio" }, date: { label: "Fecha" }, delimiters: ["Tarjeta", "Hora"] },
  ],
};

const body = (merchant: string, date: string, amount: string) =>
  `Tarjeta: Visa terminada en 4321 Comercio: ${merchant} Fecha: ${date} Hora: 17:47 Importe: ${amount} Este mensaje es confidencial`;

const samples = [
  { subject: "Compra con tarjeta de crédito", body: body("Carrefour Express", "12/11/2026", "$ 12.345,67"), expected: { date: "2026-11-12", amount: 12346, merchant: "Carrefour Express", kind: "gasto" } },
  { subject: "Compra con tarjeta de débito", body: body("Farmacia Central", "03/10/2026", "$ 8.900,00"), expected: { date: "2026-10-03", amount: 8900, merchant: "Farmacia Central", kind: "gasto" } },
  { subject: "Ingreso a Home Banking", body: "Ingresaste a tu cuenta", expected: { skip: true } },
  { subject: "Compra con tarjeta", body: body("Cine Mayor", "20/10/2026", "$ 15.000,00"), expected: { date: "2026-10-20", amount: 15000, merchant: "Cine Mayor", kind: "gasto" } },
];

async function connect() {
  const db = openDb(":memory:");
  const server = createServer(db);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = res.content[0]!.text;
    return { isError: res.isError === true, text, json: res.isError ? null : JSON.parse(text) };
  };
  return { db, call };
}

describe("learning a bank from examples (formatos_banco / configurar_formato_banco)", () => {
  it("lists built-in formats and the authorized senders that still need rules", async () => {
    const { call } = await connect();
    await call("agregar_remitente", { address: SENDER });
    await call("agregar_remitente", { address: "BBVA@bbvanet.com.co" });
    const out = (await call("formatos_banco")).json;
    expect(out.builtIn[0].bank).toBe("bbva");
    expect(out.learned).toEqual([]);
    expect(out.authorizedWithoutFormat).toEqual([SENDER]);
  });

  it("tests rules without saving when dryRun is set", async () => {
    const { call } = await connect();
    const out = (await call("configurar_formato_banco", { sender: SENDER, profile, samples: samples.slice(0, 2), dryRun: true })).json;
    expect(out).toMatchObject({ saved: false, dryRun: true, passing: 2, examples: 2 });
    expect((await call("formatos_banco")).json.learned).toEqual([]);
  });

  it("refuses to save with fewer than 3 examples", async () => {
    const { call } = await connect();
    const res = await call("configurar_formato_banco", { sender: SENDER, profile, samples: samples.slice(0, 2) });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/al menos 3/);
  });

  it("does not save when an example fails, and says exactly what was read wrong", async () => {
    const { call } = await connect();
    const wrong = [...samples.slice(0, 3), { ...samples[3]!, expected: { ...(samples[3]!.expected as object), amount: 99999 } }];
    const out = (await call("configurar_formato_banco", { sender: SENDER, profile, samples: wrong })).json;
    expect(out.saved).toBe(false);
    expect(out.passing).toBe(3);
    expect(out.results[3].problems[0]).toMatch(/monto: esperado 99999, leído 15000/);
    expect((await call("formatos_banco")).json.learned).toEqual([]);
  });

  it("lets the assistant fix wrong rules: the footer leaks into the merchant, then disappears after adding an end marker", async () => {
    const { call } = await connect();
    const lastField = [{
      subject: "Compra con tarjeta", body: "Importe: $ 15.000,00 Fecha: 20/10/2026 Comercio: Cine Mayor Este mensaje es confidencial y puede contener información",
      expected: { date: "2026-10-20", amount: 15000, merchant: "Cine Mayor", kind: "gasto" },
    }];
    const broken = { ...profile, endMarkers: [] };
    const first = (await call("configurar_formato_banco", { sender: SENDER, profile: broken, samples: lastField, dryRun: true })).json;
    expect(first.passing).toBe(0);
    expect(first.results[0].problems[0]).toMatch(/comercio: esperado "Cine Mayor", leído "Cine Mayor Este mensaje/);
    const fixed = (await call("configurar_formato_banco", { sender: SENDER, profile, samples: lastField, dryRun: true })).json;
    expect(fixed.passing).toBe(1);
  });

  it("saves rules once every example passes, then lists them", async () => {
    const { call } = await connect();
    const out = (await call("configurar_formato_banco", { sender: SENDER, profile, samples })).json;
    expect(out).toMatchObject({ saved: true, passing: 4, examples: 4, bank: "ejemploar" });
    const listed = (await call("formatos_banco")).json;
    expect(listed.learned).toEqual([expect.objectContaining({ sender: SENDER, bank: "ejemploar", currency: "ARS", templates: ["login", "compra"], examplesUsed: 4 })]);
  });

  it("accepts a whole domain as the sender", async () => {
    const { call } = await connect();
    expect((await call("configurar_formato_banco", { sender: "bancoejemplo.com.ar", profile, samples })).json.sender).toBe("@bancoejemplo.com.ar");
  });

  it("explains invalid rules clearly", async () => {
    const { call } = await connect();
    const res = await call("configurar_formato_banco", { sender: SENDER, profile: { bank: "x1", templates: [{ name: "t", subjectContains: ["a"], kind: "gasto", amount: { regex: "(oops" }, merchant: { fixed: "M" } }] }, samples, dryRun: true });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/invalid regex/);
  });

  it("removes learned rules", async () => {
    const { call } = await connect();
    await call("configurar_formato_banco", { sender: SENDER, profile, samples });
    expect((await call("eliminar_formato_banco", { sender: SENDER })).json).toEqual({ removed: true });
    expect((await call("eliminar_formato_banco", { sender: SENDER })).json).toEqual({ removed: false });
  });
});

describe("learned rules in the sync", () => {
  const mail = (id: string, from: string, subject: string, text: string): MailMessage => ({ id, subject, from, receivedAt: Date.parse("2026-11-12T20:00:00Z"), body: text });
  const source = (msgs: MailMessage[]): MailSource => ({ listMessageIds: async () => msgs.map((m) => m.id), getMessage: async (id) => msgs.find((m) => m.id === id)! });

  it("asks for rules (needsFormat) when a sender has none, then registers once they are learned", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO senders (address) VALUES (?)").run(SENDER);
    const msgs = [
      mail("g1", SENDER, "Compra con tarjeta de crédito", body("Carrefour Express", "12/11/2026", "$ 12.345,67")),
      mail("g2", SENDER, "Ingreso a Home Banking", "Ingresaste"),
    ];
    const first = await syncMail(db, source(msgs), { since: "2026-11-01" });
    expect(first.registered).toBe(0);
    expect(first.needsFormat).toEqual([{ sender: SENDER, count: 2, subjects: ["Compra con tarjeta de crédito", "Ingreso a Home Banking"] }]);

    saveProfile(db, SENDER, parseProfile(profile), 4);
    const second = await syncMail(db, source(msgs), { since: "2026-11-01" });
    expect(second).toMatchObject({ registered: 1, skipped: 1, needsFormat: [] });
    expect(db.prepare("SELECT bank, merchant, amount, date FROM movements").all()).toEqual([{ bank: "ejemploar", merchant: "Carrefour Express", amount: 12346, date: "2026-11-12" }]);
  });

  it("gives learned rules priority over the built-in ones (so a bank can be re-taught when its mails change)", () => {
    const db = openDb(":memory:");
    expect(resolveParser(db, "BBVA <bbva@bbvanet.com.co>")?.bank).toBe("bbva");
    saveProfile(db, "@bbvanet.com.co", parseProfile({ ...profile, bank: "bbva2" }), 3);
    expect(resolveParser(db, "BBVA <bbva@bbvanet.com.co>")?.bank).toBe("bbva2");
    expect(resolveParser(db, "otro@desconocido.test")).toBeNull();
  });

  it("matches the exact address before the domain", () => {
    const db = openDb(":memory:");
    saveProfile(db, "@bancoejemplo.com.ar", parseProfile({ ...profile, bank: "dominio" }), 3);
    saveProfile(db, SENDER, parseProfile({ ...profile, bank: "direccion" }), 3);
    expect(resolveParser(db, SENDER)?.bank).toBe("direccion");
    expect(resolveParser(db, "otra@bancoejemplo.com.ar")?.bank).toBe("dominio");
    expect(resolveParser(db, "x@mail.bancoejemplo.com.ar")?.bank).toBe("dominio");
  });
});
