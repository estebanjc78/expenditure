// Bundles the server into one JS file and packs it as a .mcpb with the official CLI.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stage = resolve(root, "build/mcpb");
const out = resolve(root, "build/expenditures-control.mcpb");

rmSync(resolve(root, "build"), { recursive: true, force: true });
mkdirSync(resolve(stage, "server"), { recursive: true });

await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile: resolve(stage, "server/index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  // some dependencies (exceljs) are CommonJS and call require() at runtime
  banner: { js: 'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);' },
  legalComments: "none",
});
cpSync(resolve(root, "manifest.json"), resolve(stage, "manifest.json"));

const mcpb = resolve(root, "node_modules/.bin/mcpb");
execFileSync(mcpb, ["validate", resolve(stage, "manifest.json")], { stdio: "inherit" });
execFileSync(mcpb, ["pack", stage, out], { stdio: "inherit" });
console.log(`built ${out}`);
