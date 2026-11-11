import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { setBudget } from "../domain/budget.js";
import { budgetOverview } from "../domain/budget-overview.js";
import { setMerchantRule } from "../domain/classify.js";
import { importFixedExpenses, pendingFixed } from "../domain/fixed.js";
import { run } from "./helpers.js";

const category = z.enum(["supermercado", "suscripcion", "fijo", "otro"]);
const month = z.string().describe("Mes en formato YYYY-MM");

export function registerBudgetTools(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    "clasificar_comercio",
    {
      description:
        "Asigna una categoría a un comercio y reclasifica sus movimientos pendientes y los futuros. " +
        "Llámala después de que el usuario te diga la categoría de un comercio (cuando registrar_movimiento devolvió needsClassification:true).",
      inputSchema: { merchant: z.string().trim().min(1, "merchant is required"), category },
    },
    ({ merchant, category: c }) => run(() => setMerchantRule(db, merchant, c)),
  );

  server.registerTool(
    "fijar_presupuesto",
    {
      description:
        "Define el presupuesto mensual (COP enteros) de una categoría para un mes YYYY-MM, o para todos los meses con month='default'.",
      inputSchema: {
        category,
        month: z.string().describe("YYYY-MM o 'default'"),
        amount: z.number(),
      },
    },
    ({ category: c, month: m, amount }) =>
      run(() => {
        setBudget(db, c, m, amount);
        return { ok: true };
      }),
  );

  server.registerTool(
    "estado_presupuesto",
    {
      description:
        "Estado del mes por categoría: presupuesto, gastado, restante, porcentaje y alerta al 80%. " +
        "Incluye sinCategoria: gasto del mes aún sin clasificar. Opcionalmente filtra por banco.",
      inputSchema: { month, bank: z.string().min(1).optional() },
    },
    ({ month: m, bank }) => run(() => budgetOverview(db, m, bank)),
  );

  server.registerTool(
    "importar_gastos_fijos",
    {
      description:
        "Importa desde un Excel (.xlsx, columnas nombre, monto, comercio) la lista de gastos fijos mensuales, reemplazando la anterior.",
      inputSchema: { path: z.string().min(1) },
    },
    ({ path }) => run(() => importFixedExpenses(db, path)),
  );

  server.registerTool(
    "gastos_fijos_pendientes",
    {
      description: "Lista los gastos fijos del mes YYYY-MM indicando cuáles ya se pagaron y cuáles faltan por pagar.",
      inputSchema: { month },
    },
    ({ month: m }) => run(() => pendingFixed(db, m)),
  );
}
