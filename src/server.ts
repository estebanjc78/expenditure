import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createGmailService } from "./gmail/service.js";
import type { GmailService } from "./gmail/service.js";
import { registerBudgetTools } from "./tools/budget.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerSenderTools } from "./tools/senders.js";
import { registerMovementTools } from "./tools/movements.js";

export interface ServerOptions {
  /** Gmail access. Defaults to an unconfigured service (no client, no token). */
  readonly gmail?: GmailService;
}

export function createServer(db: DatabaseSync, options: ServerOptions = {}): McpServer {
  const gmail = options.gmail ?? createGmailService({ dataDir: join(tmpdir(), "gastos-mcp-no-gmail"), env: {} });
  const server = new McpServer({ name: "gastos", version: "0.1.0" });
  registerMovementTools(server, db);
  registerBudgetTools(server, db);
  registerSenderTools(server, db);
  registerGmailTools(server, db, gmail);
  return server;
}
