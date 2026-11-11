# Guía de sincronización (BBVA Colombia por correo)

Cómo debe Claude leer los comprobantes de Gmail (solo lectura) y registrarlos con el MCP. Basada en comprobantes reales de BBVA vistos el 2026-11-11. **Lo que no se vio todavía está marcado como no validado.**

## 1. Buscar comprobantes

Remitentes de los comprobantes: `BBVA@bbvanet.com.co` (compras, pagos y transferencias enviadas) y `notificacionesBreB@bbva.com` (dinero recibido por Bre-B). Las promociones vienen de `info@email.bbva.com.co`: se ignoran.

```
(from:BBVA@bbvanet.com.co (subject:"Compra Exitosa" OR subject:"Pagos PSE" OR subject:"Pago de Facturas" OR subject:"transferencia")) OR (from:notificacionesBreB@bbva.com subject:"Bre-B") after:YYYY/MM/DD
```

Nunca registrar los de asunto **"Pago Rechazado"** (el cobro no se hizo; suelen repetirse por reintentos de suscripciones).

## 2. Tipos de comprobante vistos

| Asunto | Cuerpo (campos) | kind | merchant |
|---|---|---|---|
| Compra Exitosa | tarjeta terminada en, fecha de la operación, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Net - Pagos PSE | tipo de transacción, cuenta terminada en, fecha, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Móvil - Pago de Facturas | texto: "Realizaste un pago por $X de <comercio>, referencia … Hora HH:MM el AAAA-MM-DD" | gasto | comercio del texto |
| Tu transferencia va en camino / Tu transferencia está en proceso (mismo cuerpo, dos asuntos) | "Debitamos los $ X de tu cuenta y los enviamos a <persona>" (sin fecha propia: usar la fecha local del mensaje, ver regla de fecha) | gasto si va a un tercero; transferencia_propia si es a una cuenta del propio usuario (preguntar si hay duda) | nombre del destinatario |
| Recibiste dinero en tu cuenta a través de Bre-B (remitente `notificacionesBreB@bbva.com`) | "Fecha y hora" (AAAA/MM/DD HH:MM, hora local), "Valor recibido", "Persona que envía", "Tipo de llave", "Cuenta destino", "Código de operación" | ingreso | persona que envía |

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
2. Buscar con la consulta de arriba desde esa fecha menos un día. El solapamiento es seguro: un mismo `sourceId` nunca se duplica.
3. Para cada mensaje, leerlo en texto plano, interpretarlo y llamar a `registrar_movimiento`.
4. Resolver con el usuario las clasificaciones pendientes.
5. Informar cuántos movimientos se registraron, cuántos eran duplicados y cuáles no se pudieron interpretar.

## 5. Privacidad

El MCP no lee el correo. Claude lee solo los comprobantes bancarios necesarios y entrega al MCP únicamente los datos extraídos (monto, comercio, fecha, banco, tipo). No se guarda el texto de los mails.
