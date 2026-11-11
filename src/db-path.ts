import { join } from "node:path";

/** Resolves GASTOS_DB: blank = default, leading `~` expands to the home dir. */
export function resolveDbPath(env: string | undefined, homeDir: string): string {
  const raw = env?.trim();
  if (!raw) return join(homeDir, ".gastos-mcp", "gastos.db");
  if (raw === "~") return homeDir;
  if (raw.startsWith("~/")) return join(homeDir, raw.slice(2));
  return raw;
}
