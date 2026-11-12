/** Stylesheet of the dashboard page. Written without backticks so it can live in String.raw. */
export const STYLES = String.raw`
:root {
  color-scheme: light dark;
  --plane: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --border: rgba(11,11,11,0.10);
  --accent: #2a78d6; --series-b: #898781;
  --good: #006300; --bad: #d03b3b; --warn: #fab219; --warn-ink: #0b0b0b; --danger: #d03b3b;
  --hover: rgba(11,11,11,0.045); --focus: #2a78d6;
  --track: color-mix(in srgb, var(--accent) 14%, var(--surface));
  --wash: color-mix(in srgb, var(--accent) 10%, transparent);
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) {
    --plane: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
    --accent: #3987e5; --good: #0ca30c; --bad: #e66767; --hover: rgba(255,255,255,0.06); --focus: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --plane: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --border: rgba(255,255,255,0.10);
  --accent: #3987e5; --good: #0ca30c; --bad: #e66767; --hover: rgba(255,255,255,0.06); --focus: #3987e5;
}
:root[data-theme="light"] { color-scheme: light; }

* { box-sizing: border-box; }
html { background: var(--plane); }
body {
  margin: 0; background: var(--plane); color: var(--ink);
  font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 8px; }
[hidden] { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.app { max-width: 1120px; margin: 0 auto; padding: 24px 20px 96px; }
.stack { display: grid; gap: 20px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 24px; padding: 28px; min-width: 0; }
.card h2 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.005em; }
.card .sub { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px 12px; margin-bottom: 20px; flex-wrap: wrap; }
.label { font-size: 13px; color: var(--ink-2); }
.muted { color: var(--muted); }
.num { font-variant-numeric: tabular-nums; }
td.num { white-space: nowrap; }

/* top bar: one row of filters above everything they scope */
.top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 28px; }
.brand { font-weight: 650; letter-spacing: -0.01em; margin-right: 12px; display: flex; align-items: center; gap: 8px; }
.brand i { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); display: inline-block; }
.month-nav { display: flex; align-items: center; gap: 2px; position: relative; }
.icon-btn { width: 36px; height: 36px; border-radius: 12px; border: 0; background: transparent; color: var(--ink-2); display: inline-grid; place-items: center; transition: background .15s; }
.icon-btn:hover:not(:disabled) { background: var(--hover); color: var(--ink); }
.icon-btn:disabled { opacity: .3; cursor: default; }
.icon-btn svg { width: 18px; height: 18px; }
.month-btn { border: 0; background: transparent; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; padding: 6px 12px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; }
.month-btn:hover { background: var(--hover); }
.menu { position: absolute; top: 44px; left: 0; z-index: 20; min-width: 220px; max-height: 320px; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 6px; box-shadow: 0 12px 40px rgba(0,0,0,0.14); }
.menu button { width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: center; }
.menu button:hover { background: var(--hover); }
.menu button[aria-checked="true"] { font-weight: 650; }
.spacer { flex: 1; }
.select { appearance: none; border: 1px solid var(--border); background: var(--surface); border-radius: 12px; padding: 7px 28px 7px 12px; font-size: 14px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 15px) 50%, calc(100% - 10px) 50%; background-size: 5px 5px; background-repeat: no-repeat; }
.live { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.live i { width: 7px; height: 7px; border-radius: 50%; background: var(--good); display: inline-block; animation: pulse 2.4s ease-in-out infinite; }
.spin svg { animation: spin .8s linear infinite; }

/* hero */
.hero-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px 48px; flex-wrap: wrap; padding-bottom: 28px; }
.hero-value { font-size: clamp(52px, 9vw, 96px); line-height: 1; font-weight: 600; letter-spacing: -0.04em; margin: 10px 0 0; }
.hero-side { max-width: 360px; padding-bottom: 6px; }
.hero-chart { border-top: 1px solid var(--grid); padding-top: 22px; }
.tools { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; justify-content: flex-end; }
.delta { display: inline-flex; align-items: baseline; gap: 8px; font-size: 15px; font-weight: 550; }
.delta .glyph { font-size: 11px; }
.delta.up { color: var(--bad); } .delta.down { color: var(--good); } .delta.flat { color: var(--ink-2); }
.hero-note { margin: 8px 0 0; font-size: 14px; color: var(--ink-2); }
.legend { display: flex; gap: 18px; font-size: 13px; color: var(--ink-2); align-items: center; }
.legend span { display: inline-flex; align-items: center; gap: 8px; }
.legend i { width: 16px; height: 2px; border-radius: 2px; display: inline-block; }
.legend .a i { background: var(--accent); } .legend .b i { background: var(--series-b); }
.chart-host { width: 100%; min-height: 230px; position: relative; }
.linkish { border: 0; background: transparent; color: var(--ink-2); font-size: 13px; padding: 6px 10px; border-radius: 10px; }
.linkish:hover { background: var(--hover); color: var(--ink); }

/* tiles */
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.tile { padding: 24px 28px; text-align: left; }
button.tile { cursor: pointer; transition: transform .2s var(--ease), border-color .2s; border: 1px solid var(--border); font: inherit; color: inherit; width: 100%; }
button.tile:hover { transform: translateY(-2px); border-color: var(--axis); }
.tile-value { font-size: 34px; font-weight: 600; letter-spacing: -0.03em; margin: 6px 0 4px; }
.tile-sub { font-size: 13px; color: var(--ink-2); display: flex; gap: 6px; align-items: center; }
.tile-sub.good { color: var(--good); } .tile-sub.bad { color: var(--bad); }

.cols { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 20px; }

/* category meters */
.meter-list { display: grid; }
.meter { border-top: 1px solid var(--grid); }
.meter:first-child { border-top: 0; }
.meter-row { width: 100%; border: 0; background: transparent; text-align: left; padding: 16px 4px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 16px; border-radius: 12px; }
.meter-row:hover { background: var(--hover); }
.meter-name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.chev { width: 16px; height: 16px; color: var(--muted); transition: transform .25s var(--ease); flex: none; }
.meter.open .chev { transform: rotate(90deg); }
.meter-fig { text-align: right; font-weight: 600; }
.meter-sub { font-size: 12.5px; color: var(--muted); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.meter-sub.right { justify-content: flex-end; }
.bar { display: block; grid-column: 1 / -1; height: 8px; border-radius: 8px; background: var(--track); overflow: hidden; margin-top: 8px; }
.fill { display: block; height: 100%; border-radius: 8px; background: var(--accent); }
.chev svg { width: 16px; height: 16px; }
.fill.warn { background: var(--warn); } .fill.danger { background: var(--danger); }
.enter .fill { transform-origin: left; animation: grow .8s var(--ease) both; }
.status { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 550; }
.status.warn { color: var(--ink); } .status.danger { color: var(--bad); }
.status svg { width: 14px; height: 14px; }
.acc { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s var(--ease); }
.meter.open .acc { grid-template-rows: 1fr; }
.acc > div { overflow: hidden; }
.mini { list-style: none; margin: 0; padding: 4px 4px 14px; display: grid; gap: 2px; }
.mini li { display: grid; grid-template-columns: 86px minmax(0, 1fr) auto; gap: 12px; padding: 7px 8px; border-radius: 10px; font-size: 14px; }
.mini li:hover { background: var(--hover); }
.mini .d { color: var(--muted); white-space: nowrap; } .mini .m { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.more { margin: 2px 8px 0; }

/* merchants */
.rank { display: grid; gap: 4px; }
.rank-row { border: 0; background: transparent; text-align: left; padding: 10px 8px; border-radius: 12px; display: grid; gap: 7px; }
.rank-row:hover, .rank-row[aria-pressed="true"] { background: var(--hover); }
.rank-top { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.rank-top span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank .bar { margin-top: 0; height: 8px; background: transparent; }

/* movements */
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.search { flex: 1; min-width: 200px; border: 1px solid var(--border); background: var(--surface); border-radius: 12px; padding: 9px 14px; font-size: 14px; }
.search::placeholder { color: var(--muted); }
.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 12px; padding: 3px; gap: 2px; }
.seg button { border: 0; background: transparent; padding: 6px 14px; border-radius: 9px; font-size: 13.5px; color: var(--ink-2); }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--surface); font-weight: 600; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; min-height: 0; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 4px 6px 4px 12px; font-size: 13px; background: var(--surface); }
.chip button { border: 0; background: var(--hover); width: 20px; height: 20px; border-radius: 50%; line-height: 1; color: var(--ink-2); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
th button { border: 0; background: transparent; color: inherit; font: inherit; padding: 0; }
th button:hover { color: var(--ink); }
td { padding: 11px 10px; border-bottom: 1px solid var(--grid); vertical-align: middle; }
tr:last-child td { border-bottom: 0; }
td.r, th.r { text-align: right; }
td .tag { font-size: 12px; color: var(--muted); }
.amount.in { color: var(--good); }
.empty { padding: 36px 8px; text-align: center; color: var(--muted); }
.empty strong { display: block; color: var(--ink); font-size: 17px; margin-bottom: 6px; }
.foot { margin-top: 28px; text-align: center; font-size: 12.5px; color: var(--muted); }
.message { max-width: 520px; margin: 18vh auto 0; text-align: center; }
.message h1 { font-size: 28px; letter-spacing: -0.02em; margin: 0 0 10px; }
.message p { color: var(--ink-2); margin: 0 0 8px; }
.message code { background: var(--hover); padding: 2px 8px; border-radius: 8px; font-size: 14px; }
.loading .stack { opacity: .55; transition: opacity .2s; }

/* charts */
svg text { font-family: inherit; }
.tick { font-size: 11.5px; fill: var(--muted); }
.cross-line { stroke: var(--axis); stroke-width: 1; }
.val-label { font-size: 12px; font-weight: 600; fill: var(--ink); }
.val-label.b { fill: var(--ink-2); font-weight: 500; }
.col { transition: opacity .15s, transform .15s; }
.col.dim { opacity: .35; }
.zone { cursor: pointer; }
.tip { position: fixed; z-index: 50; pointer-events: none; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; box-shadow: 0 10px 32px rgba(0,0,0,0.16); font-size: 13px; min-width: 170px; max-width: 280px; }
.tip .t-head { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
.tip .t-row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.tip .t-row b { font-size: 15px; font-weight: 650; }
.tip .t-key { display: inline-flex; align-items: center; gap: 8px; color: var(--ink-2); }
.tip .t-key i { width: 12px; height: 2px; border-radius: 2px; display: inline-block; }
.tip .t-note { margin-top: 6px; color: var(--ink-2); font-size: 12.5px; }

@keyframes grow { from { transform: scaleX(0); } }
@keyframes pulse { 50% { opacity: .35; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
.enter .card { animation: rise .6s var(--ease) both; }
.enter .stack > :nth-child(2) { animation-delay: .06s; } .enter .stack > :nth-child(3) { animation-delay: .12s; }
.enter .stack > :nth-child(4) { animation-delay: .18s; } .enter .stack > :nth-child(5) { animation-delay: .24s; }

@media (max-width: 900px) {
  .cols { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .app { padding: 16px 16px 72px; }
  .card { padding: 22px 18px; border-radius: 20px; }
  .tiles { grid-template-columns: 1fr; gap: 14px; }
  .tile { padding: 20px 18px; }
  .hide-sm { display: none; }
  .meter-sub.right { grid-column: 1 / -1; justify-content: flex-start; }
  .live span:last-child { display: none; }
  .hero-top { padding-bottom: 20px; }
  .top { margin-bottom: 20px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;
