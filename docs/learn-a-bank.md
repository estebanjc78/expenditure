# Add any bank (Argentina, Mexico, Spain...): learn its notices from 3 or 4 examples

[Leer en español](learn-a-bank.es.md)

Out of the box the server reads BBVA Colombia. For any other bank you do **not** need new code: Claude learns how to read that bank's notification emails from a few of your own, and the server stores the rules in your database.

## What you do

1. Add the bank's sender: "Add `avisos@bancoejemplo.com.ar` as a bank sender."
2. Ask Claude to sync (or to "learn this bank"). If the sender has no rules yet, Claude says so.
3. Claude finds **3 or 4 real notices** from that sender in your mail (a purchase, a transfer or payment, money received, and one that is not a movement, such as a login alert), shows you how it understood each one (date, amount, merchant, type), and you confirm or correct them.
4. Claude writes the rules and the server **tests them against those confirmed examples**. If one fails, Claude fixes the rules and tests again until all pass. Only then are they saved.

That is all. From then on that sender is read like BBVA is, with no model involved.

## What the rules look like

Rules are data, not code. One profile per bank, with one template per kind of notice:

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

- A value is read with `{"label": "Importe"}` (the text after that label, up to the next label), `{"regex": "por \\$ ([\\d.,]+)"}` (first capture group) or `{"fixed": "Transferencia propia"}`.
- `delimiters` lists the other labels of the notice so each value stops where the next one starts. `endMarkers` cut off the legal footer.
- Amounts accept both `1.234,56` and `1,234.56`. Dates: `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `DD/MM/YY`, `YYYY/MM/DD` and named months (`5 nov 2026`, `12 de noviembre de 2026`).
- Amounts in another currency than the profile's are reported for your review, never registered.
- If a notice has no date of its own, the mail's date in the profile's time zone is used.

## Tools

| Tool | Use |
|---|---|
| `formatos_banco` | Shows built-in and learned formats, and the authorized senders that still need rules. |
| `configurar_formato_banco` | Tests rules against the confirmed examples (`dryRun`) and saves them only if all pass (at least 3 examples). Also use it to re-teach a bank when it changes its emails. |
| `eliminar_formato_banco` | Deletes learned rules (a built-in bank goes back to its built-in format). |

## Safety

The rules come from a language model, so they are treated as untrusted: they are validated against a strict schema, every regex runs in an isolated context with a 150 ms limit (a catastrophic pattern is stopped, not run), mail text is size-capped, and values taken from emails are cleaned and length-limited. Rules only affect how mail from that one sender is read.

## Limits

- One currency per database: amounts are stored as whole units of the profile's currency.
- Tested with made-up Argentine and Mexican examples; real banks may need a template per notice type.
- Notices that are images or PDFs (no text in the email body) cannot be read.
