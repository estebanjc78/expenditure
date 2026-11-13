import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { dashboardData, listMonths } from "../domain/dashboard.js";
import { findMovements } from "../domain/find.js";
import { MONTH_RE } from "../domain/month.js";
import { renderAppPage } from "../panel/web-page.js";
import { bogotaDate } from "../parsers/types.js";

export const PANEL_UI = "ui://expenditures-control/panel";
const MAX_BANK_CHARS = 40;

const money = (n: number): string => `$ ${Math.round(n).toLocaleString("es-CO")}`;

function describeSearch(query: string, found: ReturnType<typeof findMovements>, shown: string): string {
  const lines = found.matches.slice(0, 3).map((m) => `${m.date} ${m.merchant} ${money(m.amount)}`);
  const others = found.otherMonths.length ? ` También hay coincidencias en ${found.otherMonths.slice(0, 4).join(", ")}.` : "";
  if (found.matches.length === 0) {
    return `No encontré movimientos para «${query}» en ${shown} (busqué por ${found.basis}).${others} Puede que ese mes no esté cargado todavía.`;
  }
  return `Resalté en el reporte ${found.matches.length} movimiento(s) para «${query}» (entendí: ${found.basis}): ${lines.join("; ")}.${others}`;
}

export interface AppPanelOptions {
  readonly now?: () => number;
}

/**
 * The spending report as an MCP App: Claude draws it inside the conversation. The model only receives a short
 * summary; the report asks for its own data with `datos_panel`, a tool the model never sees, so the movements
 * never enter the model's context.
 */
export function registerAppPanel(server: McpServer, db: DatabaseSync, options: AppPanelOptions = {}): void {
  const now = options.now ?? Date.now;
  const today = (): string => bogotaDate(now());

  registerAppResource(server, "Panel de gastos", PANEL_UI, { description: "Reporte interactivo de gastos" }, async () => ({
    contents: [{ uri: PANEL_UI, mimeType: RESOURCE_MIME_TYPE, text: renderAppPage() }],
  }));

  registerAppTool(
    server,
    "ver_panel",
    {
      title: "Ver el panel de gastos",
      description:
        "Muestra DENTRO de la conversación un reporte visual e interactivo de los gastos (gráficos, categorías que se expanden, comparación con el mes anterior, búsqueda). " +
        "Es la forma por defecto de que el usuario vea o explore sus gastos: úsala cuando pregunte cómo va, quiera comparar meses o ver movimientos, y al terminar de cargar movimientos, sin esperar a que lo pida. " +
        "month (YYYY-MM) es opcional. Si el usuario no encuentra o pregunta por un movimiento (\"no veo la transferencia del alquiler\", \"¿dónde está el pago de 327.300?\"), pasa resaltar con lo que dijo: " +
        "un concepto de su lista de gastos fijos, un nombre, un monto o una categoría. El reporte se abre en el mes correcto con esos movimientos resaltados y te devuelvo lo que encontré. " +
        "Solo si el usuario pide una ventana del navegador, usa abrir_panel.",
      inputSchema: {
        month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional(),
        resaltar: z.string().trim().min(1).max(80).optional(),
      },
      _meta: { ui: { resourceUri: PANEL_UI } },
    },
    async ({ month, resaltar }) => {
      const months = listMonths(db);
      const current = today().slice(0, 7);
      const found = resaltar ? findMovements(db, resaltar, { month }) : null;
      const shown = month ?? found?.month ?? (months.includes(current) ? current : (months[months.length - 1] ?? current));
      const d = dashboardData(db, shown, { today: today() });
      const summary =
        months.length === 0
          ? "Todavía no hay movimientos registrados: el reporte aparece vacío hasta que se carguen."
          : `Reporte de ${shown} mostrado al usuario. Gasto ${money(d.totals.spent)}, ingresos ${money(d.totals.income)}, ${d.totals.uncategorized.count} movimientos sin categoría.`;
      const text = found && months.length > 0 ? `${summary} ${describeSearch(resaltar!, found, shown)}` : summary;
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: { month: shown, ...(found ? { highlight: { query: resaltar, ids: found.matches.map((m) => m.id) } } : {}) },
      };
    },
  );

  registerAppTool(
    server,
    "datos_panel",
    {
      title: "Datos del panel (uso interno del reporte)",
      description: "Devuelve los datos que dibuja el reporte: sin month, la lista de meses; con month, el resumen de ese mes. Solo la usa el reporte, no el modelo.",
      inputSchema: {
        month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional(),
        bank: z.string().max(MAX_BANK_CHARS).optional(),
      },
      _meta: { ui: { resourceUri: PANEL_UI, visibility: ["app"] } },
    },
    async ({ month, bank }) => {
      const data: Record<string, unknown> = month
        ? { ...dashboardData(db, month, { today: today(), bank }) }
        : { months: listMonths(db), currentMonth: today().slice(0, 7) };
      return { content: [{ type: "text" as const, text: "ok" }], structuredContent: data };
    },
  );
}
