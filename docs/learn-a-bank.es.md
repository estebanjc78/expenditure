# Agrega cualquier banco (Argentina, México, España...): aprende sus avisos con 3 o 4 ejemplos

[Read in English](learn-a-bank.md)

De fábrica el servidor lee BBVA Colombia. Para cualquier otro banco **no** hace falta código nuevo: Claude aprende a leer los correos de notificación de ese banco a partir de unos pocos tuyos, y el servidor guarda las reglas en tu base de datos.

## Qué haces tú

1. Agrega el remitente del banco: "Agrega `avisos@bancoejemplo.com.ar` como remitente bancario."
2. Pide a Claude que sincronice (o que "aprenda este banco"). Si el remitente todavía no tiene reglas, Claude te lo dice.
3. Claude busca **3 o 4 comprobantes reales** de ese remitente en tu correo (una compra, una transferencia o pago, dinero recibido y uno que no sea un movimiento, como un aviso de ingreso), te muestra cómo entendió cada uno (fecha, monto, comercio, tipo) y tú confirmas o corriges.
4. Claude redacta las reglas y el servidor las **prueba contra esos ejemplos confirmados**. Si alguno falla, Claude corrige las reglas y vuelve a probar hasta que todos pasen. Solo entonces se guardan.

Eso es todo. Desde ahí ese remitente se lee como BBVA, sin ningún modelo de por medio.

## Cómo son las reglas

Las reglas son datos, no código. Un perfil por banco, con una plantilla por tipo de aviso:

```json
{
  "bank": "galicia",
  "currency": "ARS",
  "timezone": "America/Argentina/Buenos_Aires",
  "dateFormats": ["DD/MM/YYYY"],
  "endMarkers": ["Este mensaje es confidencial"],
  "templates": [
    { "name": "login", "subjectContains": ["Ingreso a Home Banking"], "action": "skip" },
    {
      "name": "compra", "subjectContains": ["Compra con tarjeta"], "kind": "gasto",
      "amount": { "label": "Importe" }, "merchant": { "label": "Comercio" }, "date": { "label": "Fecha" },
      "delimiters": ["Tarjeta", "Hora"]
    }
  ]
}
```

- Un valor se lee con `{"label": "Importe"}` (el texto después de esa etiqueta, hasta la siguiente), `{"regex": "por \\$ ([\\d.,]+)"}` (primer grupo de captura) o `{"fixed": "Transferencia propia"}`.
- `delimiters` lista las demás etiquetas del aviso para que cada valor termine donde empieza el siguiente. `endMarkers` corta el pie legal.
- Los montos aceptan `1.234,56` y `1,234.56`. Fechas: `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `DD/MM/YY`, `YYYY/MM/DD` y meses con nombre (`5 nov 2026`, `12 de noviembre de 2026`).
- Los montos en una moneda distinta a la del perfil se reportan para tu revisión y nunca se registran.
- Si un aviso no trae fecha propia, se usa la fecha del correo en la zona horaria del perfil.

## Herramientas

| Herramienta | Uso |
|---|---|
| `formatos_banco` | Muestra los formatos incluidos y aprendidos, y los remitentes autorizados que todavía necesitan reglas. |
| `configurar_formato_banco` | Prueba las reglas contra los ejemplos confirmados (`dryRun`) y las guarda solo si todos pasan (mínimo 3 ejemplos). Sirve también para reenseñar un banco cuando cambia sus correos. |
| `eliminar_formato_banco` | Borra las reglas aprendidas (un banco incluido vuelve a su formato incluido). |

## Seguridad

Las reglas las redacta un modelo de lenguaje, así que se tratan como no confiables: se validan contra un esquema estricto, cada regex corre en un contexto aislado con un límite de 150 ms (un patrón catastrófico se detiene, no se ejecuta), el texto de los correos tiene un tamaño máximo y los valores tomados de los correos se limpian y se acotan. Las reglas solo afectan cómo se lee el correo de ese remitente.

## Límites

- Una moneda por base de datos: los montos se guardan como unidades enteras de la moneda del perfil.
- Probado con ejemplos inventados de Argentina y México; los bancos reales pueden necesitar una plantilla por tipo de aviso.
- Los avisos que son imágenes o PDF (sin texto en el cuerpo del correo) no se pueden leer.
