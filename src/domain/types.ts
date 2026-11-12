/** The single list of spending categories. `pse` collects PSE payments (the payee is hidden); `transferencia` collects transfers to other people. */
export const CATEGORIES = ["supermercado", "suscripcion", "fijo", "otro", "pse", "transferencia"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Kind = "gasto" | "ingreso" | "transferencia_propia";

export interface Movement {
  readonly id: number;
  readonly sourceId: string | null;
  readonly date: string; // YYYY-MM-DD
  readonly amount: number; // COP, integer
  readonly merchant: string;
  readonly bank: string;
  readonly kind: Kind;
  readonly category: Category | null;
}

export interface MovementInput {
  readonly sourceId?: string;
  readonly date: string;
  readonly amount: number;
  readonly merchant: string;
  readonly bank: string;
  readonly kind: Kind;
  readonly category?: Category;
  /** Used only when neither the caller nor a merchant rule decides a category (e.g. a parser knows it is a transfer). */
  readonly suggestedCategory?: Category;
}
