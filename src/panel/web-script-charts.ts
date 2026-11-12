/**
 * Dashboard script, part 2: SVG charts (pace line and daily columns) built to the data-viz spec:
 * 2px lines, bars at most 24px with a 4px rounded end, hairline solid grid, 2px surface ring on end dots,
 * selective direct labels, crosshair/hover tooltips and keyboard access.
 */
export const SCRIPT_CHARTS = String.raw`
function niceTicks(max) {
  if (max <= 0) return [0, 1];
  var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), steps = [1, 2, 2.5, 5, 10], step = mag;
  for (var i = 0; i < steps.length; i++) { step = steps[i] * mag; if (step >= raw) break; }
  var n = Math.ceil(max / step - 1e-9), ticks = [];
  for (var j = 0; j <= n; j++) ticks.push(j * step);
  return ticks;
}
function chartBox(host, minHeight) {
  var width = Math.max(300, Math.floor(host.clientWidth || 600));
  return { width: width, height: width < 520 ? Math.round(minHeight * 0.82) : minHeight };
}
function xTicks(total, every) {
  var out = [1];
  for (var d = every; d < total; d += every) out.push(d);
  if (total - out[out.length - 1] >= Math.ceil(every * 0.6)) out.push(total);
  return out;
}
function gridAndAxes(svg, box, m, ticks, yOf, xs, xOf) {
  ticks.forEach(function (t, i) {
    var y = yOf(t);
    svg.appendChild(s("line", { x1: m.l, x2: box.width - m.r, y1: y, y2: y, stroke: i === 0 ? "var(--axis)" : "var(--grid)", "stroke-width": 1 }));
    svg.appendChild(s("text", { x: m.l - 10, y: y + 4, "text-anchor": "end", class: "tick" }, t === 0 ? "0" : compact(t).replace("$ ", "")));
  });
  xs.forEach(function (d) {
    svg.appendChild(s("text", { x: xOf(d), y: box.height - 6, "text-anchor": "middle", class: "tick" }, String(d)));
  });
}

/* ---------- pace line: cumulative spending this month vs the previous month ---------- */
function lineChart(host, cfg) {
  clear(host);
  var box = chartBox(host, 280), m = { l: 46, r: 76, t: 16, b: 28 };
  var N = cfg.days, A = cfg.a.values, B = cfg.b.values;
  var plotW = box.width - m.l - m.r, plotH = box.height - m.t - m.b;
  var maxV = Math.max(A.length ? A[A.length - 1] : 0, B.length ? B[B.length - 1] : 0, 1);
  var ticks = niceTicks(maxV), yMax = ticks[ticks.length - 1];
  function xOf(d) { return m.l + (N <= 1 ? plotW / 2 : ((d - 1) / (N - 1)) * plotW); }
  function yOf(v) { return m.t + plotH - (v / yMax) * plotH; }
  function path(vals) { return vals.map(function (v, i) { return (i ? "L" : "M") + xOf(i + 1).toFixed(1) + " " + yOf(v).toFixed(1); }).join(" "); }

  var svg = s("svg", { width: box.width, height: box.height, viewBox: "0 0 " + box.width + " " + box.height, role: "img", tabindex: "0",
    "aria-label": "Gasto acumulado de " + cfg.a.label + " comparado con " + cfg.b.label + ". Usa las flechas para recorrer los días." });
  gridAndAxes(svg, box, m, ticks, yOf, xTicks(N, 7), xOf);

  if (A.length > 1) svg.appendChild(s("path", { d: path(A) + " L" + xOf(A.length).toFixed(1) + " " + yOf(0) + " L" + xOf(1).toFixed(1) + " " + yOf(0) + " Z", fill: "var(--accent)", opacity: "0.10" }));
  if (B.length) svg.appendChild(s("path", { d: path(B), fill: "none", stroke: "var(--series-b)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  if (A.length) svg.appendChild(s("path", { d: path(A), fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));

  var aEnd = A.length ? { x: xOf(A.length), y: yOf(A[A.length - 1]), v: A[A.length - 1] } : null;
  var bEnd = B.length ? { x: xOf(B.length), y: yOf(B[B.length - 1]), v: B[B.length - 1] } : null;
  if (bEnd) svg.appendChild(s("circle", { cx: bEnd.x, cy: bEnd.y, r: 4, fill: "var(--series-b)", stroke: "var(--surface)", "stroke-width": 2 }));
  if (aEnd) svg.appendChild(s("circle", { cx: aEnd.x, cy: aEnd.y, r: 5, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2 }));
  if (aEnd) svg.appendChild(s("text", { x: aEnd.x + 11, y: aEnd.y + 4, class: "val-label" }, compact(aEnd.v)));
  if (bEnd && (!aEnd || Math.abs(aEnd.y - bEnd.y) > 18 || Math.abs(aEnd.x - bEnd.x) > 60)) svg.appendChild(s("text", { x: bEnd.x + 10, y: bEnd.y + 4, class: "val-label b" }, compact(bEnd.v)));

  var cross = s("g", { visibility: "hidden" });
  var crossLine = s("line", { y1: m.t, y2: m.t + plotH, class: "cross-line" });
  var dotA = s("circle", { r: 5, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2 });
  var dotB = s("circle", { r: 4, fill: "var(--series-b)", stroke: "var(--surface)", "stroke-width": 2 });
  cross.appendChild(crossLine); cross.appendChild(dotB); cross.appendChild(dotA); svg.appendChild(cross);
  var hit = s("rect", { x: m.l - 8, y: m.t, width: plotW + 16, height: plotH, fill: "transparent" });
  svg.appendChild(hit);

  function showDay(day, cx, cy) {
    var x = xOf(day), a = A[day - 1], b = B[day - 1];
    cross.setAttribute("visibility", "visible");
    crossLine.setAttribute("x1", x); crossLine.setAttribute("x2", x);
    if (a !== undefined) { dotA.setAttribute("cx", x); dotA.setAttribute("cy", yOf(a)); dotA.setAttribute("visibility", "inherit"); } else dotA.setAttribute("visibility", "hidden");
    if (b !== undefined) { dotB.setAttribute("cx", x); dotB.setAttribute("cy", yOf(b)); dotB.setAttribute("visibility", "inherit"); } else dotB.setAttribute("visibility", "hidden");
    var rows = [h("div", { class: "t-head", text: "Día " + day })];
    rows.push(tipRow("var(--accent)", cfg.a.label, a === undefined ? "—" : money(a)));
    rows.push(tipRow("var(--series-b)", cfg.b.label, b === undefined ? "—" : money(b)));
    if (a !== undefined && b !== undefined && a !== b) {
      var diff = a - b;
      rows.push(h("div", { class: "t-note", text: (diff > 0 ? "+" : "−") + money(Math.abs(diff)) + (diff > 0 ? " más " : " menos ") + "que " + cfg.b.label }));
    }
    var rect = svg.getBoundingClientRect();
    showTip(cx === undefined ? rect.left + x : cx, cy === undefined ? rect.top + m.t + 24 : cy, rows);
  }
  function dayFromPointer(e) {
    var rect = svg.getBoundingClientRect();
    var d = Math.round(((e.clientX - rect.left - m.l) / plotW) * (N - 1)) + 1;
    return Math.max(1, Math.min(N, d));
  }
  var current = Math.max(1, A.length || 1);
  hit.addEventListener("pointermove", function (e) { current = dayFromPointer(e); showDay(current, e.clientX, e.clientY); });
  hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
  svg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") current = Math.min(N, current + 1);
    else if (e.key === "ArrowLeft") current = Math.max(1, current - 1);
    else if (e.key === "Escape") { cross.setAttribute("visibility", "hidden"); hideTip(); return; }
    else return;
    e.preventDefault(); showDay(current);
  });
  svg.addEventListener("blur", function () { cross.setAttribute("visibility", "hidden"); hideTip(); });
  host.appendChild(svg);
}

/* ---------- daily columns ---------- */
function columnsChart(host, cfg) {
  clear(host);
  var box = chartBox(host, 230), m = { l: 56, r: 8, t: 26, b: 28 };
  var N = cfg.days, plotW = box.width - m.l - m.r, plotH = box.height - m.t - m.b;
  var maxV = 1, maxDay = 0;
  for (var d = 1; d <= N; d++) { var t = (cfg.values[d] || { total: 0 }).total; if (t > maxV) { maxV = t; maxDay = d; } }
  var ticks = niceTicks(maxV), yMax = ticks[ticks.length - 1], slot = plotW / N, barW = Math.min(24, Math.max(4, slot * 0.62));
  function xOf(day) { return m.l + (day - 0.5) * slot; }
  function yOf(v) { return m.t + plotH - (v / yMax) * plotH; }

  var svg = s("svg", { width: box.width, height: box.height, viewBox: "0 0 " + box.width + " " + box.height, role: "group", tabindex: "0",
    "aria-label": "Gasto por día. Usa las flechas para recorrer los días y Enter para filtrar los movimientos de ese día." });
  gridAndAxes(svg, box, m, ticks, yOf, xTicks(N, N <= 16 ? 1 : 5), xOf);

  var bars = {};
  function showDay(day, cx, cy) {
    var v = cfg.values[day] || { total: 0, count: 0, top: null };
    var rows = [h("div", { class: "t-head", text: dayLabel(isoDay(cfg.month, day)) }), tipRow(null, v.count ? plural(v.count, "movimiento", "movimientos") : "Sin gastos", money(v.total))];
    if (v.top) rows.push(h("div", { class: "t-note", text: "Mayor: " + v.top }));
    var rect = svg.getBoundingClientRect();
    showTip(cx === undefined ? rect.left + xOf(day) : cx, cy === undefined ? rect.top + m.t + 30 : cy, rows);
  }
  for (var day = 1; day <= N; day++) {
    (function (dd) {
      var v = cfg.values[dd];
      var g = s("g", { class: "col" + (cfg.selected && cfg.selected !== dd ? " dim" : "") });
      if (v && v.total > 0) {
        var hgt = Math.max(2, plotH - (yOf(v.total) - m.t)), x = xOf(dd) - barW / 2, y = m.t + plotH - hgt, r = Math.min(4, barW / 2, hgt);
        g.appendChild(s("path", { d: "M" + x + " " + (y + hgt) + "V" + (y + r) + "Q" + x + " " + y + " " + (x + r) + " " + y + "H" + (x + barW - r) + "Q" + (x + barW) + " " + y + " " + (x + barW) + " " + (y + r) + "V" + (y + hgt) + "Z", fill: "var(--accent)" }));
      }
      bars[dd] = g; svg.appendChild(g);
      var zone = s("rect", { x: m.l + (dd - 1) * slot, y: m.t, width: slot, height: plotH, fill: "transparent", class: "zone" });
      zone.addEventListener("pointermove", function (e) { showDay(dd, e.clientX, e.clientY); g.style.opacity = "0.78"; });
      zone.addEventListener("pointerleave", function () { hideTip(); g.style.opacity = ""; });
      zone.addEventListener("click", function () { cfg.onPick(dd); });
      svg.appendChild(zone);
    })(day);
  }
  if (maxDay) {
    var mv = cfg.values[maxDay].total;
    svg.appendChild(s("text", { x: Math.min(box.width - m.r - 24, Math.max(m.l + 24, xOf(maxDay))), y: yOf(mv) - 8, "text-anchor": "middle", class: "val-label" }, compact(mv)));
  }
  var focused = Math.max(1, cfg.selected || maxDay || 1);
  svg.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") focused = Math.min(N, focused + 1);
    else if (e.key === "ArrowLeft") focused = Math.max(1, focused - 1);
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cfg.onPick(focused); return; }
    else if (e.key === "Escape") { hideTip(); return; }
    else return;
    e.preventDefault(); showDay(focused);
  });
  svg.addEventListener("blur", hideTip);
  host.appendChild(svg);
}

/* ---------- table twin of a chart ---------- */
function simpleTable(headers, rows) {
  return h("table", null, [
    h("thead", null, h("tr", null, headers.map(function (t, i) { return h("th", { class: i ? "r" : "", text: t }); }))),
    h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c, i) { return h("td", { class: i ? "r num" : "", text: c }); })); }))
  ]);
}
`;
