/** The single list of spending categories. `pse` collects PSE payments, whose payee the bank notice hides. */
export const CATEGORIES = ["supermercado", "suscripcion", "fijo", "otro", "pse"] as const;
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
}
