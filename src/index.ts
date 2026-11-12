#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveDbPath } from "./db-path.js";
import { openDb } from "./db.js";
import { createGmailService } from "./gmail/service.js";
import { createServer } from "./server.js";

const dbPath = resolveDbPath(process.env.GASTOS_DB, homedir());
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });

const dataDir = dbPath === ":memory:" ? dirname(resolveDbPath(undefined, homedir())) : dirname(dbPath);
const server = createServer(openDb(dbPath), { gmail: createGmailService({ dataDir }) });
await server.connect(new StdioServerTransport());
