import { describe, expect, it } from "vitest";
import { runProfile } from "../src/parsers/engine.js";
import { parseProfile } from "../src/domain/profiles.js";
import { parseDateText } from "../src/parsers/date.js";
import { parseMoney } from "../src/parsers/amount.js";
import { safeMatch, UnsafeRegexError } from "../src/parsers/safe-regex.js";

// A made-up Argentine bank: "Banco Ejemplo AR", dd/mm/yyyy dates, "$ 12.345,67" amounts.
const ARGENTINA = parseProfile({
  bank: "ejemploar",
  currency: "ARS",
  timezone: "America/Argentina/Buenos_Aires",
  dateFormats: ["DD/MM/YYYY"],
  endMarkers: ["Este mensaje es confidencial"],
  templates: [
    { name: "login", subjectContains: ["Ingreso a Home Banking"], action: "skip", skipReason: "Aviso de ingreso" },
    { name: "compra", subjectContains: ["Compra con tarjeta"], kind: "gasto", amount: { label: "Importe" }, merchant: { label: "Comercio" }, date: { label: "Fecha" }, delimiters: ["Tarjeta", "Hora"] },
    { name: "transferencia recibida", subjectContains: ["Recibiste una transferencia"], kind: "ingreso", amount: { label: "Monto recibido" }, merchant: { label: "Ordenante" }, date: { label: "Fecha" }, delimiters: ["CBU destino"] },
  ],
});

const purchase = `Hola Cliente, realizaste una compra con tu tarjeta.
Tarjeta: Visa terminada en 4321
Comercio: Carrefour Express
Fecha: 12/11/2026
Hora: 17:47
Importe: $ 12.345,67
Este mensaje es confidencial y puede contener información privilegiada.`;

describe("learned rules engine (Argentine example)", () => {
  it("reads a purchase with dd/mm/yyyy dates and Argentine amounts", () => {
    expect(runProfile(ARGENTINA, { subject: "Compra con tarjeta de crédito", text: purchase, receivedAt: Date.parse("2026-11-12T20:47:00Z") })).toEqual({
      status: "movement",
      movement: { date: "2026-11-12", amount: 12346, merchant: "Carrefour Express", kind: "gasto" },
    });
  });

  it("reads received money", () => {
    const text = "Ordenante: Juan Perez CBU destino: 0000 Fecha: 03/10/2026 Monto recibido: $ 1.500.000,00 Este mensaje es confidencial";
    expect(runProfile(ARGENTINA, { subject: "Recibiste una transferencia", text, receivedAt: 0 })).toMatchObject({
      status: "movement",
      movement: { date: "2026-10-03", amount: 1500000, merchant: "Juan Perez", kind: "ingreso" },
    });
  });

  it("skips notices that are not movements", () => {
    expect(runProfile(ARGENTINA, { subject: "Ingreso a Home Banking", text: "Ingresaste a tu cuenta", receivedAt: 0 }).status).toBe("skip");
  });

  it("does not read the legal footer into the last field", () => {
    const r = runProfile(ARGENTINA, { subject: "Compra con tarjeta", text: purchase.replace("Importe: $ 12.345,67", "Importe: $ 100,00"), receivedAt: 0 });
    expect(r.status === "movement" && r.movement.amount).toBe(100);
  });

  it("reports amounts in another currency instead of registering them", () => {
    const text = purchase.replace("$ 12.345,67", "U$S 50,00");
    const r = runProfile(ARGENTINA, { subject: "Compra con tarjeta", text, receivedAt: 0 });
    expect(r.status).toBe("review");
  });

  it("returns unrecognized for a mail no template applies to, or when a field is missing", () => {
    expect(runProfile(ARGENTINA, { subject: "Promoción", text: "Descuentos", receivedAt: 0 }).status).toBe("unrecognized");
    expect(runProfile(ARGENTINA, { subject: "Compra con tarjeta", text: "Comercio: X Fecha: 12/11/2026", receivedAt: 0 }).status).toBe("unrecognized");
  });

  it("uses the mail date in the profile's time zone when the notice has no date", () => {
    const p = parseProfile({
      bank: "sinfecha", currency: "ARS", timezone: "America/Argentina/Buenos_Aires",
      templates: [{ name: "c", subjectContains: ["Compra"], kind: "gasto", amount: { label: "Monto" }, merchant: { label: "En" }, delimiters: [] }],
    });
    // 2026-11-12T01:30Z is still the 11th in Buenos Aires (UTC-3)
    const r = runProfile(p, { subject: "Compra", text: "En: Kiosco Monto: $ 500,00", receivedAt: Date.parse("2026-11-12T01:30:00Z") });
    expect(r).toMatchObject({ status: "movement", movement: { date: "2026-11-11", amount: 500, merchant: "Kiosco" } });
  });

  it("works with regex and fixed extractors (a Mexican example with named months)", () => {
    const mx = parseProfile({
      bank: "ejemplomx", currency: "MXN", timezone: "America/Mexico_City", dateFormats: ["D MMM YYYY"],
      templates: [{
        name: "cargo", bodyContains: ["cargo a tu tarjeta"], kind: "gasto",
        amount: { regex: "por\\s+\\$\\s*([\\d.,]+)\\s+MXN" }, merchant: { regex: "en\\s+([A-Z0-9 &*]{3,40}?)\\s+el\\s" }, date: { regex: "el\\s+(\\d{1,2} \\w+ \\d{4})" },
      }],
    });
    const text = "Se realizó un cargo a tu tarjeta por $ 1,234.50 MXN en OXXO CENTRO el 5 nov 2026 a las 10:00.";
    expect(runProfile(mx, { subject: "Cargo", text, receivedAt: 0 })).toMatchObject({
      status: "movement",
      movement: { date: "2026-11-05", amount: 1235, merchant: "OXXO CENTRO", kind: "gasto" },
    });
  });
});

describe("profile validation", () => {
  it("requires amount, merchant and kind when a template registers", () => {
    expect(() => parseProfile({ bank: "x1", templates: [{ name: "t", subjectContains: ["a"] }] })).toThrow(/required when action is register/);
  });

  it("requires a way to tell which mails a template applies to", () => {
    expect(() => parseProfile({ bank: "x1", templates: [{ name: "t", action: "skip" }] })).toThrow(/subjectContains and\/or bodyContains/);
  });

  it("rejects invalid or oversized regex", () => {
    const bad = (regex: string) => ({ bank: "x1", templates: [{ name: "t", subjectContains: ["a"], kind: "gasto", amount: { regex }, merchant: { fixed: "M" } }] });
    expect(() => parseProfile(bad("(unclosed"))).toThrow(/invalid regex/);
    expect(() => parseProfile(bad("a".repeat(201)))).toThrow();
  });
});

describe("safeMatch", () => {
  it("returns group 1, or the whole match without a group", () => {
    expect(safeMatch("Importe:\\s*([\\d.,]+)", "x Importe: 1.234,5 y")).toBe("1.234,5");
    expect(safeMatch("\\d+", "abc 42")).toBe("42");
    expect(safeMatch("zzz", "abc")).toBeNull();
  });

  it("stops a catastrophic regex instead of freezing the server", () => {
    const t0 = Date.now();
    expect(() => safeMatch("(a+)+$", "a".repeat(40) + "!")).toThrow(UnsafeRegexError);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("parseDateText", () => {
  it.each([
    ["12/11/2026", ["DD/MM/YYYY"], "2026-11-12"],
    ["11/12/2026", ["MM/DD/YYYY"], "2026-11-12"],
    ["12-11-2026", ["DD-MM-YYYY"], "2026-11-12"],
    ["12.11.2026", ["DD.MM.YYYY"], "2026-11-12"],
    ["12/11/26", ["DD/MM/YY"], "2026-11-12"],
    ["2026/11/12 21:25", ["YYYY/MM/DD"], "2026-11-12"],
    ["12 de noviembre de 2026", ["D MMM YYYY"], "2026-11-12"],
    ["5 nov 2026", ["D MMM YYYY"], "2026-11-05"],
  ] as const)("reads %s", (text, formats, iso) => {
    expect(parseDateText(text, formats)).toBe(iso);
  });

  it("rejects impossible dates and tries formats in order", () => {
    expect(parseDateText("31/02/2026", ["DD/MM/YYYY"])).toBeNull();
    expect(parseDateText("13/01/2026", ["MM/DD/YYYY", "DD/MM/YYYY"])).toBe("2026-01-13");
  });
});

describe("parseMoney with other currencies", () => {
  it("defaults to the profile currency and detects US$ and codes", () => {
    expect(parseMoney("$ 12.345,67", "ARS")).toEqual({ value: 12345.67, currency: "ARS" });
    expect(parseMoney("U$S 50,00", "ARS")).toEqual({ value: 50, currency: "USD" });
    expect(parseMoney("MXN 1,234.50", "COP")).toEqual({ value: 1234.5, currency: "MXN" });
  });
});
