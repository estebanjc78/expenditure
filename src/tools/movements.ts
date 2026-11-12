import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { addMovement, movementInputSchema } from "../domain/movements.js";
import { queryMovements, querySchema } from "../domain/query.js";
import { lastMovementByBank } from "../domain/last-movement.js";
import { run } from "./helpers.js";

export function registerMovementTools(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    "registrar_movimiento",
    {
      description:
        "Registra UN movimiento financiero ya interpretado desde un comprobante bancario (correo) o un gasto en efectivo. " +
        "Pasa sourceId = el id del mensaje de correo para evitar duplicados (si ya existe devuelve duplicate:true). " +
        "Montos en COP enteros, fecha YYYY-MM-DD, kind: gasto | ingreso | transferencia_propia. " +
        "La fecha debe ser la fecha local de Colombia (America/Bogota) del comprobante, NO la fecha del encabezado del correo ni UTC: " +
        "una compra a las 20:00 del 31-oct es 2026-10-31 aunque el encabezado diga 01-nov UTC. " +
        "Pasa category SOLO si el usuario la dijo explícitamente; si no, omítela y deja que decida la regla del comercio " +
        "(si no hay regla, la respuesta trae needsClassification:true, que aplica solo a gastos). " +
        "Si la respuesta trae needsClassification:true, pregunta al usuario a qué categoría pertenece el comercio " +
        "(supermercado, suscripcion, fijo, otro, pse o transferencia) y llama a clasificar_comercio. Los pagos PSE (comercio \"PSE · …\") reciben solos la categoría pse.",
      inputSchema: movementInputSchema.shape,
    },
    (args) => run(() => addMovement(db, args)),
  );

  server.registerTool(
    "consultar_movimientos",
    {
      description:
        "Consulta y agrega los movimientos guardados: filtra por fechas, mes, categoría (o sin_categoria), banco, comercio, tipo, montos o texto, " +
        "y agrupa por category, bank, merchant, day o month (groupBy vacío devuelve un solo grupo 'total'). " +
        "Por defecto suma solo gastos. Usa includeMovements:true para ver el detalle. Úsala para responder cuánto se gastó en algo. Si el usuario quiere VER, explorar o comparar sus gastos (\"¿cómo voy?\", \"mostrame\"), muestra mejor el panel con ver_panel en vez de listar tablas largas en el chat.",
      inputSchema: querySchema.shape,
    },
    (args) => run(() => queryMovements(db, args)),
  );

  server.registerTool(
    "ultimo_movimiento_registrado",
    {
      description:
        "Devuelve la fecha del movimiento más reciente por banco ([{bank, lastDate}], vacío si no hay datos). " +
        "Llámala antes de sincronizar correos para saber desde qué fecha buscar comprobantes nuevos.",
    },
    () => run(() => lastMovementByBank(db)),
  );
}
