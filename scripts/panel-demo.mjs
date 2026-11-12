// Starts the dashboard with made-up data so you can look at it: npm run build && node scripts/panel-demo.mjs [--open]
import { openDb } from "../dist/db.js";
import { setBudget } from "../dist/domain/budget.js";
import { setMerchantRule } from "../dist/domain/classify.js";
import { addMovement } from "../dist/domain/movements.js";
import { shiftMonth } from "../dist/domain/month.js";
import { openInBrowser } from "../dist/open-browser.js";
import { panelUrl, startPanel } from "../dist/panel/server.js";
import { bogotaDate } from "../dist/parsers/types.js";

const db = openDb(":memory:");
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const round = (n, to = 100) => Math.round(n / to) * to;

const RULES = {
  "Supermercado Ejemplo": "supermercado", "Mercado Demo": "supermercado", "Tienda Ejemplo": "supermercado",
  "Streaming Demo": "suscripcion", "Música Demo": "suscripcion", "Nube Demo": "suscripcion",
  "Arriendo": "fijo", "Internet Hogar": "fijo", "Energía y Agua": "fijo", "Servicios Demo": "fijo", "Familia Demo": "otro",
  "Restaurante Demo": "otro", "Taxi Demo": "otro", "Farmacia Demo": "otro", "Librería Demo": "otro", "Cine Demo": "otro",
};
for (const [m, c] of Object.entries(RULES)) setMerchantRule(db, m, c);
for (const [c, a] of [["supermercado", 3500000], ["suscripcion", 400000], ["fijo", 5500000], ["otro", 4000000]]) setBudget(db, c, "default", a);

const today = bogotaDate(Date.now());
const current = today.slice(0, 7);
const todayDay = Number(today.slice(8, 10));
let n = 0;
const add = (m) => addMovement(db, { sourceId: `demo${++n}`, bank: "bbva", kind: "gasto", ...m });

for (const month of [shiftMonth(current, -2), shiftMonth(current, -1), current]) {
  const days = month === current ? todayDay : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const day = (d) => `${month}-${String(Math.min(d, days)).padStart(2, "0")}`;
  if (days >= 1) add({ date: day(1), amount: 4500000, merchant: "Arriendo" });
  if (days >= 3) add({ date: day(3), amount: 280000, merchant: "Internet Hogar" });
  if (days >= 5) { add({ date: day(5), amount: 20000000, merchant: "Nómina Demo", kind: "ingreso" }); }
  if (days >= 10) add({ date: day(10), amount: 2500000, merchant: "Servicios Demo" });
  if (days >= 9) add({ date: day(9), amount: 38900, merchant: "Streaming Demo" });
  if (days >= 12) add({ date: day(12), amount: 21900, merchant: "Música Demo" });
  if (days >= 15) { add({ date: day(15), amount: 94000, merchant: "Nube Demo" }); add({ date: day(15), amount: 650000, merchant: "Energía y Agua" }); }
  if (days >= 18) add({ date: day(18), amount: 9000000, merchant: "Familia Demo" });
  if (days >= 20) add({ date: day(20), amount: 5200000, merchant: "Proyecto Demo", kind: "ingreso" });
  for (let d = 1; d <= days; d += 1) {
    if (rnd() < 0.55) add({ date: day(d), amount: round(120000 + rnd() * 520000), merchant: pick(["Supermercado Ejemplo", "Mercado Demo", "Tienda Ejemplo"]) });
    if (rnd() < 0.4) add({ date: day(d), amount: round(40000 + rnd() * 380000), merchant: pick(["Restaurante Demo", "Taxi Demo", "Farmacia Demo", "Librería Demo", "Cine Demo"]) });
    if (rnd() < 0.12) add({ date: day(d), amount: round(60000 + rnd() * 260000), merchant: pick(["Comercio Nuevo", "Kiosco Esquina"]) });
    if (rnd() < 0.15) add({ date: day(d), amount: round(8000 + rnd() * 30000), merchant: pick(["Tienda Ejemplo", "Taxi Demo"]), bank: "nequi" });
  }
}

const panel = await startPanel(db);
const url = panelUrl(panel);
console.log(url);
if (process.argv.includes("--open")) await openInBrowser(url);
console.log("Demo data only. Press Ctrl+C to stop.");
