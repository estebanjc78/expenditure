# Expenditures Control

An MCP server that keeps your bank-notification movements (COP) in a local SQLite file and lets Claude answer budget questions by category and month.

[Leer en español](README.es.md)

## What it looks like

All figures below are made up.

> **You:** How did October go by category?
>
> **Claude:** October 2026, spent vs budget:
>
> | Category | Spent | Budget | Used |
> |---|---:|---:|---:|
> | Supermercado | 612,400 | 700,000 | 87% (alert) |
> | Suscripcion | 148,900 | 200,000 | 74% |
> | Fijo | 1,350,000 | 1,350,000 | 100% |
> | Otro | 203,500 | no budget | |
>
> 41,000 COP of spending is still uncategorized (2 merchants). Want to classify them?
>
> <details>
> <summary>Detail: Supermercado</summary>
>
> | Date | Merchant | Amount |
> |---|---|---:|
> | 2026-10-03 | Supermercado Ejemplo | 134,588 |
> | 2026-10-11 | Tienda Ejemplo | 88,200 |
> | 2026-10-19 | Supermercado Ejemplo | 201,350 |
> | 2026-10-27 | Mercado Demo | 188,262 |
>
> </details>

The server can read your bank notification emails itself (read-only Gmail access, one-time setup), extract the data with per-bank rules and keep only a short summary in Claude's context. That makes it practical to load months of history in one go. Without that setup, Claude can still read recent emails with its own Gmail connector and hand the server the extracted data.

## How it works

```mermaid
flowchart LR
    U[You] <--> C[Claude client]
    C <-->|"stdio (MCP tools)"| S[expenditures-control server]
    S <--> DB[(Local SQLite file)]
    S <-->|"read-only, OAuth"| GA[Gmail API]
    GA --- M[Bank notification emails]
    S --> P[Per-bank parsers: regex, no model]
    C -. "optional: Claude's own Gmail connector" .-> M
```

The server has no language model. With Gmail connected, the server downloads the mails of your authorized senders, extracts the movements with per-bank parsers (regular expressions over the "operation details" block) and returns only a summary; Claude classifies merchants and answers questions. See [docs/diagrama-proceso-mcp.md](docs/diagrama-proceso-mcp.md) for the full flow (in Spanish).

## Privacy

- Gmail access is optional and read-only (`gmail.readonly`). When connected, the server fetches only mails from the senders you authorized, and only to extract the movement data.
- The OAuth token lives in `~/.gastos-mcp/gmail-token.json` on your computer (owner-only permissions). You can delete it any time with `desconectar_gmail` and revoke the permission at <https://myaccount.google.com/permissions>.
- The server stores only extracted data: date, amount, merchant, bank, kind (expense, income, own transfer) and category. It never stores the text of an email.
- Everything lives in files on your computer. The only network traffic of this server is to Google's APIs (Gmail and sign-in) when you connect Gmail.
- Merchant names, amounts and subjects that the server returns are visible to Claude like any tool result.
- Note: when Claude reads your emails or queries the data, that content is processed by your Claude client under its own privacy terms.

## Requirements

- Node.js 22.13 or newer (the server uses the built-in `node:sqlite`). Check with `node --version`.
- An MCP client: Claude Code, Claude Desktop, or any client that runs stdio servers.
- For email sync: either connect Gmail to the server (one-time Google setup, see [docs/gmail-setup.md](docs/gmail-setup.md)) or use Claude's own Gmail connector.

## Install

### A. Claude Code

```bash
claude mcp add gastos -- npx -y expenditures-control
```

To choose where the database goes:

```bash
claude mcp add gastos -e GASTOS_DB=/path/to/gastos.db -- npx -y expenditures-control
```

> The npm package is not published yet (see Status below). Until then, run it from a clone: `npm install && npm run build`, then `claude mcp add gastos -- node "/absolute/path/to/dist/index.js"`.

### B. Claude Desktop (.mcpb, double-click)

Build the bundle from the repo (`npm run build:mcpb` produces `build/expenditures-control.mcpb`) and open it with Claude Desktop, then click **Install**. Claude Desktop's built-in Node includes `node:sqlite`, and the bundle has been used there to store movements. Downloadable releases are not published yet. If you prefer not to build it, use C below.

### C. Manual JSON config (Claude Desktop and other clients)

Add this to the client's MCP config (for Claude Desktop: Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "gastos": {
      "command": "npx",
      "args": ["-y", "expenditures-control"],
      "env": { "GASTOS_DB": "/path/to/gastos.db" }
    }
  }
}
```

`env` is optional. The Node used by the client must be 22.13 or newer; if your client uses a different Node, set `command` to the full path of a recent `node` and `args` to the path of `dist/index.js`.

## Where the data lives

The database is one file. Default: `~/.gastos-mcp/gastos.db` (the folder is created with private permissions). Set `GASTOS_DB` to use another path; `~` is expanded, an empty value counts as unset, and `:memory:` gives a throwaway database.

- **Back up:** close the client and copy the file (`cp ~/.gastos-mcp/gastos.db ~/gastos-backup.db`). Also copy `gastos.db-wal` and `gastos.db-shm` if they exist next to it.
- **Delete everything:** remove the file (`rm ~/.gastos-mcp/gastos.db*`). The next start creates an empty database.

## First use

1. **Add your bank senders.** Ask Claude: "Add `BBVA@bbvanet.com.co` as a bank sender." There are none by default; the server only treats mail from these addresses as bank notifications.
2. **Connect Gmail (once).** Follow [docs/gmail-setup.md](docs/gmail-setup.md), then ask: "Connect my Gmail" and click **Allow** in the browser.
3. **Sync.** Ask: "Sync my bank emails from 2026-09-01." The server downloads and parses the mails itself and returns a summary (registered, skipped, needs review, merchants without category). It is safe to repeat. Without the Gmail connection, Claude can read recent mails with its own connector instead; see [docs/sync-guide.md](docs/sync-guide.md).
4. **Classify merchants.** Claude classifies new merchants itself from their names (`supermercado`, `suscripcion`, `fijo` or `otro`), shows you the list, and you correct what is wrong. Each merchant is classified once and remembered, including for past movements.
5. **Set budgets.** "Set a 700,000 supermercado budget for every month."
6. **Ask.** "How did October go by category?", "What did I spend at Supermercado Ejemplo this year?", "Which fixed expenses are still unpaid?"

### Fixed-expenses Excel

Optional. Create an `.xlsx` with the first sheet like this (headers on row 1, case-insensitive):

| nombre | monto | comercio |
|---|---:|---|
| Rent | 1200000 | landlord name |
| Internet | 150000 | ISP |

`comercio` is the keyword used to detect the payment among your movements (whole words; if empty, `nombre` is used). Then ask Claude to import it from the file path. Importing replaces the previous list.

## Tools (18)

The tool names are in Spanish.

| Tool | What it does |
|---|---|
| `registrar_movimiento` | Save one interpreted movement (`sourceId` = email id prevents duplicates). |
| `registrar_movimientos` | Save up to 100 movements per batch; each item is validated separately. |
| `consultar_movimientos` | Filter and group movements (totals by category, bank, merchant, day or month). |
| `clasificar_comercio` | Assign a category to a merchant and reclassify all its expenses. |
| `fijar_presupuesto` | Set the budget of a category for a month (or `default`). |
| `estado_presupuesto` | Spent vs budget per category, alert at 80%, plus uncategorized spend. |
| `importar_gastos_fijos` | Load the fixed-expenses list from an Excel file. |
| `gastos_fijos_pendientes` | Fixed expenses of a month: paid and still due. |
| `ultimo_movimiento_registrado` | Latest movement date per bank, to know where to sync from. |
| `listar_remitentes` | Authorized bank senders and the Gmail query (`from:(a OR b)`). |
| `agregar_remitente` | Add a bank sender (stored lowercase, must contain `@`). |
| `quitar_remitente` | Remove a bank sender. |
| `filtrar_no_registrados` | From a list of message ids (max 500), return those not registered yet. |
| `conectar_gmail` | Connect Gmail (read-only) with a one-time Allow click. |
| `estado_gmail` | Whether Gmail is configured, connected or waiting for you. |
| `desconectar_gmail` | Delete the Gmail token stored on this computer. |
| `sincronizar_gmail` | Download and parse bank mails for a date range and register the movements; returns a summary. |
| `clasificar_comercios` | Classify many merchants at once and reclassify their expenses. |

## Troubleshooting

- **"node:sqlite" not found / server exits at start:** your Node is older than 22.13. Run `node --version` and upgrade. With a GUI client, the Node it launches may differ from your shell's; use the full-path option in install C.
- **The tools do not appear:** restart the client after adding the server. In Claude Code run `claude mcp list` and check that `gastos` is connected.
- **`npx` is slow the first time:** it downloads the package once, then caches it.
- **Data is not where I expect:** check `GASTOS_DB` in the server's env; without it the file is `~/.gastos-mcp/gastos.db`.
- **A movement was read wrong:** there is no edit or delete tool yet (see Limitations).

## Limitations

- No tool to edit or delete a movement yet.
- Gmail sync needs a one-time Google Cloud setup of your own (see [docs/gmail-setup.md](docs/gmail-setup.md)). It has been tested against simulated Google responses and real BBVA email formats, not yet end to end against Google's servers.
- Parsers exist only for BBVA Colombia. Other banks need a parser in `src/parsers/` (or the manual path through Claude's Gmail connector).
- Foreign-currency transfers are not registered automatically; they are reported for your review.
- The server trusts the `From` address Gmail reports and relies on Gmail's own spoofing protection; it does not verify DKIM itself yet. Text taken from emails (merchant, subject) is cleaned and length-limited before it reaches the model, but treat it as data.
- Amounts are integer COP only.

Roadmap ideas for a second phase: edit and delete movements, receipt rules for more banks, more currencies.

## Status and development

Pre-release (0.1.0). Not published to npm yet.

```bash
npm install
npm test            # unit tests
npm run typecheck
npm run build
npm run smoke:pack  # npm pack, install the tarball in a temp dir, check 18 tools over stdio
npm run build:mcpb  # optional: builds build/expenditures-control.mcpb
```

Repository: https://github.com/estebanjc78/expenditures-control

## License

[MIT](LICENSE) © 2026 Esteban J. Campos
