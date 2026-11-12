import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createGmailService } from "./gmail/service.js";
import type { GmailService } from "./gmail/service.js";
import { registerBudgetTools } from "./tools/budget.js";
import { registerFormatTools } from "./tools/formats.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerPanelTools } from "./tools/panel.js";
import type { PanelToolOptions } from "./tools/panel.js";
import { registerSenderTools } from "./tools/senders.js";
import { registerMovementTools } from "./tools/movements.js";

export interface ServerOptions {
  /** Gmail access. Defaults to an unconfigured service (no client, no token). */
  readonly gmail?: GmailService;
  /** Dashboard options (tests inject a fake browser opener). */
  readonly panel?: PanelToolOptions;
}

export function createServer(db: DatabaseSync, options: ServerOptions = {}): McpServer {
  const gmail = options.gmail ?? createGmailService({ dataDir: join(tmpdir(), `gastos-mcp-no-gmail-${randomUUID()}`), env: {} });
  const server = new McpServer({ name: "gastos", version: "0.1.0" });
  registerMovementTools(server, db);
  registerBudgetTools(server, db);
  registerSenderTools(server, db);
  registerGmailTools(server, db, gmail);
  registerFormatTools(server, db);
  registerPanelTools(server, db, options.panel);
  return server;
}
