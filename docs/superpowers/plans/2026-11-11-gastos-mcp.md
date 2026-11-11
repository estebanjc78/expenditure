# MCP de gastos desde el correo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un servidor MCP que guarda movimientos financieros ya interpretados (los lee Claude desde el correo), los clasifica, y responde consultas flexibles y estado de presupuesto por categoría.

**Architecture:** Servidor MCP por stdio. Lógica de dominio pura en `src/domain/*` sobre una base SQLite local; `src/server.ts` solo registra herramientas que llaman a esa lógica. Claude lee Gmail e interpreta los comprobantes; el MCP nunca toca el correo.

**Tech Stack:** Node 26, TypeScript, `@modelcontextprotocol/sdk`, `zod`, `node:sqlite` (`DatabaseSync`, sin dependencias nativas), `exceljs` (leer Excel de fijos), `vitest`.

**Spec:** `docs/superpowers/specs/2026-11-11-gastos-mcp-design.md`

## Global Constraints

- Moneda: pesos colombianos (COP), guardados como **enteros** (sin decimales).
- Fechas: texto `YYYY-MM-DD` en hora de Colombia (America/Bogota); el mes de un movimiento sale de esa fecha, sin conversión de zona.
- Categorías (rubros): `supermercado`, `suscripcion`, `fijo`, `otro`.
- Tipos de movimiento: `gasto`, `ingreso`, `transferencia_propia`. Solo `gasto` suma en los totales de consumo; los otros se informan aparte.
- El MCP no tiene acceso al correo ni al banco; no guarda el texto de los mails, solo los datos extraídos y el id del mail (`sourceId`).
- Duplicados: un mismo `sourceId` nunca se guarda dos veces.
- Lo que no se puede clasificar no se manda a `otro` en silencio: queda sin categoría y se avisa.
- Aviso de presupuesto cuando el consumo llega al 80% de una categoría.
- Base local en la ruta de la variable de entorno `GASTOS_DB` (por defecto `~/.gastos-mcp/gastos.db`).
- Archivos de menos de 400 líneas; sin mutación de objetos recibidos.

## Review Focus

- Mismo mail registrado dos veces (reintento de sincronización): el total no se duplica. (Task 2)
- Ingresos y transferencias entre cuentas propias: no inflan el gasto del mes. (Task 4)
- Movimiento del 31 de octubre a las 23:59 hora Colombia: cuenta en octubre. (Task 4)
- Monto cero, negativo, con decimales o no numérico: se rechaza con error claro. (Task 2)
- Comercio desconocido: se guarda sin categoría y la respuesta pide clasificarlo, no cae en `otro`. (Task 3)
- Mes sin movimientos o presupuesto sin definir: respuesta vacía válida, no error. (Tasks 4 y 5)

---

### Task 1: Proyecto y base de datos

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (incluye `node_modules`, `*.db`), `src/db.ts`, `src/domain/types.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces: `openDb(path: string): DatabaseSync` (crea las tablas `movements`, `merchant_rules`, `budgets`, `fixed_expenses` si no existen; acepta `":memory:"`); tipos en `types.ts`: `Category`, `Kind`, `Movement`, `MovementInput`.

- [ ] **Step 1:** `git init`, `npm init`, instalar dependencias del stack; scripts `test` (`vitest run`) y `build`. `tsconfig` con `module: NodeNext`, `strict: true`.
- [ ] **Step 2:** Test `openDb crea las tablas esperadas`: abrir `:memory:` y afirmar que `sqlite_master` contiene las cuatro tablas. Test `openDb es idempotente`: llamarla dos veces sobre el mismo archivo temporal no falla.
- [ ] **Step 3:** Correr `npx vitest run tests/db.test.ts`. Expected: FAIL (`openDb` no existe).
- [ ] **Step 4:** Implementar `openDb` y `types.ts`. Columnas de `movements`: `id` integer PK, `source_id` text UNIQUE nullable (nulo para efectivo manual), `date` text, `amount` integer, `merchant` text, `bank` text, `kind` text, `category` text nullable.
- [ ] **Step 5:** Correr el test. Expected: PASS.
- [ ] **Step 6:** Commit `chore: scaffold project and sqlite schema`.

### Task 2: Registrar movimientos

**Files:**
- Create: `src/domain/movements.ts`
- Test: `tests/movements.test.ts`

**Interfaces:**
- Consumes: `openDb`, tipos de Task 1.
- Produces: `addMovement(db: DatabaseSync, input: MovementInput): { id: number; duplicate: boolean }` donde `MovementInput = { sourceId?: string; date: string; amount: number; merchant: string; bank: string; kind: Kind; category?: Category }`.

- [ ] **Step 1:** Tests: `guarda un gasto y lo devuelve con id`; `el mismo sourceId dos veces devuelve duplicate:true y no inserta`; `rechaza monto 0, negativo, 12.5 y NaN con mensaje que nombra el campo amount`; `rechaza fecha que no es YYYY-MM-DD`; `acepta movimiento sin sourceId (efectivo manual) varias veces`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar `addMovement` validando con `zod` (esquema `movementInputSchema` exportado) y con `INSERT ... ON CONFLICT(source_id) DO NOTHING`.
- [ ] **Step 4:** Correr; Expected: PASS.
- [ ] **Step 5:** Commit `feat: register movements with dedupe and validation`.

### Task 3: Clasificación de comercios

**Files:**
- Create: `src/domain/classify.ts`
- Modify: `src/domain/movements.ts` (aplicar reglas al insertar)
- Test: `tests/classify.test.ts`

**Interfaces:**
- Consumes: `addMovement`.
- Produces: `setMerchantRule(db, merchant: string, category: Category): { updated: number }` (guarda la regla, normalizando el comercio a minúsculas sin espacios sobrantes, y reclasifica los movimientos previos sin categoría de ese comercio; `updated` es cuántos); `addMovement` ahora devuelve además `needsClassification: boolean`.

- [ ] **Step 1:** Tests: `con regla existente el movimiento entra clasificado`; `comercio desconocido entra con category null y needsClassification true`; `setMerchantRule reclasifica movimientos previos y devuelve updated`; `la regla ignora mayúsculas y espacios ("  EXITO ")`; `una categoría pasada en el input pisa la regla`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar `normalizeMerchant` (interno) y `setMerchantRule`; integrar lookup en `addMovement`.
- [ ] **Step 4:** Correr; Expected: PASS.
- [ ] **Step 5:** Commit `feat: merchant classification rules`.

### Task 4: Consulta flexible (tabla dinámica)

**Files:**
- Create: `src/domain/query.ts`
- Test: `tests/query.test.ts`

**Interfaces:**
- Consumes: movimientos guardados.
- Produces: `queryMovements(db, q: Query): QueryResult` con
  `Query = { filters: { from?: string; to?: string; month?: string /* YYYY-MM */; category?: Category | "sin_categoria"; bank?: string; merchant?: string; kind?: Kind; minAmount?: number; maxAmount?: number; text?: string }; groupBy: Array<"category"|"bank"|"merchant"|"day"|"month">; includeMovements?: boolean }` y
  `QueryResult = { groups: GroupNode[]; totals: { gasto: number; ingreso: number; transferenciaPropia: number } }`, `GroupNode = { key: string; total: number; count: number; children?: GroupNode[]; movements?: Movement[] }`.
  Reglas: por defecto solo suma `gasto` en `groups`; `totals` siempre informa los tres tipos con los mismos filtros (menos `kind`); cada nivel ordenado por total descendente.

- [ ] **Step 1:** Tests: `agrupa por categoría y ordena de mayor a menor`; `groupBy ["category","merchant"] anida comercios dentro de cada categoría`; `includeMovements devuelve los movimientos en las hojas`; `ingresos y transferencia_propia no suman en groups pero sí aparecen en totals`; `31-oct y 01-nov caen en meses distintos (month: "2026-10")`; `filtro bank y filtro text combinados`; `mes sin movimientos devuelve groups [] y totals en cero`; `category "sin_categoria" devuelve los no clasificados`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar construyendo el `WHERE` con parámetros (nunca concatenar valores) y armando el árbol en memoria a partir de las filas filtradas.
- [ ] **Step 4:** Correr; Expected: PASS.
- [ ] **Step 5:** Commit `feat: flexible pivot-style movement query`.

### Task 5: Presupuesto por categoría

**Files:**
- Create: `src/domain/budget.ts`
- Test: `tests/budget.test.ts`

**Interfaces:**
- Consumes: `queryMovements`.
- Produces: `setBudget(db, category: Category, month: string | "default", amount: number): void` (`"default"` aplica a todos los meses sin presupuesto propio); `monthStatus(db, month: string, bank?: string): CategoryStatus[]` con `CategoryStatus = { category: Category; budget: number | null; spent: number; remaining: number | null; percent: number | null; alert: boolean }` (`alert` es verdadero desde el 80%).

- [ ] **Step 1:** Tests: `calcula gastado, restante y porcentaje`; `alert es false al 79% y true al 80%`; `sin presupuesto definido devuelve budget null y no lanza error`; `un presupuesto del mes pisa el default`; `filtra por banco`; `pasarse del presupuesto da remaining negativo`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar sobre la tabla `budgets`, reutilizando `queryMovements` para el gastado.
- [ ] **Step 4:** Correr; Expected: PASS.
- [ ] **Step 5:** Commit `feat: monthly category budgets with 80% alert`.

### Task 6: Gastos fijos desde Excel

**Files:**
- Create: `src/domain/fixed.ts`
- Test: `tests/fixed.test.ts`, `tests/fixtures/fijos.xlsx` (generado en el test con `exceljs`)

**Interfaces:**
- Produces: `importFixedExpenses(db, xlsxPath: string): Promise<{ imported: number }>` (reemplaza la lista); `pendingFixed(db, month: string): FixedStatus[]` con `FixedStatus = { name: string; expected: number; paid: boolean; paidAmount?: number }`.
- **Supuesto mío, validar con el Excel real de Esteban antes de este task:** la primera hoja tiene columnas `nombre`, `monto` y `comercio` (palabra clave para reconocer el pago). Un fijo cuenta como pagado si en el mes hay un `gasto` cuyo comercio normalizado contiene esa palabra clave.

- [ ] **Step 1:** Tests: `importa filas del Excel`; `un fijo con pago en el mes figura paid:true`; `uno sin pago figura paid:false`; `fila sin nombre o con monto inválido se rechaza con el número de fila en el error`; `reimportar reemplaza la lista anterior`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar con `exceljs`.
- [ ] **Step 4:** Correr; Expected: PASS.
- [ ] **Step 5:** Commit `feat: fixed expenses from excel with paid status`.

### Task 7: Servidor MCP

**Files:**
- Create: `src/server.ts` (crea el `McpServer` y registra herramientas), `src/index.ts` (stdio), `README.md` (cómo agregarlo: `claude mcp add gastos -- node dist/index.js` con `GASTOS_DB`)
- Test: `tests/server.test.ts`

**Interfaces:**
- Consumes: todo el dominio.
- Produces: `createServer(db: DatabaseSync): McpServer` con estas herramientas (entrada validada con `zod`, salida en JSON dentro de `content` texto; errores con `isError: true`): `registrar_movimiento` (= `MovementInput`; devuelve `{id, duplicate, needsClassification}`), `consultar_movimientos` (= `Query`), `clasificar_comercio` (`{merchant, category}`), `fijar_presupuesto` (`{category, month, amount}`), `estado_presupuesto` (`{month, bank?}`), `importar_gastos_fijos` (`{path}`), `gastos_fijos_pendientes` (`{month}`), `ultimo_movimiento_registrado` (`{}` → fecha más reciente por banco, para saber desde dónde sincronizar).

- [ ] **Step 1:** Test con `Client` y `InMemoryTransport.createLinkedPair()` del SDK sobre `:memory:`: `lista las 8 herramientas`; `registrar_movimiento dos veces el mismo sourceId devuelve duplicate:true la segunda`; `consultar_movimientos devuelve los totales esperados`; `entrada inválida devuelve isError`.
- [ ] **Step 2:** Correr; Expected: FAIL.
- [ ] **Step 3:** Implementar `createServer` con `registerTool` por herramienta, cada handler de una sola llamada al dominio; `index.ts` abre la base en `GASTOS_DB` y conecta `StdioServerTransport`.
- [ ] **Step 4:** Correr toda la suite (`npm test`) y `npm run build`. Expected: PASS y build sin errores.
- [ ] **Step 5:** Commit `feat: expose domain as MCP tools over stdio`.

### Task 8: Guía de sincronización y prueba con correos reales

**Files:**
- Create: `docs/sync-guide.md`, `docs/samples/` (comprobantes de ejemplo con datos personales tapados)

**Depende de:** permiso explícito de Esteban para leer, en solo lectura, 3 o 4 comprobantes reales de su Gmail.

- [ ] **Step 1:** Con ese permiso, mirar los comprobantes y anotar remitentes, asuntos y campos; guardar muestras sin datos personales en `docs/samples/`.
- [ ] **Step 2:** Escribir `docs/sync-guide.md`: la consulta de Gmail que encuentra los comprobantes, cómo mapear cada mail a `registrar_movimiento` (incluido cuándo es `ingreso` o `transferencia_propia`), usar `ultimo_movimiento_registrado` para sincronizar desde esa fecha, y preguntar a Esteban cuando `needsClassification` sea true.
- [ ] **Step 3:** Prueba de punta a punta en Claude: sincronizar, pedir "cómo van los gastos de este mes por rubro", abrir una categoría. Verificar que los totales coinciden con la suma manual de los comprobantes.
- [ ] **Step 4:** Commit `docs: sync guide validated against real receipts`.

### Task 9: Remitentes bancarios y registro por lote

**Added after user feedback:** filter by sender instead of by subject, avoid re-reading registered mails, and register in batches. The LLM is always Claude (client side); the server has no model.

**Files:**
- Modify: `src/db.ts` (new table `senders(address TEXT PRIMARY KEY, label TEXT)`), `src/server.ts` and `src/tools/*` (register 5 new tools), `README.md`, `docs/sync-guide.md`
- Create: `src/domain/senders.ts`, `src/domain/batch.ts`, `src/tools/senders.ts`
- Test: `tests/senders.test.ts`, `tests/batch.test.ts`, update `tests/server.test.ts` (tool count 8 → 13)

**Interfaces:**
- Consumes: `addMovement`, `MovementInput`, `movementInputSchema`.
- Produces:
  - `addSender(db, address: string, label?: string): { address: string; added: boolean }` (address trimmed + lowercased, must contain `@`; re-adding is not an error, `added:false`); `removeSender(db, address): { removed: boolean }`; `listSenders(db): Array<{ address: string; label: string | null }>` sorted by address; `gmailSenderQuery(senders): string` → `from:(a@x.com OR b@y.com)` (empty list → empty string).
  - `filterUnregistered(db, sourceIds: string[]): string[]` (returns the input ids, in order and without duplicates, that are NOT registered; an id counts as registered if some movement has `source_id` equal to it or starting with `<id>#`).
  - `addMovements(db, inputs: unknown[]): BatchResult` with `BatchResult = { results: Array<{ index: number; id?: number; duplicate?: boolean; needsClassification?: boolean; error?: string }>; summary: { registered: number; duplicates: number; failed: number } }`; max 100 items (more → throws "max 100"); each item validated and inserted independently (one bad item never aborts the others), all inside one transaction.
  - Tools: `listar_remitentes` (returns `{senders, gmailQuery}`), `agregar_remitente` `{address, label?}`, `quitar_remitente` `{address}`, `filtrar_no_registrados` `{sourceIds: string[]}` (max 500), `registrar_movimientos` `{movements: MovementInput[]}` (max 100). Descriptions in Spanish telling Claude the flow: listar_remitentes → search Gmail with `gmailQuery` and the date → filtrar_no_registrados with the found message ids → interpret each mail (it may be a promotion, a rejected payment, or not a transaction: do not register those) → registrar_movimientos.

- [ ] **Step 1:** Tests: senders (normalization, re-add, remove, list order, gmailQuery with 0/1/2 senders); filterUnregistered (registered id, `id#1` counts as registered, order kept, duplicates removed, empty input); addMovements (3 valid → registered 3; one invalid amount among valid → failed 1 with error naming `amount` and the rest registered; same sourceId twice in one batch → second duplicate; 101 items throws; per-item `needsClassification` reported); server tests: 13 tools listed, `registrar_movimientos` and `filtrar_no_registrados` end-to-end, invalid input isError.
- [ ] **Step 2:** Run; Expected: FAIL.
- [ ] **Step 3:** Implement the signatures above; reuse `addMovement` per item; the new table via `CREATE TABLE IF NOT EXISTS` in `openDb`.
- [ ] **Step 4:** Update `README.md` (13 tools, new flow) and `docs/sync-guide.md` §1 and §4 to the sender-based flow (replace the subject-based Gmail query by `gmailQuery`; keep the table of known mail types as examples of what Claude will see, and keep the rule "Pago Rechazado and promotions are not transactions").
- [ ] **Step 5:** Run `npm test`, `npm run build`, `npm run typecheck`; Expected: all green.
- [ ] **Step 6:** Commit `feat: bank sender allowlist, unregistered filter and batch registration`.

### Task 10: Empaquetado (npm + MCPB) y README de instalación

**Added after user decision:** distribute without Docker via (1) an npm package run with `npx` and (2) a one-click `.mcpb` bundle for Claude Desktop; plus a detailed install README. A standalone executable is deferred.

**Verify before building (do not assume):**
- Current MCPB spec in https://github.com/modelcontextprotocol/mcpb (sources disagree on `manifest_version` 0.2 vs 0.3) and `npx @anthropic-ai/mcpb validate` / `pack`.
- **Which Node version Claude Desktop bundles for `.mcpb` servers.** The server uses `node:sqlite` (Node >=22.5). If the bundled Node is older, the bundle cannot use `node:sqlite`: then decide with the controller between a WASM SQLite (e.g. sql.js, no native deps) behind the existing db layer, or documenting that the bundle is unavailable; do not ship a bundle that fails at start.
- Package name availability on npm (`npm view <name>`); do NOT publish: publishing is the user's decision, the task ends at a tarball verified with `npm pack` and installed from it in a temp dir.

**Files:**
- Modify: `package.json` (name, version, `bin`, `files`, `engines`, `repository`/`license` placeholders marked TODO for the user, `prepack` build), `README.md` (full rewrite)
- Create: `manifest.json` (MCPB), `scripts/build-mcpb.*` (bundle server with esbuild into one JS file, then `mcpb pack`), `LICENSE` only if the user chooses one (otherwise leave a TODO, do not invent a license)
- Test: a smoke script `scripts/smoke-pack.*`: `npm pack` → install the tarball in a temp dir → run its bin over stdio with `GASTOS_DB=:memory:` → assert `tools/list` returns 13 tools.

**README must cover (plain language, step by step):** what it is and what data it stores locally; requirements (Node >=22.5 for npm path); install A (Claude Code: `claude mcp add gastos -- npx -y <package>`), install B (Claude Desktop: double-click the `.mcpb`, with where to find the file), install C (manual JSON config for other clients); where the database lives (`GASTOS_DB`, default `~/.gastos-mcp/gastos.db`) and how to back it up / delete it; first-use walkthrough (add senders, sync, first queries, importing the fixed-expenses Excel with its format); privacy (email never read by the server; only extracted data stored); the tools list; troubleshooting (Node too old, tool not showing up, DB path); limitations (no edit/delete of a movement yet, receipt formats validated only for BBVA Colombia).

- [ ] Step 1: Research the three "verify" items above and write the findings at the top of the task report; stop with NEEDS_CONTEXT if the Node-version question blocks the bundle.
- [ ] Step 2: Make `npm pack` produce a tarball with only `dist/`, `README.md`, `package.json` (no tests, no docs/superpowers, no .superpowers); `bin` points to `dist/index.js` with a shebang and exec permission.
- [ ] Step 3: Smoke script test (RED → GREEN) as described.
- [ ] Step 4: MCPB manifest + build script; `mcpb validate` passes and `mcpb pack` produces the `.mcpb`; unzip and confirm it contains the single bundled server file and the manifest.
- [ ] Step 5: Rewrite README per the list above.
- [ ] Step 6: `npm test`, `npm run build`, `npm run typecheck`, smoke script all green; commit `feat: npm and mcpb packaging with install readme`.
