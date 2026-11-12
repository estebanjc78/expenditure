# Guía de sincronización (BBVA Colombia por correo)

English version: [sync-guide.md](sync-guide.md)

> **Dos formas de sincronizar.** La recomendada es `sincronizar_gmail` (ver [gmail-setup.es.md](gmail-setup.es.md)): el servidor descarga y procesa los correos por sí mismo con las reglas de `src/parsers/bbva.ts` y devuelve un resumen, así que no hace falta leer ningún correo. El resto de esta guía describe la vía manual, en la que Claude lee cada correo con su propio conector de Gmail y registra los movimientos con `registrar_movimientos`. También sirve de referencia de los formatos de comprobante que maneja el parser.

Cómo debe Claude leer los comprobantes de Gmail (solo lectura) y registrarlos con el MCP. Basada en comprobantes reales de BBVA vistos el 2026-11-11. **Lo que no se vio todavía está marcado como no validado.**

## 1. Buscar comprobantes

La búsqueda se hace por **remitente**, no por asunto. Los remitentes autorizados viven en el MCP (`listar_remitentes`, `agregar_remitente`, `quitar_remitente`); no hay ninguno por defecto, el usuario los agrega. Ejemplos de remitentes bancarios: `BBVA@bbvanet.com.co` (compras, pagos y transferencias enviadas) y `notificacionesBreB@bbva.com` (dinero recibido por Bre-B). Las promociones (por ejemplo de `info@email.bbva.com.co`) no son remitentes autorizados y se ignoran.

`listar_remitentes` devuelve `gmailQuery`, por ejemplo:

```
from:(bbva@bbvanet.com.co OR notificacionesbreb@bbva.com)
```

Se busca en Gmail con `<gmailQuery> after:YYYY/MM/DD`. Si `gmailQuery` viene vacío, no hay remitentes: pedir al usuario que agregue alguno con `agregar_remitente`.

**Paginación.** La búsqueda de Gmail agrupa por hilo y muestra solo 5 mensajes por hilo. No te quedes en un tope de 25 resultados: expande cada hilo (`get_thread`) para listar todos los ids de mensaje y sigue paginando hasta agotar la búsqueda. Junta todos los ids antes de llamar a `filtrar_no_registrados`.

Aunque el remitente sea autorizado, no todo correo es una transacción. Nunca registrar:

- **"Pago Rechazado"**: el cobro no se hizo (suelen repetirse por reintentos de suscripciones).
- Promociones.
- Correos de ingreso y seguridad: "Confirmacion de ingreso", "Iniciaste otra sesion", asignación de clave de cajero.
- Cualquier otro correo que no sea una transacción.

## 2. Tipos de comprobante vistos

| Asunto | Cuerpo (campos) | kind | merchant |
|---|---|---|---|
| Compra Exitosa | tarjeta terminada en, fecha de la operación, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Net - Pagos PSE | tipo de transacción, cuenta terminada en, fecha, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Móvil - Pago de Facturas | texto: "Realizaste un pago por $X de <comercio>, referencia … Hora HH:MM el AAAA-MM-DD" | gasto | comercio del texto |
| Tu transferencia va en camino / Tu transferencia está en proceso (mismo cuerpo, dos asuntos) | "Debitamos los $ X de tu cuenta y los enviamos a <persona>" (sin fecha propia: usar la fecha local del mensaje, ver regla de fecha) | gasto si va a un tercero; transferencia_propia si es a una cuenta del propio usuario (preguntar si hay duda) | nombre del destinatario |
| Recibiste dinero en tu cuenta a través de Bre-B (remitente `notificacionesBreB@bbva.com`) | "Fecha y hora" (AAAA/MM/DD HH:MM, hora local), "Valor recibido", "Persona que envía", "Tipo de llave", "Cuenta destino", "Código de operación" | ingreso | persona que envía |

| Tu envio con llave fue exitoso (Bre-B enviado) | fila compacta: fecha, monto, destinatario | gasto | destinatario |
| Aviso de pago de tarjeta de crédito | "pago de Tarjeta de Crédito No. XXXX1234 ... por un valor de $ ..." | transferencia_propia (pago de tarjeta desde cuenta propia; las compras de la tarjeta se registran una a una) | "Pago tarjeta de crédito XXXX1234" |
| BBVA Net - Pagos PSE | tipo de transacción, fecha, establecimiento, valor | gasto | "PSE · " + establecimiento: el comercio real queda oculto tras PSE, así que los gastos fijos se emparejan con estos por monto |

Las dos últimas filas son avisos compactos: registrar solo con los campos que muestran y preguntar al usuario si el tipo (transferencia propia o gasto) no es claro.

**El monto no siempre está en el snippet.** En Compra Exitosa, PSE y los resúmenes de Bre-B el snippet de Gmail no muestra el monto: leer el cuerpo completo en PLAIN_TEXT.

### Casos especiales: preguntar, no registrar en silencio

- **Transferencias entre cuentas propias en moneda extranjera** (por ejemplo USD a COP): no registrar sin preguntar al usuario.
- **Cobros sospechosos.** Montos muy pequeños (menos de 1.000 COP), cobros idénticos repetidos en pocos minutos o un cobro justo después de un pago rechazado NO se registran en silencio: listarlos al usuario y preguntar (pueden ser validaciones de tarjeta o reintentos).
- **Moneda ambigua.** Un monto como "$100.00" puede ser USD o COP: preguntar.
- **Comercios con patrón `*`** (por ejemplo `Dlo*microsoft*sto`) son comercios distintos; cada uno se clasifica una vez.

Para Bre-B recibido, `sourceId` = id del mensaje de Gmail (el "Código de operación" también sirve como referencia). No validado: Bre-B enviado (puede tener su propio correo), devoluciones, retiros, otros bancos o billeteras. Si en una sincronización aparece un correo de BBVA que no encaja en ninguna fila de esta tabla, no registrarlo: listarlo al usuario como "no interpretado".

## 3. Reglas de interpretación

- **Monto:** entero en COP, sin decimales. Los formatos varían entre tipos de correo: `$134,588.00` (coma de miles, punto decimal), `$124900.00` y `$ 500000.00` (sin separador de miles), `$500.000.00` (punto de miles y `.00` final) y, en Bre-B, `$ 1.595.000,00` (punto de miles, coma decimal). Los dos últimos dígitos tras el último separador son centavos y se descartan: 134588, 124900, 500000 y 1595000. Ante un monto ambiguo, no registrar y preguntar.
- **Signo:** en los comprobantes vistos no aparecen signos; la dirección sale del tipo de comprobante (compra, pago y transferencia enviada = salida). Si aparece un monto con signo en otro formato: negativo = salida (gasto), sin signo = entrada (ingreso), y el `amount` que se registra es siempre positivo.
- **Fecha:** la del cuerpo del comprobante, que está en hora de Colombia. No usar la fecha del encabezado del correo (viene en UTC y un comprobante de la noche cae en el día siguiente: un Bre-B recibido el 2026/11/10 a las 21:25 llegó con encabezado del 11 de noviembre 02:25 UTC). Si el cuerpo no trae fecha (transferencias enviadas), convertir el encabezado restando 5 horas (UTC-5).
- **bank:** `bbva`. El producto (tarjeta `*NNNN` o cuenta `*NNNN`) no se guarda hoy; podría usarse más adelante para distinguir cuentas propias.
- **sourceId:** el id del mensaje de Gmail. Si un correo contiene dos movimientos, usar `<id>#1`, `<id>#2`.
- **category:** no pasarla salvo que el usuario la haya dicho. Si la respuesta trae `needsClassification: true`, preguntar al usuario la categoría del comercio y llamar a `clasificar_comercio`.

## 4. Flujo de sincronización

1. Llamar a `ultimo_movimiento_registrado` para saber desde qué fecha buscar (si está vacío, pedir al usuario desde cuándo).
2. Llamar a `listar_remitentes` y buscar en Gmail con `gmailQuery` más `after:` esa fecha menos un día. El solapamiento es seguro: un mismo `sourceId` nunca se duplica. Expandir los hilos y paginar todos los resultados (sección 1).
3. Pasar los ids de los mensajes encontrados a `filtrar_no_registrados` (máx. 500): devuelve solo los que aún no están registrados (también cuenta como registrado un `sourceId` de la forma `<id>#n`). Así no se vuelven a leer correos ya procesados.
4. Leer en texto plano solo esos mensajes e interpretar cada uno. Descartar promociones, "Pago Rechazado", correos de ingreso/seguridad y todo lo que no sea una transacción; los que no encajen en la tabla de la sección 2 se listan al usuario como "no interpretado"; los casos especiales de arriba se retienen y se preguntan.
5. Registrar los movimientos interpretados con `registrar_movimientos` (máx. 100 por llamada). Un ítem inválido no aborta los demás: revisar los `error` del resultado, corregir y reenviar.
6. Para cada ítem con `needsClassification: true`, preguntar al usuario la categoría y llamar a `clasificar_comercio`.
7. Informar cuántos movimientos se registraron, cuántos eran duplicados, cuántos fallaron y cuáles no se pudieron interpretar.

## 5. Argumentos de las herramientas (nombres exactos)

`filtrar_no_registrados` recibe `sourceIds: string[]`:

```json
{ "sourceIds": ["19a1b2c3d4e5f601", "19a1b2c3d4e5f602"] }
```

`registrar_movimientos` recibe `movements: MovementInput[]`. Cada ítem lleva `sourceId`, `date` (YYYY-MM-DD), `kind` (`gasto` | `ingreso` | `transferencia_propia`), `merchant`, `amount` (entero COP positivo) y `bank`:

```json
{
  "movements": [
    { "sourceId": "19a1b2c3d4e5f601", "date": "2026-11-10", "kind": "gasto", "merchant": "Supermercado Ejemplo", "amount": 134588, "bank": "bbva" },
    { "sourceId": "19a1b2c3d4e5f602", "date": "2026-11-10", "kind": "ingreso", "merchant": "Persona Ejemplo", "amount": 1595000, "bank": "bbva" }
  ]
}
```

## 6. Privacidad

El MCP no lee el correo. Claude lee solo los comprobantes bancarios necesarios y entrega al MCP únicamente los datos extraídos (monto, comercio, fecha, banco, tipo). No se guarda el texto de los mails.
