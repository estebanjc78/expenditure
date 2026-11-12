/** Shared `YYYY-MM` month format (month 01-12). */
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!MONTH_RE.test(month)) throw new Error("Invalid month: must be YYYY-MM");
}

/** Month `delta` months away from `month` (YYYY-MM), crossing year boundaries. */
export function shiftMonth(month: string, delta: number): string {
  assertMonth(month);
  const index = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
