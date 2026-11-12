/**
 * Dashboard script, part 1: formatting, safe DOM helpers, tooltip, state and API access.
 * The four script parts are concatenated inside one IIFE. Written without backticks or dollar-brace so it can live in String.raw.
 * All text that comes from emails (merchants) is inserted with textContent, never as HTML.
 */
export const SCRIPT_BASE = String.raw`
var NS = "http://www.w3.org/2000/svg";
var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
var POLL_MS = 15000;
var CATEGORY_NAMES = { supermercado: "Supermercado", suscripcion: "Suscripciones", fijo: "Gastos fijos", otro: "Otros", sin_categoria: "Sin categoría" };
var MONTH_FMT = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
var MONTH_ONLY = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" });
var DAY_FMT = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
var MONEY = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

var state = {
  token: null, months: [], currentMonth: null, month: null, bank: "", data: null, etag: null,
  expanded: {}, filters: { category: null, day: null, merchant: null, kind: "all", q: "" },
  sort: { key: "date", dir: -1 }, limit: 50, view: { line: "chart", days: "chart" },
  loading: false, error: null, animate: true, heroShown: 0, updatedAt: 0
};
var ui = {};

/* ---------- formatting ---------- */
function money(n) { return MONEY.format(Math.round(n)); }
function compact(n) {
  var a = Math.abs(n), sign = n < 0 ? "-" : "";
  if (a >= 1e6) return sign + "$ " + (a / 1e6).toFixed(1).replace(".", ",").replace(",0", "") + " M";
  if (a >= 1e3) return sign + "$ " + Math.round(a / 1e3) + " mil";
  return sign + "$ " + Math.round(a);
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function monthDate(m) { return new Date(m + "-01T00:00:00Z"); }
function monthName(m) { return cap(MONTH_ONLY.format(monthDate(m))); }
function monthLabel(m) { return cap(MONTH_FMT.format(monthDate(m))); }
function dayLabel(iso) { return DAY_FMT.format(new Date(iso + "T00:00:00Z")).replace(".", ""); }
function daysIn(m) { return new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate(); }
function pad2(n) { return (n < 10 ? "0" : "") + n; }
function isoDay(month, day) { return month + "-" + pad2(day); }
function plain(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function catName(c) { return CATEGORY_NAMES[c || "sin_categoria"] || c; }
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

/* ---------- DOM helpers (text goes through textContent only) ---------- */
function append(el, kids) {
  if (kids == null || kids === false) return;
  if (!Array.isArray(kids)) kids = [kids];
  for (var i = 0; i < kids.length; i++) {
    var k = kids[i];
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(typeof k === "object" ? k : document.createTextNode(String(k)));
  }
}
function h(tag, props, kids) {
  var el = document.createElement(tag);
  for (var k in props || {}) {
    var v = props[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
    else if (k === "style") { for (var p in v) el.style[p] = v[p]; }
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
function s(tag, attrs, kids) {
  var el = document.createElementNS(NS, tag);
  for (var k in attrs || {}) { if (attrs[k] != null) el.setAttribute(k, attrs[k]); }
  append(el, kids);
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
function icon(name) {
  var paths = {
    left: "M15 5l-7 7 7 7", right: "M9 5l7 7-7 7", chev: "M9 6l6 6-6 6", refresh: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
    sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6L4.6 4.6M19.4 19.4L18 18M6 18l-1.4 1.4M19.4 4.6L18 6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    alert: "M12 8v5M12 16.5v.5M12 3l10 18H2L12 3z"
  };
  return s("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, s("path", { d: paths[name] }));
}

/* ---------- tooltip: one shared element, built with DOM nodes ---------- */
var tip = null;
function showTip(x, y, nodes) {
  tip = tip || document.getElementById("tip");
  clear(tip); append(tip, nodes);
  tip.hidden = false;
  var r = tip.getBoundingClientRect();
  var left = x + 16;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 16;
  var top = y - r.height - 12;
  if (top < 8) top = y + 18;
  tip.style.left = Math.max(8, left) + "px";
  tip.style.top = top + "px";
}
function hideTip() { tip = tip || document.getElementById("tip"); tip.hidden = true; }
function tipRow(color, label, value) {
  return h("div", { class: "t-row" }, [
    h("span", { class: "t-key" }, [color ? h("i", { style: { background: color } }) : null, label]),
    h("b", { class: "num", text: value })
  ]);
}

/* ---------- animation ---------- */
function countTo(el, from, to) {
  var token = (el._count = (el._count || 0) + 1);
  if (REDUCED || from === to) { el.textContent = money(to); return; }
  var start = null, dur = 650;
  function step(t) {
    if (el._count !== token) return;
    if (start === null) start = t;
    var p = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = money(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ---------- token + API ---------- */
function readToken() {
  var frag = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  var t = frag.get("t"), m = frag.get("m");
  try {
    if (t) sessionStorage.setItem("panel-token", t);
    else t = sessionStorage.getItem("panel-token");
  } catch (e) { /* storage unavailable: the token only lives in memory */ }
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  return { token: t, month: m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null };
}
function api(path, etag) {
  var headers = { "x-panel-token": state.token };
  if (etag) headers["if-none-match"] = etag;
  return fetch(path, { headers: headers, cache: "no-store" }).then(function (res) {
    if (res.status === 401 || res.status === 403) { state.error = "auth"; throw new Error("auth"); }
    if (res.status === 304) return { notModified: true };
    if (!res.ok) throw new Error("http " + res.status);
    return res.json().then(function (json) { return { json: json, etag: res.headers.get("etag") }; });
  });
}
`;
