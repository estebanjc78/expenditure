import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DatabaseSync } from "node:sqlite";
import { registerBudgetTools } from "./tools/budget.js";
import { registerMovementTools } from "./tools/movements.js";

export function createServer(db: DatabaseSync): McpServer {
  const server = new McpServer({ name: "gastos", version: "0.1.0" });
  registerMovementTools(server, db);
  registerBudgetTools(server, db);
  return server;
}
