import { APP_CLIENT_JS } from "./app-client.generated.js";
import { STYLES } from "./web-styles.js";
import { APP_GLUE } from "./web-app-glue.js";
import { SCRIPT_BASE } from "./web-script-base.js";
import { SCRIPT_CHARTS } from "./web-script-charts.js";
import { SCRIPT_MAIN } from "./web-script-main.js";
import { SCRIPT_SECTIONS } from "./web-script-sections.js";

const SCRIPT = `(function () {\n"use strict";${SCRIPT_BASE}${SCRIPT_CHARTS}${SCRIPT_SECTIONS}${SCRIPT_MAIN}\n})();`;

/** The single HTML page of the dashboard. Styles and script are inline and carry the per-response CSP nonce. */
export function renderPage(nonce: string): string {
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%278%27 fill=%27%232a78d6%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%276%27 fill=%27white%27/%3E%3C/svg%3E">',
    "<title>Gastos</title>",
    `<style nonce="${nonce}">${STYLES}</style></head>`,
    '<body><div id="app" class="app"></div><div id="tip" class="tip" role="tooltip" hidden></div>',
    `<script nonce="${nonce}">${SCRIPT}</script></body></html>`,
  ].join("");
}

/**
 * The same dashboard as an MCP App, to be rendered by Claude inside the conversation. Everything is inline
 * (the host sandbox allows inline scripts and styles), nothing is loaded from the internet, and data comes
 * from the private `datos_panel` tool instead of HTTP.
 */
export function renderAppPage(): string {
  return [
    '<!doctype html><html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<title>Gastos</title>",
    `<style>${STYLES}</style></head>`,
    '<body><div id="app" class="app"></div><div id="tip" class="tip" role="tooltip" hidden></div>',
    `<script type="module">${APP_CLIENT_JS}\n${APP_GLUE}\n${SCRIPT}</script></body></html>`,
  ].join("");
}
