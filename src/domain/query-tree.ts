import { normalizeBank, normalizeMerchant } from "./classify.js";
import type { Movement } from "./types.js";

export type Dimension = "category" | "bank" | "merchant" | "day" | "month";

export interface GroupNode {
  key: string;
  total: number;
  count: number;
  children?: GroupNode[];
  movements?: Movement[];
}

export const UNCLASSIFIED = "sin_categoria";
const ALL_KEY = "total";

function keyOf(m: Movement, dim: Dimension): string {
  switch (dim) {
    case "category":
      return m.category ?? UNCLASSIFIED;
    case "bank":
      return normalizeBank(m.bank);
    case "merchant":
      return normalizeMerchant(m.merchant);
    case "day":
      return m.date;
    case "month":
      return m.date.slice(0, 7);
  }
}

function sumAmounts(rows: readonly Movement[]): number {
  return rows.reduce((acc, m) => acc + m.amount, 0);
}

function buildLevel(
  rows: readonly Movement[],
  dims: readonly Dimension[],
  includeMovements: boolean,
): GroupNode[] {
  const [dim, ...rest] = dims;
  if (dim === undefined) return [];
  const buckets = new Map<string, Movement[]>();
  for (const m of rows) {
    const k = keyOf(m, dim);
    buckets.set(k, [...(buckets.get(k) ?? []), m]);
  }
  const nodes = [...buckets.entries()].map(([key, group]): GroupNode => {
    const base = { key, total: sumAmounts(group), count: group.length };
    if (rest.length > 0) return { ...base, children: buildLevel(group, rest, includeMovements) };
    return includeMovements ? { ...base, movements: group } : base;
  });
  return nodes.sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** Builds the nested group tree in memory. With no dimensions, returns one "total" group. */
export function buildTree(
  rows: readonly Movement[],
  dims: readonly Dimension[],
  includeMovements: boolean,
): GroupNode[] {
  if (rows.length === 0) return [];
  if (dims.length === 0) {
    const base = { key: ALL_KEY, total: sumAmounts(rows), count: rows.length };
    return [includeMovements ? { ...base, movements: [...rows] } : base];
  }
  return buildLevel(rows, dims, includeMovements);
}
