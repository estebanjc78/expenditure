# Sync guide (BBVA Colombia receipts by email)

Spanish version: [sync-guide.es.md](sync-guide.es.md)

> **Two ways to sync.** The recommended way is `sincronizar_gmail` (see [gmail-setup.md](gmail-setup.md)): the server downloads and parses the mails itself with the rules in `src/parsers/bbva.ts` and returns a summary, so you do not need to read any email. The rest of this guide describes the manual path, where Claude reads each mail with its own Gmail connector and registers the movements with `registrar_movimientos`. It is also the reference for the receipt formats the parser handles.

How Claude should read bank receipts from Gmail (read-only) and register them with this MCP server. Based on real BBVA receipts seen on 2026-11-11 and on an end-to-end test with a real mailbox. **Anything not seen yet is marked as not validated.** Tool names are in Spanish; that is the server's API.

## 1. Finding receipts

Search by **sender**, not by subject. Authorized senders live in the server (`listar_remitentes`, `agregar_remitente`, `quitar_remitente`); there are none by default, the user adds them. Examples of bank senders: `BBVA@bbvanet.com.co` (purchases, payments and sent transfers) and `notificacionesBreB@bbva.com` (money received through Bre-B). Promotions (for example from `info@email.bbva.com.co`) are not authorized senders and are ignored.

`listar_remitentes` returns `gmailQuery`, for example:

```
from:(bbva@bbvanet.com.co OR notificacionesbreb@bbva.com)
```

Search Gmail with `<gmailQuery> after:YYYY/MM/DD`. If `gmailQuery` is empty there are no senders: ask the user to add one with `agregar_remitente`.

**Paging.** Gmail search groups results by thread and shows only 5 messages per thread. Do not stop at a cap of 25 results: expand each thread (`get_thread`) to list every message id, and keep paging through the results until the search is exhausted. Collect all ids before calling `filtrar_no_registrados`.

Even from an authorized sender, not every mail is a transaction. Never register:

- **"Pago Rechazado"**: the charge did not go through (subscriptions retry and repeat).
- Promotions.
- Login and security mails: "Confirmacion de ingreso", "Iniciaste otra sesion", ATM key assignment.
- Anything else that is not a transaction.

## 2. Receipt types seen

| Subject | Body (fields) | kind | merchant |
|---|---|---|---|
| Compra Exitosa | card ending in, operation date, merchant, amount, time | gasto | merchant |
| BBVA Net - Pagos PSE | transaction type, account ending in, date, merchant, amount, time | gasto | merchant |
| BBVA Movil - Pago de Facturas | text: "Realizaste un pago por $X de <merchant>, referencia ... Hora HH:MM el AAAA-MM-DD" | gasto | merchant in the text |
| Tu transferencia va en camino / Tu transferencia esta en proceso (same body, two subjects) | "Debitamos los $ X de tu cuenta y los enviamos a <person>" (no date of its own: use the local date of the message, see the date rule) | gasto if sent to a third party; transferencia_propia if to one of the user's own accounts (ask when in doubt) | recipient name |
| Recibiste dinero en tu cuenta a traves de Bre-B (sender `notificacionesBreB@bbva.com`) | "Fecha y hora" (AAAA/MM/DD HH:MM, local time), "Valor recibido", "Persona que envia", "Tipo de llave", "Cuenta destino", "Codigo de operacion" | ingreso | sender person |
| Tu envio con llave fue exitoso (Bre-B sent) | compact row: date, amount, recipient | gasto | recipient |
| Credit-card payment notice | "pago de Tarjeta de Crédito No. XXXX1234 ... por un valor de $ ..." | transferencia_propia (card payment from the user's own account; the card's purchases are registered one by one) | "Pago tarjeta de crédito XXXX1234" |
| BBVA Net - Pagos PSE | tipo de transacción, fecha, establecimiento, valor | gasto | "PSE · " + establecimiento: the real payee is hidden behind PSE, so fixed expenses are matched to these by amount |

The last two rows are compact notices: register them only with the fields they show, and ask the user when the kind (own transfer vs expense) is unclear.

For received Bre-B, `sourceId` = the Gmail message id (the "Codigo de operacion" also works as a reference). Not validated: refunds, withdrawals, other banks or wallets. If a BBVA mail does not fit any row of this table, do not register it: list it to the user as "not interpreted".

**Amount is not always in the snippet.** For Compra Exitosa, PSE and Bre-B summaries the Gmail snippet does not show the amount: read the full PLAIN_TEXT body.

### Special cases: ask, do not register silently

- **USD-to-COP conversions between own accounts** (for example from the BBVA Panama account) are the user's income earned in dollars: register them as `ingreso` for the pesos received ("Total de divisas enviado"). Other foreign-currency transfers that cannot be valued in pesos: do not register without asking the user.
- **Suspicious charges.** Very small amounts (under 1,000 COP), identical charges repeated within minutes, or a charge right after a rejected payment are NOT registered silently. List them to the user and ask: they may be card validations or retries.
- **Ambiguous currency.** An amount like "$100.00" can be USD or COP: ask.
- **Merchants with `*` patterns** (for example `Dlo*microsoft*sto`) are separate merchants; each one needs to be classified once.

## 3. Interpretation rules

- **Amount:** integer COP, no decimals. Formats vary between mail types: `$134,588.00` (comma thousands, point decimal), `$124900.00` and `$ 500000.00` (no thousands separator), `$500.000.00` (point thousands and trailing `.00`) and, in Bre-B, `$ 1.595.000,00` (point thousands, comma decimal). The last two digits after the last separator are cents and are dropped: 134588, 124900, 500000 and 1595000. If an amount is ambiguous, do not register; ask.
- **Sign:** the receipts seen carry no signs; direction comes from the receipt type (purchase, payment and sent transfer = outflow). If a signed amount shows up in another format: negative = outflow (gasto), unsigned = inflow (ingreso). The registered `amount` is always positive.
- **Date:** the date in the receipt body, which is Colombia local time. Do not use the mail header date (it is UTC, and an evening receipt lands on the next day: a Bre-B received on 2026/11/10 at 21:25 had a header of 11 November 02:25 UTC). If the body has no date (sent transfers), convert the header by subtracting 5 hours (UTC-5).
- **bank:** `bbva`. The product (card `*NNNN` or account `*NNNN`) is not stored today.
- **sourceId:** the Gmail message id. If a mail holds two movements use `<id>#1`, `<id>#2`.
- **category:** do not pass it unless the user said so. If the response has `needsClassification: true`, ask the user for the merchant's category and call `clasificar_comercio`.

## 4. Sync flow

1. Call `ultimo_movimiento_registrado` to know where to start searching (if empty, ask the user from when).
2. Call `listar_remitentes` and search Gmail with `gmailQuery` plus `after:` that date minus one day. The overlap is safe: the same `sourceId` is never duplicated. Expand threads and page through all results (section 1).
3. Pass the message ids to `filtrar_no_registrados` (max 500): it returns only the ones not yet registered (an id also counts as registered if a `sourceId` of the form `<id>#n` exists).
4. Read only those messages (plain text) and interpret each. Skip promotions, "Pago Rechazado", login/security mails and anything that is not a transaction; list what does not fit section 2 to the user as "not interpreted"; hold back the special cases above and ask.
5. Register with `registrar_movimientos` (max 100 per call). An invalid item does not abort the rest: check each `error` in the result, fix and resend.
6. For every item with `needsClassification: true`, ask the user for the category and call `clasificar_comercio`.
7. Report how many were registered, how many were duplicates, how many failed and which could not be interpreted.

## 5. Tool arguments (exact names)

`filtrar_no_registrados` takes `sourceIds: string[]`:

```json
{ "sourceIds": ["19a1b2c3d4e5f601", "19a1b2c3d4e5f602"] }
```

`registrar_movimientos` takes `movements: MovementInput[]`. Each item has `sourceId`, `date` (YYYY-MM-DD), `kind` (`gasto` | `ingreso` | `transferencia_propia`), `merchant`, `amount` (positive integer COP) and `bank`:

```json
{
  "movements": [
    {
      "sourceId": "19a1b2c3d4e5f601",
      "date": "2026-11-10",
      "kind": "gasto",
      "merchant": "Supermercado Ejemplo",
      "amount": 134588,
      "bank": "bbva"
    },
    {
      "sourceId": "19a1b2c3d4e5f602",
      "date": "2026-11-10",
      "kind": "ingreso",
      "merchant": "Persona Ejemplo",
      "amount": 1595000,
      "bank": "bbva"
    }
  ]
}
```

## 6. Privacy

The server does not read email. Claude reads only the bank receipts it needs and hands the server just the extracted data (amount, merchant, date, bank, kind). The text of the mails is not stored.
