// Control characters, line/paragraph separators, zero-width and bidi override characters.
const UNSAFE_CHARS = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]",
  "g",
);

/**
 * Cleans a string that came from an email (merchant, subject, error text) before it is stored or handed
 * to the model: no control or invisible characters, collapsed whitespace, bounded length.
 * Mail content is data, never instructions; this keeps it short and inert.
 */
export function cleanText(value: string, max = 80): string {
  const s = value.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
