/** Dashboard script, part 3: page shell and one render function per section. */
export const SCRIPT_SECTIONS = String.raw`
function cumulative(items, upTo) {
  var perDay = {}, out = [], sum = 0;
  items.forEach(function (x) { perDay[x.day] = (perDay[x.day] || 0) + x.total; });
  for (var d = 1; d <= upTo; d++) { sum += perDay[d] || 0; out.push(sum); }
  return out;
}
function isCurrent(d) { return d.month === d.today.slice(0, 7); }
function lastShownDay(d) { return isCurrent(d) ? Number(d.today.slice(8, 10)) : daysIn(d.month); }
function pctDelta(cur, prev) { return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null; }
function gastos(d) { return d.movements.filter(function (m) { return m.kind === "gasto"; }); }
function hasSel() { var f = state.filters; return !!(f.category || f.merchant || f.day); }
/** Cross-filter: does a spending movement pass the current selection (category, merchant, day)? skip ignores one dimension, so each visual can show the rest. */
function passSel(m, skip) {
  var f = state.filters;
  if (f.category && skip !== "category" && (m.category || "sin_categoria") !== f.category) return false;
  if (f.merchant && skip !== "merchant" && plain(m.merchant) !== f.merchant.key) return false;
  if (f.day && skip !== "day" && Number(m.date.slice(8, 10)) !== f.day) return false;
  return true;
}
function selGastos(skip) { return gastos(state.data).filter(function (m) { return passSel(m, skip); }); }
function sumOf(list) { return list.reduce(function (t, m) { return t + m.amount; }, 0); }
function dayOf(m) { return Number(m.date.slice(8, 10)); }

function buildShell() {
  var root = ui.root = clear(document.getElementById("app"));
  ui.prev = h("button", { class: "icon-btn", "aria-label": "Mes anterior", onclick: function () { stepMonth(-1); } }, icon("left"));
  ui.next = h("button", { class: "icon-btn", "aria-label": "Mes siguiente", onclick: function () { stepMonth(1); } }, icon("right"));
  ui.monthText = h("span", { text: "…" });
  ui.monthBtn = h("button", { class: "month-btn", "aria-haspopup": "menu", "aria-expanded": "false", onclick: toggleMenu }, [ui.monthText, h("span", { class: "muted", text: "▾" })]);
  ui.menu = h("div", { class: "menu", role: "menu", hidden: true });
  ui.bank = h("select", { class: "select", "aria-label": "Filtrar por banco", hidden: true, onchange: function (e) { state.bank = e.target.value; state.etag = null; state.animate = true; loadMonth(false); } });
  ui.liveText = h("span", { text: "Cargando…" });
  ui.refresh = h("button", { class: "icon-btn", "aria-label": "Actualizar", title: "Actualizar", onclick: function () { ui.refresh.classList.add("spin"); loadAll(false).then(function () { ui.refresh.classList.remove("spin"); }); } }, icon("refresh"));
  ui.theme = h("button", { class: "icon-btn", "aria-label": "Cambiar tema", title: "Tema: automático", onclick: cycleTheme }, icon("sun"));
  var top = h("header", { class: "top" }, [
    h("div", { class: "brand" }, [h("i"), "Gastos"]),
    h("div", { class: "month-nav" }, [ui.prev, ui.monthBtn, ui.next, ui.menu]),
    h("div", { class: "spacer" }), ui.bank,
    h("span", { class: "live", "aria-live": "polite" }, [h("i"), ui.liveText]), ui.refresh, ui.theme
  ]);

  ui.heroLabel = h("div", { class: "label" });
  ui.heroValue = h("div", { class: "hero-value num", "aria-live": "polite", text: "$ 0" });
  ui.heroDelta = h("div");
  ui.heroNote = h("p", { class: "hero-note" });
  ui.lineHost = h("div", { class: "chart-host" });
  ui.legendA = h("span", { class: "a" }, [h("i"), h("span")]);
  ui.legendB = h("span", { class: "b" }, [h("i"), h("span")]);
  ui.legendS = h("span", { class: "s", hidden: true }, [h("i"), h("span", { text: "Selección" })]);
  ui.lineToggle = h("button", { class: "linkish", onclick: function () { state.view.line = state.view.line === "chart" ? "table" : "chart"; renderHero(); } });
  var hero = h("section", { class: "card hero" }, [
    h("div", { class: "hero-top" }, [h("div", null, [ui.heroLabel, ui.heroValue]), h("div", { class: "hero-side" }, [ui.heroDelta, ui.heroNote])]),
    h("div", { class: "hero-chart" }, [
      h("div", { class: "card-head" }, [h("div", null, [h("h2", { text: "Ritmo del mes" }), h("p", { class: "sub", text: "Gasto acumulado, día a día" })]), h("div", { class: "tools" }, [h("div", { class: "legend" }, [ui.legendA, ui.legendB, ui.legendS]), ui.lineToggle])]),
      ui.lineHost,
      h("p", { class: "chart-note", text: "Los totales no incluyen impuestos ni cargos bancarios (4x1000, IVA, comisiones y cuotas de manejo), que solo aparecen en el extracto del banco: pueden diferir de él." })
    ])
  ]);

  ui.tiles = h("section", { class: "tiles" });
  ui.catList = h("div", { class: "meter-list" });
  ui.rank = h("div", { class: "rank" });
  ui.daysHost = h("div", { class: "chart-host" });
  ui.daysToggle = h("button", { class: "linkish", onclick: function () { state.view.days = state.view.days === "chart" ? "table" : "chart"; renderDays(); } });
  ui.search = h("input", { class: "search", type: "search", placeholder: "Buscar un comercio…", "aria-label": "Buscar un comercio", oninput: function (e) { state.filters.q = e.target.value; state.limit = 50; renderMovements(); } });
  ui.kindSeg = h("div", { class: "seg", role: "group", "aria-label": "Tipo de movimiento" });
  ui.chips = h("div", { class: "chips" });
  ui.tableHost = h("div");
  ui.more = h("div", { class: "foot" });

  var cats = h("section", { class: "card" }, [h("div", { class: "card-head" }, h("div", null, [h("h2", { text: "Por categoría" }), h("p", { class: "sub", text: "Toca una para ver sus movimientos" })])), ui.catList]);
  var merchants = h("section", { class: "card" }, [h("div", { class: "card-head" }, h("div", null, [h("h2", { text: "Dónde se fue" }), h("p", { class: "sub", text: "Los comercios con más gasto" })])), ui.rank]);
  var days = h("section", { class: "card" }, [h("div", { class: "card-head" }, [h("div", null, [h("h2", { text: "Día a día" }), h("p", { class: "sub", text: "Toca un día para filtrar los movimientos" })]), ui.daysToggle]), ui.daysHost]);
  ui.moveCard = h("section", { class: "card", id: "movimientos" }, [
    h("div", { class: "card-head" }, h("div", null, [h("h2", { text: "Movimientos" }), h("p", { class: "sub", text: "Todo lo que registraste este mes" })])),
    h("div", { class: "toolbar" }, [ui.search, ui.kindSeg]), ui.chips, ui.tableHost, ui.more
  ]);

  ui.banner = h("div", { class: "banner", role: "status", hidden: true });
  ui.selbar = h("div", { class: "selbar", role: "status", hidden: true });
  ui.stack = h("main", { class: "stack" }, [ui.selbar, ui.banner, hero, ui.tiles, h("div", { class: "cols" }, [cats, merchants]), days, ui.moveCard]);
  append(root, [top, ui.stack, h("p", { class: "foot", text: "Tus datos se quedan en este computador. El panel se actualiza solo." })]);
  ui.built = true;
}

function renderBanner() {
  var hl = state.highlight;
  clear(ui.banner);
  if (!hl) { ui.banner.hidden = true; return; }
  var n = state.data ? state.data.movements.filter(function (m) { return hl.ids.has(m.id); }).length : 0;
  ui.banner.hidden = false;
  append(ui.banner, [
    h("span", { class: "banner-text", text: n ? "Resaltado en la tabla: " + plural(n, "movimiento", "movimientos") + " para «" + hl.query + "»" : "No hay movimientos para «" + hl.query + "» en este mes" }),
    n ? h("button", { class: "linkish", onclick: scrollToHighlight }, "Verlo ↓") : null,
    h("button", { class: "icon-btn", "aria-label": "Quitar el resaltado", onclick: function () { setHighlight(null); } }, "×")
  ]);
}

function renderSelBar() {
  var f = state.filters, bar = ui.selbar;
  clear(bar);
  if (!hasSel()) { bar.hidden = true; return; }
  function chip(text, onRemove) { return h("span", { class: "chip" }, [text, h("button", { "aria-label": "Quitar " + text, onclick: onRemove }, "×")]); }
  var chips = [];
  if (f.category) chips.push(chip(catName(f.category), function () { setFilter({ category: null }); }));
  if (f.merchant) chips.push(chip(f.merchant.label, function () { setFilter({ merchant: null }); }));
  if (f.day) chips.push(chip(dayLabel(isoDay(state.month, f.day)), function () { setFilter({ day: null }); }));
  var total = sumOf(selGastos()), all = state.data.totals.spent;
  append(bar, [
    h("span", { class: "sel-label", text: "Selección" }), chips,
    h("span", { class: "sel-total num", text: money(total) + (all ? " · " + Math.round((total / all) * 100) + " % del gasto" : "") }),
    h("button", { class: "linkish", onclick: function () { setFilter({ category: null, day: null, merchant: null }); } }, "Limpiar")
  ]);
  bar.hidden = false;
}

function renderTop() {
  var d = state.data;
  ui.monthText.textContent = monthLabel(state.month);
  document.title = "Gastos · " + monthLabel(state.month);
  var first = state.months[0] || state.month, lastKnown = state.months[state.months.length - 1] || state.month;
  var last = state.currentMonth && state.currentMonth > lastKnown ? state.currentMonth : lastKnown;
  ui.prev.disabled = state.month <= first;
  ui.next.disabled = state.month >= last;
  var banks = d ? d.banks : [];
  ui.bank.hidden = banks.length < 2;
  if (banks.length >= 2) {
    clear(ui.bank);
    ui.bank.appendChild(h("option", { value: "", text: "Todos los bancos" }));
    banks.forEach(function (b) { ui.bank.appendChild(h("option", { value: b, text: b.toUpperCase() })); });
    ui.bank.value = state.bank;
  }
  renderMenu();
}

function renderMenu() {
  clear(ui.menu);
  var all = state.months.slice();
  if (state.currentMonth && all.indexOf(state.currentMonth) < 0) all.push(state.currentMonth);
  all.sort().reverse().forEach(function (m) {
    ui.menu.appendChild(h("button", { role: "menuitemradio", "aria-checked": String(m === state.month), onclick: function () { closeMenu(); state.highlight = null; gotoMonth(m); } }, [monthLabel(m), m === state.month ? "✓" : ""]));
  });
}

function renderHero() {
  var d = state.data, cur = isCurrent(d), lastA = lastShownDay(d), prevDays = daysIn(d.prevMonth);
  var a = cumulative(d.daily.map(function (x) { return { day: Number(x.date.slice(8, 10)), total: x.total }; }), lastA);
  var b = cumulative(d.prevDaily, prevDays);
  ui.heroLabel.textContent = cur ? "Gasto de " + monthName(d.month).toLowerCase() + " hasta hoy" : "Gasto de " + monthName(d.month).toLowerCase();
  countTo(ui.heroValue, state.animate ? 0 : state.heroShown, d.totals.spent);
  state.heroShown = d.totals.spent;

  var base = d.totals.prevSpentToDate;
  var pct = pctDelta(d.totals.spent, base);
  clear(ui.heroDelta);
  if (d.totals.spent === 0 && d.totals.prevSpent === 0) ui.heroDelta.appendChild(h("span", { class: "delta flat", text: "Sin gastos registrados en este período" }));
  else if (pct === null) ui.heroDelta.appendChild(h("span", { class: "delta flat", text: "No hay datos de " + monthName(d.prevMonth).toLowerCase() + " para comparar" }));
  else {
    var up = pct > 0, flat = pct === 0;
    var diff = Math.abs(d.totals.spent - base);
    ui.heroDelta.appendChild(h("span", { class: "delta " + (flat ? "flat" : up ? "up" : "down") }, [
      h("span", { class: "glyph", "aria-hidden": "true", text: flat ? "＝" : up ? "▲" : "▼" }),
      h("span", { text: flat ? "Igual que " + monthName(d.prevMonth).toLowerCase() : Math.abs(pct) + " % " + (up ? "más" : "menos") + " que " + monthName(d.prevMonth).toLowerCase() + (cur ? " a esta altura" : "") + " (" + money(diff) + ")" })
    ]));
  }
  var day = Number(d.today.slice(8, 10));
  ui.heroNote.textContent = cur && day >= 5 && d.totals.spent > 0 ? "A este ritmo cerrarás el mes cerca de " + compact((d.totals.spent / day) * daysIn(d.month)) + "." : "";

  ui.legendA.lastChild.textContent = monthName(d.month);
  ui.legendB.lastChild.textContent = monthName(d.prevMonth);
  ui.lineToggle.textContent = state.view.line === "chart" ? "Ver como tabla" : "Ver gráfico";
  var N = Math.max(daysIn(d.month), prevDays);
  var sf = state.filters, selSeries = null;
  if (sf.category || sf.merchant) {
    selSeries = { label: "Selección", values: cumulative(selGastos("day").map(function (m) { return { day: dayOf(m), total: m.amount }; }), lastA) };
  }
  ui.legendS.hidden = !selSeries;
  if (state.view.line === "table") {
    var rows = [];
    for (var i = 1; i <= N; i++) rows.push(["Día " + i, a[i - 1] === undefined ? "—" : money(a[i - 1]), b[i - 1] === undefined ? "—" : money(b[i - 1])]);
    clear(ui.lineHost).appendChild(h("div", { style: { maxHeight: "300px", overflow: "auto" } }, simpleTable(["Día", monthName(d.month), monthName(d.prevMonth)], rows)));
  } else {
    lineChart(ui.lineHost, { days: N, a: { label: monthName(d.month), values: a }, b: { label: monthName(d.prevMonth), values: b }, sel: selSeries });
  }
}

function tile(label, value, sub, subClass, onClick) {
  var kids = [h("div", { class: "label", text: label }), h("div", { class: "tile-value num", text: value }), h("div", { class: "tile-sub " + (subClass || ""), text: sub })];
  return onClick ? h("button", { class: "card tile", onclick: onClick }, kids) : h("div", { class: "card tile" }, kids);
}

function renderTiles() {
  var t = state.data.totals, d = state.data, balance = t.income - t.spent;
  clear(ui.tiles);
  ui.tiles.appendChild(tile("Ingresos", money(t.income), t.prevIncome > 0 ? monthName(d.prevMonth) + ": " + compact(t.prevIncome) : "Sin ingresos el mes anterior", ""));
  ui.tiles.appendChild(tile("Balance", money(balance), t.income === 0 && t.spent === 0 ? "Aún sin movimientos" : balance >= 0 ? "Te sobró este mes" : "Gastaste más de lo que ingresó", t.income === 0 && t.spent === 0 ? "" : balance >= 0 ? "good" : "bad"));
  var u = t.uncategorized;
  ui.tiles.appendChild(tile("Sin categoría", money(u.amount), u.count === 0 ? "Todo está clasificado ✓" : plural(u.count, "movimiento", "movimientos") + " por revisar", u.count === 0 ? "good" : "",
    u.count === 0 ? null : function () { setFilter({ category: "sin_categoria", kind: "gasto" }); document.getElementById("movimientos").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" }); }));
}

function statusBadge(kind, over) {
  return h("span", { class: "status " + kind }, [icon("alert"), over ? "Superaste el presupuesto" : kind === "danger" ? "Llegaste al límite" : "Cerca del límite"]);
}

function miniList(cat) {
  var rows = gastos(state.data).filter(function (m) { return (m.category || "sin_categoria") === cat; });
  var list = h("ul", { class: "mini" }, rows.slice(0, 6).map(function (m) {
    return h("li", null, [h("span", { class: "d", text: dayLabel(m.date) }), h("span", { class: "m", text: m.merchant }), h("span", { class: "num", text: money(m.amount) })]);
  }));
  var kids = [list];
  if (rows.length > 6) kids.push(h("button", { class: "linkish more", onclick: function () { setFilter({ category: cat, kind: "gasto" }); document.getElementById("movimientos").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" }); } }, "Ver los " + rows.length + " en la tabla"));
  if (cat === "sin_categoria") kids.push(h("p", { class: "sub more", text: "Pídele a Claude que los clasifique y desaparecen de aquí." }));
  return kids;
}

function renderCategories() {
  var d = state.data, f = state.filters, shown = d.categories.filter(function (c) { return c.spent > 0 || c.budget !== null; });
  var bySel = null;
  if (f.merchant || f.day) {
    bySel = {};
    selGastos("category").forEach(function (m) { var k = m.category || "sin_categoria"; bySel[k] = (bySel[k] || 0) + m.amount; });
  }
  clear(ui.catList);
  if (!shown.length) { ui.catList.appendChild(h("p", { class: "empty", text: "Sin gastos en este mes." })); return; }
  shown.forEach(function (c) {
    var hasBudget = c.budget !== null, pct = hasBudget ? c.percent : (d.totals.spent ? Math.round((c.spent / d.totals.spent) * 100) : 0);
    var over = hasBudget && c.spent > c.budget;
    var sev = hasBudget ? (c.spent >= c.budget ? "danger" : c.alert ? "warn" : "") : "";
    var dp = pctDelta(c.spent, c.prevSpent);
    var open = !!state.expanded[c.category];
    var picked = f.category === c.category;
    var dim = (f.category && !picked) || (bySel && !bySel[c.category]);
    var left = [plural(c.count, "movimiento", "movimientos")];
    if (dp !== null && dp !== 0) left.push((dp > 0 ? "▲ " : "▼ ") + Math.abs(dp) + " % vs " + monthName(d.prevMonth).toLowerCase());
    if (bySel && bySel[c.category]) left.push("Selección: " + money(bySel[c.category]));
    var right = hasBudget ? ["de " + money(c.budget) + " · " + pct + " %"] : [pct + " % del gasto"];
    if (sev) right.unshift(statusBadge(sev, over));
    var fill = h("span", { class: "fill " + sev }); fill.style.width = Math.min(100, Math.max(c.spent > 0 ? 2 : 0, pct)) + "%";
    var chev = h("span", { class: "chev", role: "button", tabindex: "0", "aria-label": "Ver los movimientos de " + catName(c.category) }, icon("chev"));
    var row = h("button", { class: "meter-row", "aria-pressed": String(picked), title: "Filtrar todo el reporte por esta categoría" }, [
      h("span", { class: "meter-name" }, [chev, catName(c.category)]),
      h("span", { class: "meter-fig num", text: money(c.spent) }),
      h("span", { class: "meter-sub", text: left.join(" · ") }),
      h("span", { class: "meter-sub right" }, right),
      h("span", { class: "bar" }, fill)
    ]);
    var item = h("div", { class: "meter" + (open ? " open" : "") + (dim ? " dim" : "") }, [row, h("div", { class: "acc" }, h("div", null, miniList(c.category)))]);
    function toggleOpen(e) {
      e.stopPropagation();
      state.expanded[c.category] = !state.expanded[c.category];
      item.classList.toggle("open", state.expanded[c.category]);
    }
    chev.addEventListener("click", toggleOpen);
    chev.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(e); } });
    row.addEventListener("click", function () { setFilter(picked ? { category: null } : { category: c.category, kind: "gasto" }); });
    ui.catList.appendChild(item);
  });
}

function merchantTotals() {
  var f = state.filters;
  if (!f.category && !f.day) return state.data.topMerchants;
  var by = {};
  selGastos("merchant").forEach(function (m) {
    var k = plain(m.merchant), e = by[k] || (by[k] = { merchant: m.merchant, total: 0, count: 0 });
    e.total += m.amount; e.count += 1;
  });
  return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 8);
}

function renderMerchants() {
  var list = merchantTotals(), max = list.length ? list[0].total : 1;
  clear(ui.rank);
  if (!list.length) { ui.rank.appendChild(h("p", { class: "empty", text: hasSel() ? "Sin comercios en esta selección." : "Aún no hay comercios este mes." })); return; }
  list.forEach(function (m) {
    var active = state.filters.merchant && state.filters.merchant.key === plain(m.merchant);
    var fill = h("span", { class: "fill" }); fill.style.width = Math.max(2, (m.total / max) * 100) + "%";
    ui.rank.appendChild(h("button", { class: "rank-row" + (state.filters.merchant && !active ? " dim" : ""), "aria-pressed": String(!!active), title: "Filtrar todo el reporte por este comercio", onclick: function () {
      setFilter({ merchant: active ? null : { key: plain(m.merchant), label: m.merchant } });
    } }, [h("span", { class: "rank-top" }, [h("span", { text: m.merchant }), h("span", { class: "num", text: money(m.total) })]), h("span", { class: "bar" }, fill)]));
  });
}

function dayValues(d) {
  var values = {};
  d.daily.forEach(function (x) { values[Number(x.date.slice(8, 10))] = { total: x.total, count: x.count, top: null }; });
  var byDay = {};
  gastos(d).forEach(function (m) { var k = Number(m.date.slice(8, 10)); (byDay[k] = byDay[k] || []).push(m); });
  if (state.filters.category || state.filters.merchant) {
    selGastos("day").forEach(function (m) { var k = dayOf(m); if (values[k]) values[k].sel = (values[k].sel || 0) + m.amount; });
  }
  Object.keys(byDay).forEach(function (k) {
    var best = byDay[k].reduce(function (a, b) { return b.amount > a.amount ? b : a; });
    if (values[k]) values[k].top = best.merchant;
  });
  return values;
}

function renderDays() {
  var d = state.data, values = dayValues(d), N = lastShownDay(d);
  ui.daysToggle.textContent = state.view.days === "chart" ? "Ver como tabla" : "Ver gráfico";
  if (state.view.days === "table") {
    var rows = Object.keys(values).map(Number).sort(function (x, y) { return x - y; }).map(function (k) { return [dayLabel(isoDay(d.month, k)), String(values[k].count), money(values[k].total)]; });
    clear(ui.daysHost).appendChild(rows.length ? h("div", { style: { maxHeight: "300px", overflow: "auto" } }, simpleTable(["Día", "Mov.", "Gasto"], rows)) : h("p", { class: "empty", text: "Sin gastos en este mes." }));
    return;
  }
  columnsChart(ui.daysHost, { month: d.month, days: N, values: values, hasSel: !!(state.filters.category || state.filters.merchant), selected: state.filters.day, onPick: function (day) { setFilter({ day: state.filters.day === day ? null : day }); } });
}
`;
