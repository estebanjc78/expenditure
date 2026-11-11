/** Shared `YYYY-MM` month format (month 01-12). */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month: must be YYYY-MM");
}
