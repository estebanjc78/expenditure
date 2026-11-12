import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db.js";
import { createServer } from "../src/server.js";
import type { GmailService } from "../src/gmail/service.js";
import type { MailMessage, MailSource } from "../src/gmail/source.js";

const PURCHASE = `| Detalles de la operación: |\n| * Tarjeta terminada en: *1234* Fecha de la operación: 2026-11-11* Establecimiento: Supertienda olimp* Valor: $207,387.00* Hora: 17:47 |\n| Gracias por utilizar nuestros canales |`;

const messages: MailMessage[] = [
  { id: "m1", subject: "Compra Exitosa", from: "BBVA@bbvanet.com.co", receivedAt: Date.parse("2026-11-11T22:47:12Z"), body: PURCHASE },
];

const source: MailSource = {
  listMessageIds: async () => messages.map((m) => m.id),
  getMessage: async (id) => messages.find((m) => m.id === id)!,
};

function fakeGmail(overrides: Partial<GmailService> = {}): GmailService {
  return {
    status: () => ({ configured: true, connected: true, waitingForUser: false, lastError: null }),
    connect: async () => ({ url: "https://accounts.google.com/o/oauth2/v2/auth?x=1", opened: true }),
    disconnect: () => ({ disconnected: true }),
    source: () => source,
    ...overrides,
  };
}

async function connect(gmail: GmailService) {
  const server = createServer(openDb(":memory:"), { gmail });
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    return { isError: res.isError === true, text: res.content[0]!.text };
  };
}

describe("herramientas de Gmail", () => {
  it("sincronizar_gmail registra los movimientos y devuelve un resumen con los pasos siguientes", async () => {
    const call = await connect(fakeGmail());
    await call("agregar_remitente", { address: "bbva@bbvanet.com.co", label: "BBVA" });

    const res = await call("sincronizar_gmail", { since: "2026-11-01" });
    expect(res.isError).toBe(false);
    const out = JSON.parse(res.text);
    expect(out).toMatchObject({ registered: 1, remaining: 0, uncategorizedMerchants: [{ merchant: "Supertienda olimp", count: 1, total: 207387 }] });
    expect(out.next.join(" ")).toMatch(/clasificar_comercios/);

    const classified = await call("clasificar_comercios", { classifications: [{ merchant: "Supertienda olimp", category: "supermercado" }] });
    expect(JSON.parse(classified.text)).toEqual({ updated: 1, results: [{ merchant: "Supertienda olimp", updated: 1 }] });

    const again = JSON.parse((await call("sincronizar_gmail", { since: "2026-11-01" })).text);
    expect(again).toMatchObject({ registered: 0, alreadyKnown: 1, uncategorizedMerchants: [] });
  });

  it("sincronizar_gmail explica qué hacer cuando Gmail no está conectado", async () => {
    const call = await connect(
      fakeGmail({
        source: () => {
          throw new Error("Gmail no está conectado: llama a conectar_gmail");
        },
      }),
    );
    await call("agregar_remitente", { address: "bbva@bbvanet.com.co" });
    const res = await call("sincronizar_gmail", { since: "2026-11-01" });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/conectar_gmail/);
  });

  it("sincronizar_gmail rechaza fechas mal formadas", async () => {
    const call = await connect(fakeGmail());
    expect((await call("sincronizar_gmail", { since: "01/11/2026" })).isError).toBe(true);
  });

  it("conectar_gmail devuelve la url y estado_gmail el estado", async () => {
    const call = await connect(fakeGmail());
    expect(JSON.parse((await call("conectar_gmail")).text)).toMatchObject({ opened: true, url: expect.stringContaining("accounts.google.com") });
    expect(JSON.parse((await call("estado_gmail")).text)).toEqual({ configured: true, connected: true, waitingForUser: false, lastError: null });
    expect(JSON.parse((await call("desconectar_gmail")).text)).toEqual({ disconnected: true });
  });

  it("conectar_gmail muestra la guía de configuración cuando falta el cliente de Google", async () => {
    const call = await connect(
      fakeGmail({
        connect: async () => {
          throw new Error("Falta la configuración de Google");
        },
      }),
    );
    const res = await call("conectar_gmail");
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/configuración de Google/);
  });
});
