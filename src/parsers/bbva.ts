import { parseMoney } from "./amount.js";
import { normalizeEmailText } from "./text.js";
import { bogotaDate } from "./types.js";
import type { ParsedMovement, ParseResult, ParserInput } from "./types.js";

const UNRECOGNIZED: ParseResult = { status: "unrecognized" };
const SECTION_START_RE = /Detalles? de la (?:operaci[oó]n|transferencia)/i;
const SECTION_END_RE = /Gracias por utilizar|Hazlo f[aá]cil|Con el fin de seguir|Adem[aá]s, disfruta/i;
const ON_THE_WAY_RE = /Debitamos los\s+(.+?)\s+de tu cuenta y los enviamos a\s+(.+?)\.\s*Conoce/i;

const PURCHASE_LABELS = ["Tarjeta terminada en", "Fecha de la operación", "Establecimiento", "Valor", "Hora"];
const RECEIVED_LABELS = ["Fecha y hora", "Valor recibido", "Persona que envía", "Tipo de llave", "Cuenta destino", "Código de operación"];
const OWN_TRANSFER_LABELS = [
  "Tipo de transferencia", "Divisa", "Valor", "Tasa de cambio", "Total de divisas enviado",
  "Fecha", "Hora", "Cuenta de origen", "Cuenta destino", "Número de comprobante",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cuts the "Detalles de la operación" block out of the normalized text. */
function detailSection(text: string): string | null {
  const start = SECTION_START_RE.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index + start[0].length);
  const end = SECTION_END_RE.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/**
 * Splits a block into label -> value using the known labels. Longest labels are tried first so
 * "Valor recibido" wins over "Valor". With `requireColon`, a label only counts when followed by ":"
 * (so a merchant called "Hora del cafe" cannot be mistaken for the "Hora" label).
 */
function readFields(section: string, labels: readonly string[], requireColon: boolean): Map<string, string> {
  const alternation = [...labels].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const re = new RegExp(`(${alternation})${requireColon ? "\\s*:" : "\\s*:?"}`, "gi");
  const hits = [...section.matchAll(re)];
  const fields = new Map<string, string>();
  hits.forEach((hit, i) => {
    const key = hit[1]!.toLowerCase();
    if (fields.has(key)) return;
    const valueStart = hit.index + hit[0].length;
    const valueEnd = hits[i + 1]?.index ?? section.length;
    const value = section.slice(valueStart, valueEnd).replace(/^[\s*:]+|[\s*:]+$/g, "");
    fields.set(key, value);
  });
  return fields;
}

function isoDate(text: string | undefined): string | null {
  const m = /(\d{4})[/-](\d{2})[/-](\d{2})/.exec(text ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function copAmount(text: string | undefined): number | null {
  const money = text === undefined ? null : parseMoney(text);
  if (!money || money.currency !== "COP") return null;
  const amount = Math.round(money.value);
  return amount > 0 ? amount : null;
}

function movement(date: string | null, amount: number | null, merchant: string | undefined, kind: ParsedMovement["kind"]): ParseResult {
  if (!date || amount === null || !merchant) return UNRECOGNIZED;
  return { status: "movement", movement: { date, amount, merchant, kind } };
}

function parsePurchase(section: string): ParseResult {
  const f = readFields(section, PURCHASE_LABELS, true);
  return movement(isoDate(f.get("fecha de la operación")), copAmount(f.get("valor")), f.get("establecimiento"), "gasto");
}

function parseReceived(section: string): ParseResult {
  const f = readFields(section, RECEIVED_LABELS, false);
  return movement(isoDate(f.get("fecha y hora")), copAmount(f.get("valor recibido")), f.get("persona que envía"), "ingreso");
}

function parseOwnTransfer(section: string): ParseResult {
  const f = readFields(section, OWN_TRANSFER_LABELS, true);
  const currency = f.get("divisa") ?? "";
  const money = parseMoney(f.get("valor") ?? "");
  if ((currency && currency.toUpperCase() !== "COP") || (money && money.currency !== "COP")) {
    return { status: "review", reason: `Transferencia en divisa extranjera (${currency || money?.currency}): no se registra sin confirmar con el usuario` };
  }
  if (!/propia/i.test(f.get("tipo de transferencia") ?? "")) return UNRECOGNIZED;
  return movement(isoDate(f.get("fecha")), copAmount(f.get("valor")), "Transferencia propia", "transferencia_propia");
}

function parseOnTheWay(text: string, receivedAt: number): ParseResult | null {
  const m = ON_THE_WAY_RE.exec(text);
  if (!m) return null;
  return movement(bogotaDate(receivedAt), copAmount(m[1]), m[2]?.trim(), "gasto");
}

/** Parser for BBVA Colombia transaction notices (purchase, received money, transfers). */
export function parseBbva({ subject, text, receivedAt }: ParserInput): ParseResult {
  if (/no exitosa|rechazad/i.test(subject)) return { status: "skip", reason: "Operación no exitosa o rechazada" };
  if (/est[aá] en proceso/i.test(subject)) {
    return { status: "skip", reason: "Aviso 'en proceso': la transferencia se registra con el aviso 'va en camino'" };
  }
  const normalized = normalizeEmailText(text);

  const onTheWay = parseOnTheWay(normalized, receivedAt);
  if (onTheWay) return onTheWay;

  const section = detailSection(normalized);
  if (section === null) return UNRECOGNIZED;
  if (/Establecimiento\s*:/i.test(section)) return parsePurchase(section);
  if (/Valor recibido/i.test(section)) return parseReceived(section);
  if (/Tipo de transferencia/i.test(section)) return parseOwnTransfer(section);
  return UNRECOGNIZED;
}
