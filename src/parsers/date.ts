export const DATE_FORMATS = ["YYYY-MM-DD", "YYYY/MM/DD", "DD/MM/YYYY", "DD-MM-YYYY", "DD.MM.YYYY", "MM/DD/YYYY", "DD/MM/YY", "D MMM YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

const MONTH_NAMES: Readonly<Record<string, number>> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const SHAPES: Readonly<Record<Exclude<DateFormat, "D MMM YYYY">, { re: RegExp; order: readonly ("y" | "m" | "d")[] }>> = {
  "YYYY-MM-DD": { re: /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/, order: ["y", "m", "d"] },
  "YYYY/MM/DD": { re: /(?<!\d)(\d{4})\/(\d{1,2})\/(\d{1,2})(?!\d)/, order: ["y", "m", "d"] },
  "DD/MM/YYYY": { re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/, order: ["d", "m", "y"] },
  "DD-MM-YYYY": { re: /(?<!\d)(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/, order: ["d", "m", "y"] },
  "DD.MM.YYYY": { re: /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/, order: ["d", "m", "y"] },
  "MM/DD/YYYY": { re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/, order: ["m", "d", "y"] },
  "DD/MM/YY": { re: /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{2})(?!\d)/, order: ["d", "m", "y"] },
};
const NAMED_RE = /(?<!\d)(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]{3,12})\.?,?\s*(?:de\s+)?(\d{4})(?!\d)/i;

function toIso(year: number, month: number, day: number): string | null {
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso ? null : iso;
}

/** First real calendar date in the text that fits one of the formats (tried in order), as YYYY-MM-DD. */
export function parseDateText(text: string, formats: readonly DateFormat[]): string | null {
  for (const format of formats) {
    if (format === "D MMM YYYY") {
      const m = NAMED_RE.exec(text);
      const month = m ? MONTH_NAMES[m[2]!.slice(0, 3).toLowerCase()] : undefined;
      const iso = m && month ? toIso(Number(m[3]), month, Number(m[1])) : null;
      if (iso) return iso;
      continue;
    }
    const shape = SHAPES[format];
    const m = shape.re.exec(text);
    if (!m) continue;
    const parts = Object.fromEntries(shape.order.map((k, i) => [k, Number(m[i + 1])])) as Record<"y" | "m" | "d", number>;
    const year = format === "DD/MM/YY" ? 2000 + parts.y : parts.y;
    const iso = toIso(year, parts.m, parts.d);
    if (iso) return iso;
  }
  return null;
}
