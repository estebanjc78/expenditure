import type { DatabaseSync } from "node:sqlite";
import { monthStatus, type CategoryStatus } from "./budget.js";
import { queryMovements } from "./query.js";
import { UNCLASSIFIED } from "./query-tree.js";

export interface BudgetOverview {
  categories: CategoryStatus[];
  /** Total gasto del mes sin categoría, para que nunca quede oculto. */
  sinCategoria: number;
}

export function budgetOverview(db: DatabaseSync, month: string, bank?: string): BudgetOverview {
  const categories = monthStatus(db, month, bank);
  const { groups } = queryMovements(db, {
    filters: { month, category: UNCLASSIFIED, ...(bank ? { bank } : {}) },
    groupBy: [],
  });
  return { categories, sinCategoria: groups[0]?.total ?? 0 };
}
