// Smoke test: npm pack -> install the tarball in a temp dir -> run its bin over stdio -> expect 13 tools.
// npm always ships root README* files, so README.es.md is allowed alongside README.md.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const EXPECTED_TOOLS = 13;
const root = resolve(import.meta.dirname, "..");
const work = mkdtempSync(join(tmpdir(), "expenditures-smoke-"));

try {
  const packOut = execFileSync("npm", ["pack", "--json", "--pack-destination", work], {
    cwd: root,
    encoding: "utf8",
  });
  const [info] = JSON.parse(packOut);
  const bad = info.files.map((f) => f.path).filter(
    (p) => !(p.startsWith("dist/") || p === "README.md" || p === "README.es.md" || p === "package.json" || p === "LICENSE"),
  );
  if (bad.length > 0) throw new Error(`unexpected files in tarball: ${bad.join(", ")}`);

  const install = join(work, "install");
  execFileSync("npm", ["init", "-y"], { cwd: work, stdio: "ignore" });
  execFileSync("mkdir", [install]);
  execFileSync("npm", ["init", "-y"], { cwd: install, stdio: "ignore" });
  execFileSync("npm", ["install", join(work, info.filename)], { cwd: install, stdio: "ignore" });

  const pkgName = readdirSync(join(install, "node_modules")).find((n) => n === "expenditures-control");
  if (!pkgName) throw new Error("package expenditures-control not installed");
  const bin = join(install, "node_modules", ".bin", "expenditures-control");

  const transport = new StdioClientTransport({
    command: bin,
    env: { ...process.env, GASTOS_DB: ":memory:" },
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  if (tools.length !== EXPECTED_TOOLS) throw new Error(`expected ${EXPECTED_TOOLS} tools, got ${tools.length}`);
  console.log(`smoke ok: ${tools.length} tools, ${info.files.length} files in ${info.filename}`);
} catch (err) {
  console.error("smoke FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
