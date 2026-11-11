# MCP Gastos

Servidor MCP (stdio) sobre una base SQLite local de movimientos financieros personales en COP.

## Compilar y registrar

```bash
npm install
npm run build
claude mcp add gastos -- node "/absolute/path/to/MCP Gastos/dist/index.js"
```

Ajusta la ruta absoluta a donde tengas el proyecto. Requiere Node >= 22.5 (usa `node:sqlite`).

Variable de entorno `GASTOS_DB`: ruta de la base SQLite (por defecto `~/.gastos-mcp/gastos.db`; vacío cuenta como no definida, `~` se expande al home y el directorio se crea solo con permisos 0700).

```bash
claude mcp add gastos -e GASTOS_DB=/ruta/gastos.db -- node "/ruta/absoluta/MCP Gastos/dist/index.js"
```

## Herramientas

- `registrar_movimiento`: guarda un movimiento ya interpretado (usar `sourceId` = id del correo para evitar duplicados; si `needsClassification` es true, preguntar la categoría).
- `consultar_movimientos`: filtra y agrupa movimientos (totales por categoría, banco, comercio, día o mes).
- `clasificar_comercio`: asigna categoría a un comercio y reclasifica todos los gastos de ese comercio (también los ya clasificados).
- `fijar_presupuesto`: define el presupuesto de una categoría para un mes (o `default`).
- `estado_presupuesto`: gastado vs presupuesto por categoría, alerta al 80% y `sinCategoria`.
- `importar_gastos_fijos`: carga la lista de gastos fijos desde un Excel.
- `gastos_fijos_pendientes`: gastos fijos del mes pagados y por pagar.
- `ultimo_movimiento_registrado`: fecha más reciente por banco, para saber desde dónde sincronizar.

## Formato del Excel de gastos fijos

Se lee la primera hoja; la fila 1 son los encabezados `nombre`, `monto`, `comercio` (sin importar mayúsculas). `comercio` es la palabra clave para detectar el pago (palabras completas; si está vacío se usa `nombre`). Importar reemplaza la lista anterior.

## Limitaciones

- Todavía no hay herramienta para editar o borrar un movimiento mal leído (queda para una próxima fase).
- El formato de los comprobantes de BBVA aún no se ha validado contra correos reales (Task 8 pendiente).

## Manejo de datos

La lectura del correo (solo lectura) la hace Claude con su propio conector; este servidor nunca toca el correo.
Solo guarda localmente los datos ya extraídos (fecha, monto, comercio, banco, tipo, categoría), nunca el contenido de los mensajes.
