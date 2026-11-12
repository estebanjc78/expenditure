import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { dashboardData, listMonths } from "../domain/dashboard.js";
import { MONTH_RE } from "../domain/month.js";
import { renderAppPage } from "../panel/web-page.js";
import { bogotaDate } from "../parsers/types.js";

export const PANEL_UI = "ui://expenditures-control/panel";
const MAX_BANK_CHARS = 40;

const money = (n: number): string => `$ ${Math.round(n).toLocaleString("es-CO")}`;

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
        "month (YYYY-MM) es opcional. Solo si el usuario pide una ventana del navegador, usa abrir_panel.",
      inputSchema: { month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional() },
      _meta: { ui: { resourceUri: PANEL_UI } },
    },
    async ({ month }) => {
      const months = listMonths(db);
      const current = today().slice(0, 7);
      const shown = month ?? (months.includes(current) ? current : (months[months.length - 1] ?? current));
      const d = dashboardData(db, shown, { today: today() });
      const text =
        months.length === 0
          ? "Todavía no hay movimientos registrados: el reporte aparece vacío hasta que se carguen."
          : `Reporte de ${shown} mostrado al usuario. Gasto ${money(d.totals.spent)}, ingresos ${money(d.totals.income)}, ${d.totals.uncategorized.count} movimientos sin categoría.`;
      return { content: [{ type: "text" as const, text }], structuredContent: { month: shown } };
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
