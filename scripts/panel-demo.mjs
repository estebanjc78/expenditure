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
  "Arriendo": "fijo", "Internet Hogar": "fijo", "Energía y Agua": "fijo",
  "Restaurante Demo": "otro", "Taxi Demo": "otro", "Farmacia Demo": "otro", "Librería Demo": "otro", "Cine Demo": "otro",
};
for (const [m, c] of Object.entries(RULES)) setMerchantRule(db, m, c);
for (const [c, a] of [["supermercado", 700000], ["suscripcion", 200000], ["fijo", 1350000], ["otro", 500000]]) setBudget(db, c, "default", a);

const today = bogotaDate(Date.now());
const current = today.slice(0, 7);
const todayDay = Number(today.slice(8, 10));
let n = 0;
const add = (m) => addMovement(db, { sourceId: `demo${++n}`, bank: "bbva", kind: "gasto", ...m });

for (const month of [shiftMonth(current, -2), shiftMonth(current, -1), current]) {
  const days = month === current ? todayDay : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
  const day = (d) => `${month}-${String(Math.min(d, days)).padStart(2, "0")}`;
  if (days >= 1) add({ date: day(1), amount: 1200000, merchant: "Arriendo" });
  if (days >= 3) add({ date: day(3), amount: 150000, merchant: "Internet Hogar" });
  if (days >= 5) { add({ date: day(5), amount: 6200000, merchant: "Nómina Demo", kind: "ingreso" }); }
  if (days >= 9) add({ date: day(9), amount: 38900, merchant: "Streaming Demo" });
  if (days >= 12) add({ date: day(12), amount: 21900, merchant: "Música Demo" });
  if (days >= 15) { add({ date: day(15), amount: 94000, merchant: "Nube Demo" }); add({ date: day(15), amount: 310000, merchant: "Energía y Agua" }); }
  if (days >= 20) add({ date: day(20), amount: 850000, merchant: "Proyecto Demo", kind: "ingreso" });
  for (let d = 1; d <= days; d += 1) {
    if (rnd() < 0.55) add({ date: day(d), amount: round(40000 + rnd() * 160000), merchant: pick(["Supermercado Ejemplo", "Mercado Demo", "Tienda Ejemplo"]) });
    if (rnd() < 0.4) add({ date: day(d), amount: round(12000 + rnd() * 90000), merchant: pick(["Restaurante Demo", "Taxi Demo", "Farmacia Demo", "Librería Demo", "Cine Demo"]) });
    if (rnd() < 0.12) add({ date: day(d), amount: round(15000 + rnd() * 70000), merchant: pick(["Comercio Nuevo", "Kiosco Esquina"]) });
    if (rnd() < 0.15) add({ date: day(d), amount: round(8000 + rnd() * 30000), merchant: pick(["Tienda Ejemplo", "Taxi Demo"]), bank: "nequi" });
  }
}

const panel = await startPanel(db);
const url = panelUrl(panel);
console.log(url);
if (process.argv.includes("--open")) await openInBrowser(url);
console.log("Demo data only. Press Ctrl+C to stop.");
