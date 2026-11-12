import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { addSender, gmailSenderQuery, listSenders, removeSender } from "../domain/senders.js";
import { addMovements, filterUnregistered, MAX_BATCH } from "../domain/batch.js";
import { run } from "./helpers.js";

const MAX_IDS = 500;

export function registerSenderTools(server: McpServer, db: DatabaseSync): void {
  server.registerTool(
    "listar_remitentes",
    {
      description:
        "Lista los remitentes bancarios autorizados y devuelve {senders, gmailQuery}. " +
        "Antes de sincronizar con el servidor, revisa formatos_banco: si un remitente autorizado NO tiene reglas de lectura (banco que no es BBVA Colombia), aprende su formato con configurar_formato_banco pidiéndole al usuario 3 o 4 comprobantes reales. "+
        "Flujo de sincronización: 1) listar_remitentes; 2) busca en Gmail con gmailQuery más una fecha (ej. `<gmailQuery> after:YYYY/MM/DD`; " +
        "la fecha sale de ultimo_movimiento_registrado); 3) pasa los ids de los mensajes encontrados a filtrar_no_registrados; " +
        "4) lee e interpreta cada correo pendiente: promociones, pagos rechazados (\"Pago Rechazado\") y correos que no son una transacción NO se registran; " +
        "5) registra los demás con registrar_movimientos. Si gmailQuery viene vacío, no hay remitentes: pide al usuario que agregue alguno con agregar_remitente.",
    },
    () => run(() => {
      const senders = listSenders(db);
      return { senders, gmailQuery: gmailSenderQuery(senders) };
    }),
  );

  server.registerTool(
    "agregar_remitente",
    {
      description:
        "Agrega una dirección de correo de un banco a la lista de remitentes autorizados (se guarda sin espacios y en minúsculas; debe contener @). " +
        "Agregarla otra vez no es un error (devuelve added:false). Label es un nombre opcional, ej. \"BBVA\".",
      inputSchema: { address: z.string().min(1), label: z.string().min(1).optional() },
    },
    ({ address, label }) => run(() => addSender(db, address, label)),
  );

  server.registerTool(
    "quitar_remitente",
    {
      description: "Quita una dirección de la lista de remitentes autorizados. Devuelve {removed}.",
      inputSchema: { address: z.string().min(1) },
    },
    ({ address }) => run(() => removeSender(db, address)),
  );

  server.registerTool(
    "filtrar_no_registrados",
    {
      description:
        "Recibe los ids de mensajes de Gmail encontrados con gmailQuery (máx. 500) y devuelve solo los que AÚN no están registrados, " +
        "sin repetidos y en el mismo orden (un id cuenta como registrado si existe un movimiento con ese sourceId o con `<id>#n`). " +
        "Léelos e interprétalos solo a ellos, así no vuelves a leer correos ya procesados. " +
        "Luego interpreta cada uno: promociones, pagos rechazados (\"Pago Rechazado\") y correos que no son una transacción NO se registran; " +
        "los demás van a registrar_movimientos.",
      inputSchema: { sourceIds: z.array(z.string().min(1)).max(MAX_IDS) },
    },
    ({ sourceIds }) => run(() => filterUnregistered(db, sourceIds)),
  );

  server.registerTool(
    "registrar_movimientos",
    {
      description:
        `Registra por lote (máx. ${MAX_BATCH}) movimientos ya interpretados, con los mismos campos y reglas que registrar_movimiento ` +
        "(sourceId = id del mensaje, o `<id>#1`, `<id>#2` si un correo trae varios; montos COP enteros; fecha YYYY-MM-DD local de Colombia; " +
        "category solo si el usuario la dijo). Cada ítem se valida por separado: uno inválido no aborta los demás. " +
        "Devuelve {results:[{index,id,duplicate,needsClassification,error}], summary:{registered,duplicates,failed}}. " +
        "No incluyas promociones, pagos rechazados (\"Pago Rechazado\") ni correos que no sean transacciones. " +
        "Para cada ítem con needsClassification:true pregunta al usuario la categoría del comercio y llama a clasificar_comercio. " +
        "Revisa los ítems con error, corrígelos y reenvíalos. " +
        "Cuando termines de cargar movimientos, abre el panel con abrir_panel sin esperar a que el usuario lo pida.",
      inputSchema: { movements: z.array(z.unknown()).max(MAX_BATCH) },
    },
    ({ movements }) => run(() => addMovements(db, movements)),
  );
}
