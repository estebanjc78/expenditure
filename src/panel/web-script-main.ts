/** Dashboard script, part 4: movements table, filters, navigation, theme, loading, live refresh and startup. */
export const SCRIPT_MAIN = String.raw`
function filteredMovements() {
  var f = state.filters, q = plain(f.q || "");
  var rows = state.data.movements.filter(function (m) {
    if (f.kind === "gasto" && m.kind !== "gasto") return false;
    if (f.kind === "ingreso" && m.kind !== "ingreso") return false;
    if (f.kind === "transferencia_propia" && m.kind !== "transferencia_propia") return false;
    if (f.category && (m.kind !== "gasto" || (m.category || "sin_categoria") !== f.category)) return false;
    if (f.day && Number(m.date.slice(8, 10)) !== f.day) return false;
    if (f.merchant && plain(m.merchant) !== f.merchant.key) return false;
    return !q || plain(m.merchant).indexOf(q) >= 0;
  });
  var key = state.sort.key, dir = state.sort.dir;
  return rows.sort(function (a, b) {
    var diff = key === "amount" ? a.amount - b.amount : (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
    return diff * dir;
  });
}
function hasFilters() { var f = state.filters; return !!(f.category || f.day || f.merchant || f.q || f.kind !== "all"); }
function clearFilters() { ui.search.value = ""; setFilter({ category: null, day: null, merchant: null, kind: "all", q: "" }); }
function setFilter(patch) {
  for (var k in patch) state.filters[k] = patch[k];
  state.limit = 50;
  renderDays(); renderMerchants(); renderMovements();
}
function kindLabel(m) { return m.kind === "ingreso" ? "Ingreso" : m.kind === "transferencia_propia" ? "Entre tus cuentas" : catName(m.category); }

function sortHeader(label, key, right) {
  var active = state.sort.key === key, arrow = active ? (state.sort.dir === 1 ? " ↑" : " ↓") : "";
  return h("th", { class: right ? "r" : "", "aria-sort": active ? (state.sort.dir === 1 ? "ascending" : "descending") : "none" },
    h("button", { onclick: function () { state.sort = { key: key, dir: active ? -state.sort.dir : -1 }; renderMovements(); } }, label + arrow));
}

function renderChips() {
  var f = state.filters, chips = [];
  function chip(text, onRemove) { return h("span", { class: "chip" }, [text, h("button", { "aria-label": "Quitar filtro " + text, onclick: onRemove }, "×")]); }
  if (f.category) chips.push(chip("Categoría: " + catName(f.category), function () { setFilter({ category: null }); }));
  if (f.day) chips.push(chip("Día: " + dayLabel(isoDay(state.month, f.day)), function () { setFilter({ day: null }); }));
  if (f.merchant) chips.push(chip("Comercio: " + f.merchant.label, function () { setFilter({ merchant: null }); }));
  clear(ui.chips); append(ui.chips, chips);
}

function setHighlight(hl) {
  state.highlight = hl ? { query: hl.query, ids: new Set(hl.ids || []), scroll: !!(hl.ids && hl.ids.length) } : null;
  if (ui.built && state.data) { renderBanner(); renderMovements(); }
}
function scrollToHighlight() {
  var el = ui.tableHost.querySelector("tr.hl");
  if (el) el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
}

function renderMovements() {
  var rows = filteredMovements();
  var hl = state.highlight;
  if (hl && hl.ids.size) {
    var last = -1;
    rows.forEach(function (m, i) { if (hl.ids.has(m.id)) last = i; });
    if (last >= state.limit) state.limit = last + 1;
  }
  var shown = rows.slice(0, state.limit);
  clear(ui.kindSeg);
  [["all", "Todos"], ["gasto", "Gastos"], ["ingreso", "Ingresos"], ["transferencia_propia", "Entre cuentas"]].forEach(function (k) {
    ui.kindSeg.appendChild(h("button", { "aria-pressed": String(state.filters.kind === k[0]), onclick: function () { setFilter({ kind: k[0] }); } }, k[1]));
  });
  renderChips();
  clear(ui.tableHost); clear(ui.more);
  if (!rows.length) {
    ui.tableHost.appendChild(h("div", { class: "empty" }, hasFilters()
      ? [h("strong", { text: "Nada coincide con estos filtros" }), h("button", { class: "linkish", onclick: clearFilters }, "Quitar filtros")]
      : [h("strong", { text: "Sin movimientos en " + monthName(state.month).toLowerCase() }), "Cuando cargues tus correos del banco, aparecen aquí."]));
    return;
  }
  var head = h("tr", null, [sortHeader("Fecha", "date", false), h("th", { text: "Comercio" }), h("th", { class: "hide-sm", text: "Categoría" }), h("th", { class: "hide-sm", text: "Banco" }), sortHeader("Monto", "amount", true)]);
  var body = shown.map(function (m) {
    return h("tr", { class: hl && hl.ids.has(m.id) ? "hl" : null }, [
      h("td", { class: "muted num", text: dayLabel(m.date) }),
      h("td", { text: m.merchant }),
      h("td", { class: "hide-sm" }, h("span", { class: "tag", text: kindLabel(m) })),
      h("td", { class: "hide-sm" }, h("span", { class: "tag", text: m.bank.toUpperCase() })),
      h("td", { class: "r num amount" + (m.kind === "ingreso" ? " in" : ""), text: (m.kind === "ingreso" ? "+" : "") + money(m.amount) })
    ]);
  });
  ui.tableHost.appendChild(h("table", null, [h("thead", null, head), h("tbody", null, body)]));
  if (rows.length > shown.length) {
    ui.more.appendChild(h("button", { class: "linkish", onclick: function () { state.limit += 100; renderMovements(); } }, "Mostrar más (" + (rows.length - shown.length) + " restantes)"));
  } else if (state.data.movementsTruncated) {
    ui.more.appendChild(document.createTextNode("Se muestran los 1.000 movimientos más recientes del mes."));
  }
}

/* ---------- navigation ---------- */
function selectableMonths() {
  var all = state.months.slice();
  if (state.currentMonth && all.indexOf(state.currentMonth) < 0) all.push(state.currentMonth);
  return all.sort();
}
function gotoMonth(m) {
  if (m === state.month) return;
  state.month = m; state.etag = null; state.animate = true; state.expanded = {};
  state.filters.category = null; state.filters.day = null; state.filters.merchant = null;
  loadMonth(false);
}
function stepMonth(delta) {
  state.highlight = null;
  var list = selectableMonths(), i = list.indexOf(state.month) + delta;
  if (i >= 0 && i < list.length) gotoMonth(list[i]);
}
function closeMenu() { ui.menu.hidden = true; ui.monthBtn.setAttribute("aria-expanded", "false"); }
function toggleMenu(e) {
  e.stopPropagation();
  ui.menu.hidden = !ui.menu.hidden;
  ui.monthBtn.setAttribute("aria-expanded", String(!ui.menu.hidden));
}

/* ---------- theme ---------- */
var THEMES = ["auto", "light", "dark"], THEME_NAMES = { auto: "automático", light: "claro", dark: "oscuro" };
function currentTheme() { try { return localStorage.getItem("panel-theme") || "auto"; } catch (e) { return "auto"; } }
function applyTheme(mode) {
  if (mode === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", mode);
  if (ui.theme) ui.theme.title = "Tema: " + THEME_NAMES[mode];
}
function cycleTheme() {
  var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try { localStorage.setItem("panel-theme", next); } catch (e) { /* not persisted */ }
  applyTheme(next);
}

/* ---------- loading ---------- */
function showMessage(title, lines) {
  ui.built = false;
  var root = clear(document.getElementById("app"));
  root.appendChild(h("div", { class: "message" }, [h("h1", { text: title })].concat(lines.map(function (l) { return h("p", null, l); }))));
}
function updateLive() {
  if (!ui.liveText) return;
  var secs = Math.round((Date.now() - state.updatedAt) / 1000);
  ui.liveText.textContent = !state.updatedAt ? "Cargando…" : secs < 10 ? "Actualizado ahora" : secs < 90 ? "Actualizado hace " + secs + " s" : "Actualizado hace " + Math.round(secs / 60) + " min";
}
function render() {
  if (!ui.built) buildShell();
  renderTop(); renderBanner(); renderHero(); renderTiles(); renderCategories(); renderMerchants(); renderDays(); renderMovements(); updateLive();
  if (state.highlight && state.highlight.scroll) { state.highlight.scroll = false; setTimeout(scrollToHighlight, 350); }
  ui.root.classList.toggle("enter", state.animate);
  if (state.animate) { state.animate = false; setTimeout(function () { ui.root.classList.remove("enter"); }, 1400); }
}
var failures = 0;
function handleError(e) {
  document.body.classList.remove("loading");
  if (state.error === "auth") { showMessage("La sesión del panel terminó", ["Pídele a Claude: ", h("code", { text: "abre mi panel de gastos" })]); return; }
  failures += 1;
  if (failures >= 2) showMessage("No se pudo conectar con el panel", ["Probablemente se cerró junto con la conversación.", ["Pídele a Claude: ", h("code", { text: "abre mi panel de gastos" })]]);
  else if (ui.liveText) ui.liveText.textContent = "Sin conexión…";
}
function loadMonth(silent) {
  var url = "/api/month?month=" + state.month + (state.bank ? "&bank=" + encodeURIComponent(state.bank) : "");
  if (!silent) document.body.classList.add("loading");
  return api(url, silent ? state.etag : null).then(function (r) {
    failures = 0;
    document.body.classList.remove("loading");
    state.updatedAt = Date.now();
    if (r.notModified) { updateLive(); return; }
    var sig = JSON.stringify(r.json);
    if (silent && sig === state.sig) { updateLive(); return; }
    state.sig = sig;
    state.data = r.json; state.etag = r.etag;
    render();
  }).catch(handleError);
}
function loadAll(silent) {
  return api("/api/months").then(function (r) {
    state.months = r.json.months; state.currentMonth = r.json.currentMonth;
    if (!state.months.length) {
      state.data = null; state.month = null;
      showMessage("Todavía no hay movimientos", ["Cuando Claude cargue tus correos del banco, tus gastos aparecerán aquí.", ["Pídele: ", h("code", { text: "carga mis correos del banco" })]]);
      return null;
    }
    if (!state.month) state.month = state.requested || (state.months.indexOf(state.currentMonth) >= 0 ? state.currentMonth : state.months[state.months.length - 1]);
    return loadMonth(silent);
  }).catch(handleError);
}

/* ---------- startup ---------- */
function debounce(fn, ms) { var t = null; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
(function start() {
  applyTheme(currentTheme());
  var inApp = !!window.__MCP_APP__;
  if (inApp) {
    state.token = "mcp-app";
    window.__MCP_APP__.onMonth = function (m) { if (ui.built && m !== state.month) gotoMonth(m); else state.requested = m; };
    window.__MCP_APP__.onHighlight = setHighlight;
  } else {
    var t = readToken();
    state.token = t.token; state.requested = t.month;
    if (!state.token) { showMessage("Abre el panel desde Claude", ["Este panel solo se abre con una dirección privada que genera Claude.", ["Pídele: ", h("code", { text: "abre mi panel de gastos" })]]); return; }
  }
  var begin = function () {
    loadAll(false);
    setInterval(function () { if (!document.hidden && state.error !== "auth") loadAll(true); }, inApp ? 60000 : POLL_MS);
    setInterval(updateLive, 5000);
  };
  if (inApp) {
    window.__MCP_APP__.ready.then(function () {
      window.__MCP_APP__.applyHostTheme();
      if (window.__MCP_APP__.initialMonth) state.requested = window.__MCP_APP__.initialMonth;
      if (window.__MCP_APP__.highlight) setHighlight(window.__MCP_APP__.highlight);
      begin();
    }, function () { showMessage("No se pudo conectar con Claude", ["Vuelve a pedirle a Claude que te muestre el panel."]); });
  } else begin();
  window.addEventListener("resize", debounce(function () { if (state.data && ui.built) { renderHero(); renderDays(); } }, 140));
  document.addEventListener("click", function (e) { if (ui.menu && !ui.menu.hidden && !ui.menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", function (e) {
    var tag = e.target && e.target.tagName;
    if (e.key === "Escape" && ui.menu && !ui.menu.hidden) { closeMenu(); return; }
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey || !state.data) return;
    if (e.key === "/") { e.preventDefault(); ui.search.focus(); }
    else if (e.target === document.body && e.key === "ArrowLeft") stepMonth(-1);
    else if (e.target === document.body && e.key === "ArrowRight") stepMonth(1);
  });
})();
`;
