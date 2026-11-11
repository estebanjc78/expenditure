export type Category = "supermercado" | "suscripcion" | "fijo" | "otro";
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
