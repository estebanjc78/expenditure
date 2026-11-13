/**
 * Glue for running the dashboard as an MCP App inside Claude: the embedded `App` client does the handshake
 * with the host, the report asks the server for data with a private tool, and the host's theme is applied.
 * Written without backticks or dollar-brace so it can live in String.raw.
 */
export const APP_GLUE = String.raw`
const app = new App({ name: "Expenditures Control", version: "0.1.0" });
const bridge = { app: app, initialMonth: null, highlight: null, onMonth: null, onHighlight: null, ready: null };
window.__MCP_APP__ = bridge;
function applyHostTheme(ctx) {
  if (ctx && (ctx.theme === "light" || ctx.theme === "dark")) document.documentElement.setAttribute("data-theme", ctx.theme);
}
bridge.applyHostTheme = function () { applyHostTheme(app.getHostContext && app.getHostContext()); };
app.onhostcontextchanged = applyHostTheme;
app.ontoolresult = function (result) {
  var sc = result && result.structuredContent;
  if (sc && sc.month) { bridge.initialMonth = sc.month; if (bridge.onMonth) bridge.onMonth(sc.month); }
  bridge.highlight = sc && sc.highlight ? sc.highlight : null;
  if (bridge.onHighlight) bridge.onHighlight(bridge.highlight);
};
bridge.ready = app.connect();
`;
