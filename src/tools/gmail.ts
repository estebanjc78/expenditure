import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { DEFAULT_MAX_MESSAGES, syncMail } from "../domain/sync.js";
import type { SyncSummary } from "../domain/sync.js";
import type { GmailService } from "../gmail/service.js";
import { run } from "./helpers.js";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

function nextSteps(s: SyncSummary): string[] {
  const steps: string[] = [];
  if (s.remaining > 0) steps.push(`Quedan ${s.remaining} correos: vuelve a llamar a sincronizar_gmail con las mismas fechas.`);
  if (s.uncategorizedMerchants.length > 0) {
    steps.push("Hay comercios sin categoría: clasifícalos tú con clasificar_comercios (con tu criterio, sin preguntar uno por uno) y luego muéstrale la lista al usuario.");
  }
  if (s.review.length > 0) steps.push("Los ítems de 'review' (p. ej. divisas) NO se registraron: pregúntale al usuario qué hacer con cada uno.");
  if (s.needsFormat.length > 0) {
    steps.push(
      "Hay remitentes SIN reglas de lectura (needsFormat): aprende su formato con configurar_formato_banco pidiéndole al usuario 3 o 4 comprobantes reales (ver formatos_banco) y vuelve a sincronizar.",
    );
  }
  if (s.unrecognized.length > 0) steps.push("Los correos 'unrecognized' tienen un formato que el servidor no conoce: avísale al usuario cuáles son (asunto) sin leerlos todos.");
  return steps;
}

export function registerGmailTools(server: McpServer, db: DatabaseSync, gmail: GmailService): void {
  server.registerTool(
    "conectar_gmail",
    {
      description:
        "Conecta el Gmail del usuario con permiso SOLO de lectura, una sola vez. Abre el navegador en la pantalla de Google donde el usuario toca Permitir " +
        "(si no se abre, entrégale la url). Responde enseguida; luego usa estado_gmail para ver si ya quedó conectado. " +
        "El token queda guardado solo en el computador del usuario. Necesita la configuración de Google (docs/gmail-setup.md).",
    },
    () => run(async () => {
      const { url, opened } = await gmail.connect();
      return { url, opened, next: "Pídele al usuario que toque Permitir en la ventana de Google y luego confirma con estado_gmail." };
    }),
  );

  server.registerTool(
    "estado_gmail",
    { description: "Indica si Gmail está configurado, conectado o esperando que el usuario autorice, y el último error si lo hubo." },
    () => run(() => gmail.status()),
  );

  server.registerTool(
    "desconectar_gmail",
    {
      description:
        "Borra el token de Gmail guardado en este computador. Para revocar también el permiso en Google, el usuario puede hacerlo en https://myaccount.google.com/permissions.",
    },
    () => run(() => gmail.disconnect()),
  );

  server.registerTool(
    "sincronizar_gmail",
    {
      description:
        "Trae y registra los movimientos de un rango de fechas leyendo Gmail DESDE EL SERVIDOR: lee solo los correos de los remitentes autorizados (listar_remitentes), " +
        "extrae los datos con reglas por banco (sin pasar los correos por ti) y devuelve solo un resumen. Es idempotente: no repite correos ya procesados. " +
        `Procesa hasta maxMessages por llamada (por defecto ${DEFAULT_MAX_MESSAGES}); si remaining > 0, vuelve a llamarla con las mismas fechas. ` +
        "since y until (inclusive) son fechas YYYY-MM-DD. Requiere Gmail conectado (conectar_gmail). " +
        "El resumen trae uncategorizedMerchants (clasifícalos con clasificar_comercios), review (no registrados, pregunta al usuario) y unrecognized (formato desconocido).",
      inputSchema: { since: date, until: date.optional(), maxMessages: z.number().int().min(1).max(500).optional() },
    },
    ({ since, until, maxMessages }) =>
      run(async () => {
        const summary = await syncMail(db, gmail.source(), { since, until, maxMessages });
        return { ...summary, next: nextSteps(summary) };
      }),
  );
}
