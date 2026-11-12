/**
 * Glue for running the dashboard as an MCP App inside Claude: the embedded `App` client does the handshake
 * with the host, the report asks the server for data with a private tool, and the host's theme is applied.
 * Written without backticks or dollar-brace so it can live in String.raw.
 */
export const APP_GLUE = String.raw`
const app = new App({ name: "Expenditures Control", version: "0.1.0" });
const bridge = { app: app, initialMonth: null, onMonth: null, ready: null };
window.__MCP_APP__ = bridge;
function applyHostTheme(ctx) {
  if (ctx && (ctx.theme === "light" || ctx.theme === "dark")) document.documentElement.setAttribute("data-theme", ctx.theme);
}
bridge.applyHostTheme = function () { applyHostTheme(app.getHostContext && app.getHostContext()); };
app.onhostcontextchanged = applyHostTheme;
app.ontoolresult = function (result) {
  var month = result && result.structuredContent && result.structuredContent.month;
  if (month) { bridge.initialMonth = month; if (bridge.onMonth) bridge.onMonth(month); }
};
bridge.ready = app.connect();
`;
