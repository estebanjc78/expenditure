export interface Money {
  readonly value: number;
  readonly currency: string;
}

const CURRENCY_RE = /\b(COP|USD|EUR|ARS|MXN|CLP|PEN|BRL|UYU|BOB|PYG|GBP)\b/i;
const DOLLAR_SIGN_RE = /\bU\$S|\bUS\$/i; // Argentine and generic "US$" spellings of the US dollar
const NUMBER_RE = /\d[\d.,]*/;

/**
 * Reads a money string whose thousands/decimal separators are not fixed:
 * "$207,387.00", "$ 1.595.000,00", "$500.000.00" and "$ 500000.00" all occur in bank mails.
 * The last separator is a decimal mark only when followed by 1-2 digits; otherwise every
 * separator is a thousands mark. Currency defaults to `defaultCurrency` (COP) unless a code or "US$" appears.
 */
export function parseMoney(input: string, defaultCurrency = "COP"): Money | null {
  const numberMatch = NUMBER_RE.exec(input);
  if (!numberMatch) return null;
  const raw = numberMatch[0].replace(/[.,]+$/, "");
  const currency = CURRENCY_RE.exec(input)?.[1]?.toUpperCase() ?? (DOLLAR_SIGN_RE.test(input) ? "USD" : defaultCurrency);

  const lastSep = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
  const tail = lastSep >= 0 ? raw.slice(lastSep + 1) : "";
  const isDecimal = lastSep >= 0 && tail.length >= 1 && tail.length <= 2;
  const digits = (isDecimal ? raw.slice(0, lastSep) : raw).replace(/[.,]/g, "");
  const value = Number(isDecimal ? `${digits}.${tail}` : digits);
  if (!Number.isFinite(value)) return null;
  return { value, currency };
}
