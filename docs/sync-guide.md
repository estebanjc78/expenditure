# Guía de sincronización (BBVA Colombia por correo)

Cómo debe Claude leer los comprobantes de Gmail (solo lectura) y registrarlos con el MCP. Basada en comprobantes reales de BBVA vistos el 2026-11-11. **Lo que no se vio todavía está marcado como no validado.**

## 1. Buscar comprobantes

Remitente de los comprobantes: `BBVA@bbvanet.com.co`. Las promociones vienen de `info@email.bbva.com.co`: se ignoran.

```
from:BBVA@bbvanet.com.co (subject:"Compra Exitosa" OR subject:"Pagos PSE" OR subject:"Pago de Facturas" OR subject:"transferencia") after:YYYY/MM/DD
```

Nunca registrar los de asunto **"Pago Rechazado"** (el cobro no se hizo; suelen repetirse por reintentos de suscripciones).

## 2. Tipos de comprobante vistos

| Asunto | Cuerpo (campos) | kind | merchant |
|---|---|---|---|
| Compra Exitosa | tarjeta terminada en, fecha de la operación, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Net - Pagos PSE | tipo de transacción, cuenta terminada en, fecha, establecimiento, valor, hora | gasto | Establecimiento |
| BBVA Móvil - Pago de Facturas | texto: "Realizaste un pago por $X de <comercio>, referencia … Hora HH:MM el AAAA-MM-DD" | gasto | comercio del texto |
| Tu transferencia va en camino | "Debitamos los $X de tu cuenta y los enviamos a <persona>" (sin fecha propia: usar la fecha local del mensaje) | gasto si va a un tercero; transferencia_propia si es a una cuenta del propio usuario (preguntar si hay duda) | nombre del destinatario |

No validado: comprobantes de dinero recibido (ingresos), devoluciones, retiros, otros bancos o billeteras.

## 3. Reglas de interpretación

- **Monto:** entero en COP, sin decimales. Los formatos varían: `$134,588.00` (coma de miles), `$124900.00` (sin separador), `$500.000.00` (punto de miles y `.00` final). En todos los casos los `.00` finales son centavos: 134588, 124900 y 500000.
- **Signo:** en los comprobantes vistos no aparecen signos; la dirección sale del tipo de comprobante (compra, pago y transferencia enviada = salida). Si aparece un monto con signo en otro formato: negativo = salida (gasto), sin signo = entrada (ingreso), y el `amount` que se registra es siempre positivo.
- **Fecha:** la del cuerpo del comprobante, que está en hora de Colombia. No usar la fecha del encabezado del correo (viene en UTC y un comprobante de la noche cae en el día siguiente).
- **bank:** `bbva`. El producto (tarjeta *NNNN o cuenta *NNNN) no se guarda hoy; podría usarse más adelante para distinguir cuentas propias.
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
