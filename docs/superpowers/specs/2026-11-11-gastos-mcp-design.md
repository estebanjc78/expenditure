# MCP de presupuesto personal desde el correo — diseño

## Intención
Esteban (Colombia, BBVA) no sabe en el mes qué gastos fijos ya se pagaron, qué suscripciones se cobraron ni cuánto lleva gastado en supermercado. Tiene los fijos en un Excel y un monto para súper y otro para suscripciones, pero no hace seguimiento.

Se construye un **MCP** que reconstruye los gastos desde los comprobantes de BBVA que llegan al correo y responde en cualquier momento cuánto lleva consumido por categoría. También sirve como pieza de portafolio de productos de IA. Una app visual vendrá después y llamará a este MCP, por eso el MCP es la fuente única de la lógica.

## Objetivos
- Leer los comprobantes de BBVA del correo (Gmail) y extraer monto, comercio y fecha.
- Clasificar cada gasto en: supermercado, suscripción, gasto fijo u otro.
- Mantener un presupuesto mensual por categoría y decir cuánto se consumió y cuánto queda.
- Cruzar con el Excel de gastos fijos y marcar cuáles ya se pagaron.
- Consultar cualquier mes (actual o anterior) y devolver una vista tipo tabla dinámica: total por categoría ordenado de mayor a menor, con detalle expandible categoría → comercio → gasto individual, para ver dónde se va más. El MCP devuelve los datos jerárquicos; la presentación expandible (chat con detalle a pedido, o artefacto interactivo) queda fuera del MCP.
- Capturar todo tipo de transacción que llegue por comprobante: compras, transferencias enviadas y recibidas, pagos de servicios, retiros, etc. (Esteban: "todo todo").
- Soportar cualquier banco o billetera: todo llega por correo, así que la fuente es solo el correo. Cada movimiento guarda su banco de origen y toda consulta puede hacerse "de todos los bancos" o "de tal banco". Esteban aclaró que no importa qué bancos use, todo está en el correo.
- Consulta flexible: el usuario puede pedir de muchas formas ("por rubro", "solo suscripciones", "mercado", "de BBVA", "transferencias de octubre", "lo más caro del mes", combinaciones como "suscripciones de BBVA en los últimos 3 meses"). Para eso el MCP expone una consulta general con filtros combinables (período o rango de fechas, categoría/rubro, banco, comercio, tipo de movimiento, rango de monto, texto) y agrupación elegible (por categoría, banco, comercio, día o mes). Claude traduce el pedido en lenguaje natural a esos filtros. No se hacen reportes fijos por cada tipo de pedido.
- Registrar a mano gastos en efectivo.
- Aprender los comercios: lo que no reconoce se pregunta una vez y se recuerda.

## No-objetivos
- Conectarse al banco o a open finance (Decreto 0368 de 2026 aún sin API pública confirmada de BBVA Colombia). Queda como posible fuente futura.
- La app o dashboard visual (fase posterior).
- Pagar, transferir o modificar algo en el banco o en el correo.

## Anti-objetivos
- Que envíe, borre o modifique correos.
- Que guarde el contenido completo de los mails.
- Que clasifique mal en silencio: ante la duda, pregunta.

## Restricciones
- Colombia, pesos colombianos, BBVA. Gasta casi todo con comprobante por correo; el efectivo es la excepción.
- Acceso a Gmail solo de lectura.
- Solo se guardan los datos extraídos (monto, comercio, fecha, categoría), no el texto del mail.
- Los datos financieros son sensibles: almacén local.

## Decisiones tomadas por Esteban
- Es un MCP primero; la app vendrá después y lo llamará.
- La fuente de datos son los comprobantes del banco por correo; el efectivo se registra a mano.
- Presupuesto mensual por categoría con consumo en tiempo real.

## Decisiones mías (a validar)
- Almacén: base local SQLite. El Excel queda como fuente de los gastos fijos, no como base de datos.
- Fuente de datos intercambiable (correo hoy, open finance mañana).
- Herramientas del MCP: resumen del mes, gastos fijos pendientes, registrar gasto manual, listar gastos por categoría, clasificar un comercio, fijar presupuesto de una categoría.
- Cada movimiento tiene un tipo (gasto, ingreso, transferencia entre cuentas propias). Los ingresos y las transferencias entre cuentas propias NO cuentan como gasto, para no duplicar ni inflar los totales; se muestran aparte. Si una transferencia es a un tercero, cuenta como gasto y se categoriza.
- Sin lectores por banco. Claude (el cliente) lee los comprobantes con el conector de Gmail, interpreta cualquier formato y entrega cada movimiento ya estructurado (monto, comercio, fecha, banco, tipo) al MCP mediante una herramienta de registro. El MCP guarda, evita duplicados usando el identificador del mail, clasifica y consulta. Consecuencia: la sincronización la dispara el usuario pidiéndola ("sincronizá mi correo"), no corre sola en segundo plano.
- Aviso al pasar el 80% de una categoría (idea mía, opcional).
- Lenguaje y stack: a elección del constructor; preferible TypeScript con el SDK oficial de MCP, por afinidad con el resto de sus proyectos.

## Desconocido: formato de los comprobantes
No se vio todavía ningún comprobante real. Al inicio del desarrollo hay que revisar 3 o 4 ejemplos reales (remitentes, asuntos, campos) para validar que la interpretación genérica alcanza y definir qué consulta de Gmail los encuentra. Si el formato resulta ambiguo, el constructor debe parar y consultar.

## Para el constructor
- Cómo se estructura el Excel de fijos: preguntar a Esteban o leer un ejemplo.
- Detalles de esquema de base, nombres de herramientas y manejo de duplicados (un mismo gasto que aparece dos veces).
- Pruebas con comprobantes de ejemplo sin datos personales reales.
