#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDb } from "./db.js";
import { createServer } from "./server.js";

const dbPath = process.env.GASTOS_DB ?? join(homedir(), ".gastos-mcp", "gastos.db");
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const server = createServer(openDb(dbPath));
await server.connect(new StdioServerTransport());
