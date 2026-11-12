import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { MONTH_RE } from "../domain/month.js";
import { openInBrowser } from "../open-browser.js";
import { panelUrl, startPanel } from "../panel/server.js";
import type { Panel } from "../panel/server.js";
import { run } from "./helpers.js";

export interface PanelToolOptions {
  /** Opens the URL in a browser; defaults to the system browser. */
  readonly openUrl?: (url: string) => Promise<boolean>;
  readonly now?: () => number;
}

export function registerPanelTools(server: McpServer, db: DatabaseSync, options: PanelToolOptions = {}): void {
  const open = options.openUrl ?? openInBrowser;
  let panel: Panel | null = null;

  const previousClose = server.server.onclose;
  server.server.onclose = () => {
    previousClose?.();
    void panel?.close();
    panel = null;
  };

  server.registerTool(
    "abrir_panel",
    {
      description:
        "SOLO si el usuario pide una ventana del navegador, o si el cliente no puede mostrar el reporte dentro del chat (usa ver_panel por defecto): abre en el navegador un PANEL visual e interactivo de sus gastos (gráficos, categorías que se expanden, comparación con el mes anterior, búsqueda). " +
        "Es solo lectura y se sirve únicamente en este computador (127.0.0.1) con un token secreto en la dirección. " +
        "Úsala cuando el usuario quiera VER sus gastos, comparar meses o explorar movimientos, en vez de listar tablas en el chat. " +
        "month (YYYY-MM) es opcional: abre en ese mes. Se actualiza solo cuando llegan movimientos nuevos. " +
        "Devuelve {url, opened}; si opened es false, entrégale la url al usuario para que la abra (no la compartas: lleva el token).",
      inputSchema: { month: z.string().regex(MONTH_RE, "month must be YYYY-MM").optional() },
    },
    ({ month }) =>
      run(async () => {
        panel ??= await startPanel(db, { now: options.now });
        const url = panelUrl(panel, month);
        return { url, opened: await open(url) };
      }),
  );
}
