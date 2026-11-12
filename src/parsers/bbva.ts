import { cleanText } from "../domain/sanitize.js";
import { parseMoney } from "./amount.js";
import { readFields } from "./fields.js";
import { normalizeEmailText } from "./text.js";
import { bogotaDate } from "./types.js";
import type { ParsedMovement, ParseResult, ParserInput } from "./types.js";

const UNRECOGNIZED: ParseResult = { status: "unrecognized" };
const SECTION_START_RE = /Detalles? de la (?:operaci[oó]n|transferencia)/i;
const SECTION_END_RE = /Gracias por utilizar|Hazlo f[aá]cil|Con el fin de seguir|Adem[aá]s, disfruta/i;
const ON_THE_WAY_START = "Debitamos los";
const ON_THE_WAY_MID = " de tu cuenta y los enviamos a ";
const ON_THE_WAY_END = ". Conoce";
const MAX_MERCHANT_CHARS = 80;
const SUMMARY_LABELS = ["Tipo de transacción", "Cuenta terminada en", "Fecha de la operación", "Establecimiento", "Valor", "Hora"];
const SUMMARY_END_RE = /Recuerda que/i;
const CURRENCY_CODE_RE = /^[A-Z]{3}(?: A [A-Z]{3})?$/;

const PURCHASE_LABELS = ["Tarjeta terminada en", "Fecha de la operación", "Establecimiento", "Valor", "Hora"];
const RECEIVED_LABELS = ["Fecha y hora", "Valor recibido", "Persona que envía", "Tipo de llave", "Cuenta destino", "Código de operación"];
const OWN_TRANSFER_LABELS = [
  "Tipo de transferencia", "Divisa", "Valor", "Tasa de cambio", "Total de divisas enviado",
  "Fecha", "Hora", "Cuenta de origen", "Cuenta destino", "Número de comprobante",
];

/** Cuts the "Detalles de la operación" block out of the normalized text. */
function detailSection(text: string): string | null {
  const start = SECTION_START_RE.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index + start[0].length);
  const end = SECTION_END_RE.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
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

function movement(date: string | null, amount: number | null, rawMerchant: string | undefined, kind: ParsedMovement["kind"]): ParseResult {
  const merchant = cleanText(rawMerchant ?? "", MAX_MERCHANT_CHARS);
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
    const code = (currency || money?.currency || "").toUpperCase();
    return { status: "review", reason: `Transferencia en divisa extranjera (${CURRENCY_CODE_RE.test(code) ? code : "desconocida"}): no se registra sin confirmar con el usuario` };
  }
  if (!/propia/i.test(f.get("tipo de transferencia") ?? "")) return UNRECOGNIZED;
  return movement(isoDate(f.get("fecha")), copAmount(f.get("valor")), "Transferencia propia", "transferencia_propia");
}

/** "Debitamos los $X de tu cuenta y los enviamos a NAME. Conoce ...", found with plain indexOf scans (linear). */
function parseOnTheWay(text: string, receivedAt: number): ParseResult | null {
  const start = text.indexOf(ON_THE_WAY_START);
  if (start < 0) return null;
  const mid = text.indexOf(ON_THE_WAY_MID, start);
  if (mid < 0) return null;
  const end = text.indexOf(ON_THE_WAY_END, mid);
  if (end < 0) return null;
  const amount = text.slice(start + ON_THE_WAY_START.length, mid).trim();
  const merchant = text.slice(mid + ON_THE_WAY_MID.length, end).trim();
  if (amount.length > 40 || merchant.length > 200) return UNRECOGNIZED;
  return movement(bogotaDate(receivedAt), copAmount(amount), merchant, "gasto");
}

/**
 * "BBVA Net - Pagos PSE" summaries have no "Detalles de la operación" heading, and the payee is hidden behind the
 * PSE service ("PAGOS ELECTRONI"): the merchant keeps a "PSE · " prefix so these payments can be told apart.
 */
function parseTransactionSummary(text: string): ParseResult | null {
  const start = /Tipo de transacci[oó]n\s*:/i.exec(text);
  if (!start) return null;
  const rest = text.slice(start.index);
  const end = SUMMARY_END_RE.exec(rest);
  const f = readFields(end ? rest.slice(0, end.index) : rest, SUMMARY_LABELS, true);
  if (!/\bPSE\b/i.test(f.get("tipo de transacción") ?? "")) return UNRECOGNIZED;
  const payee = f.get("establecimiento");
  return movement(isoDate(f.get("fecha de la operación")), copAmount(f.get("valor")), payee ? `PSE · ${payee}` : undefined, "gasto");
}

const CARD_PAYMENT_START = "pago de Tarjeta de Crédito No.";
const CARD_PAYMENT_DATE = "realizado el día ";
const CARD_PAYMENT_AMOUNT = "por un valor de ";
const CARD_PAYMENT_END = "Gracias por utilizar";

/**
 * "Notificación Pago de Tarjetas Crédito": money leaves the account to settle a card. The card's purchases are
 * registered one by one, so counting the payment as spending would count them twice: it is an own transfer.
 */
function parseCardPayment(text: string): ParseResult | null {
  const start = text.indexOf(CARD_PAYMENT_START);
  if (start < 0) return null;
  const rest = text.slice(start + CARD_PAYMENT_START.length);
  const card = /^\s*([A-Za-z0-9*]{4,20})/.exec(rest)?.[1];
  const dateAt = rest.indexOf(CARD_PAYMENT_DATE);
  const amountAt = rest.indexOf(CARD_PAYMENT_AMOUNT);
  if (!card || dateAt < 0 || amountAt < 0) return UNRECOGNIZED;
  const endAt = rest.indexOf(CARD_PAYMENT_END, amountAt);
  const amountText = rest.slice(amountAt + CARD_PAYMENT_AMOUNT.length, endAt < 0 ? undefined : endAt);
  return movement(isoDate(rest.slice(dateAt + CARD_PAYMENT_DATE.length, dateAt + CARD_PAYMENT_DATE.length + 12)), copAmount(amountText), `Pago tarjeta de crédito ${card}`, "transferencia_propia");
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

  const summary = parseTransactionSummary(normalized);
  if (summary) return summary;

  const cardPayment = parseCardPayment(normalized);
  if (cardPayment) return cardPayment;

  const section = detailSection(normalized);
  if (section === null) return UNRECOGNIZED;
  if (/Establecimiento\s*:/i.test(section)) return parsePurchase(section);
  if (/Valor recibido/i.test(section)) return parseReceived(section);
  if (/Tipo de transferencia/i.test(section)) return parseOwnTransfer(section);
  return UNRECOGNIZED;
}
