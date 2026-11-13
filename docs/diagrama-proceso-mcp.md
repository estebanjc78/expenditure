# Diagrama de proceso: MCP de gastos

Flujo de una solicitud desde el asistente hasta la base SQLite local y de vuelta. El servidor no tiene modelo de lenguaje. Los correos del banco se pueden leer por dos caminos y los dos terminan en la misma base. Claude clasifica los comercios y responde las preguntas, y el reporte se ve dentro de la conversación.

- **Camino A, Gmail conectado al servidor:** el servidor lee Gmail por su cuenta (solo lectura, con el permiso que el usuario da una vez), extrae los datos con reglas por banco y le devuelve a Claude solo un resumen. Sirve para cargar meses de historial.
- **Camino B, conector de Gmail de Claude:** no requiere configurar nada. Claude lee los correos recientes y le entrega al servidor los datos ya extraídos. Sirve para el uso diario.
- **Reporte:** una MCP App que Claude dibuja dentro del chat. Pide sus datos con una herramienta privada, así los movimientos no entran al contexto del modelo.

```mermaid
flowchart TD
    U["Usuario pide sincronizar, consultar o ver sus gastos"] --> C["Cliente MCP / Claude"]
    C -->|"Inicializa conexión y descubre capacidades"| S["Servidor MCP expenditures-control"]
    S -->|"Lista las 25 herramientas"| C

    C --> D{"¿Cómo se leen los correos?"}

    D -->|"Camino A: Gmail conectado al servidor"| A0{"¿Ya está conectado?"}
    A0 -->|"No, una sola vez"| A1["conectar_gmail: pantalla de Google, Permitir, solo lectura"]
    A1 -->|"Token guardado en el computador del usuario"| A2
    A0 -->|"Sí"| A2["sincronizar_gmail con rango de fechas"]
    A2 --> V{"¿Argumentos válidos y Gmail conectado?"}
    V -->|"No"| E["Generar error claro"]
    E --> C
    V -->|"Sí"| G["API de Gmail: correos de los remitentes autorizados"]
    G -->|"Solo los correos aún no procesados"| P["Parser por banco: reglas sobre el texto del aviso"]
    P --> N{"¿El remitente tiene reglas?"}
    N -->|"No: banco nuevo"| L["Claude pide 3 o 4 comprobantes, el usuario los confirma, el servidor prueba las reglas contra ellos y las guarda"]
    L --> P
    N -->|"Sí: incluidas o aprendidas"| K{"¿Qué es el aviso?"}
    K -->|"Rechazado o duplicado"| X["Se omite y se recuerda"]
    K -->|"Importe en otra moneda sin valor en pesos"| R["Se reporta para revisión"]
    K -->|"Formato desconocido"| Y["Se lista como no reconocido"]
    K -->|"Movimiento"| T["Se guarda como gasto, ingreso o entre cuentas: USD a COP es ingreso y el pago de tarjeta es entre cuentas. PSE y transferencias a personas reciben su categoría solas"]
    T --> DB[("SQLite local")]
    X --> F["Resumen: registrados, omitidos, para revisar, comercios sin categoría"]
    R --> F
    Y --> F
    DB --> F
    F --> C

    D -->|"Camino B: conector de Gmail de Claude, sin configurar"| B1["listar_remitentes y filtrar_no_registrados"]
    B1 --> B2["Claude lee e interpreta solo los correos nuevos"]
    B2 --> B3["registrar_movimientos"]
    B3 --> DB

    C -->|"clasificar_comercios con su criterio"| S
    C -->|"consultar_movimientos, estado_presupuesto"| S
    C -->|"importar_gastos_fijos, gastos_fijos_pendientes, gastos_recurrentes_no_listados"| S
    S --> DB

    C -->|"ver_panel, con resaltar si el usuario no encuentra un movimiento"| W["Reporte dentro de Claude: MCP App"]
    W -->|"datos_panel: herramienta privada que el modelo no ve"| S
    S -->|"Los datos van solo al reporte; al modelo, un resumen corto"| W
    W -->|"Abre en el mes correcto y resalta la fila buscada"| U
    C -.->|"Si el cliente no soporta MCP Apps: abrir_panel"| WB["Panel en el navegador: 127.0.0.1, token secreto, solo lectura"]
    WB --> DB

    C --> A["Interpretar resultado y responder al usuario"]
    A --> U
```

## Pasos

1. El cliente MCP establece la sesión con el servidor y consulta sus capacidades.
2. **Camino A.** Una sola vez, `conectar_gmail` abre la pantalla de Google; el usuario elige su cuenta, pulsa Permitir (solo lectura) y el token queda guardado localmente. Mientras Google no verifique la app, hay un aviso de "app no verificada" y un tope de 100 usuarios.
3. **Camino A.** `sincronizar_gmail(desde, hasta)`: el servidor busca en Gmail los correos de los remitentes autorizados, descarta los ya procesados y extrae los datos con las reglas del banco. Ningún correo pasa por el contexto de Claude.
4. **Bancos nuevos.** Si un remitente no tiene reglas, Claude le pide al usuario 3 o 4 comprobantes reales, confirma con él cómo se leen y redacta las reglas. El servidor las prueba contra esos ejemplos y solo las guarda si todos pasan (`configurar_formato_banco`).
5. Los movimientos se guardan en SQLite. Una conversión USD a COP entre cuentas propias cuenta como ingreso por los pesos recibidos; el pago de una tarjeta de crédito es un movimiento entre cuentas, para no duplicar las compras de la tarjeta. Los pagos PSE y las transferencias a personas reciben su categoría automáticamente, salvo que el usuario ya haya clasificado ese comercio.
6. El servidor devuelve un resumen. Si quedan correos, Claude vuelve a llamar a la herramienta con las mismas fechas.
7. **Camino B.** Sin conexión propia a Gmail, Claude usa su conector: `listar_remitentes` da la búsqueda, `filtrar_no_registrados` deja solo los correos nuevos, Claude los lee y guarda los datos con `registrar_movimientos`. Cada correo leído ocupa unos 5.000 tokens de contexto, por eso conviene para pocos correos.
8. Claude clasifica los comercios nuevos con `clasificar_comercios` y le muestra la lista al usuario para que corrija lo que haga falta.
9. **Gastos fijos.** Con la lista importada, `gastos_fijos_pendientes` dice qué se pagó y qué falta (los pagos PSE se emparejan por monto, porque el aviso no dice a quién se pagó) y `gastos_recurrentes_no_listados` encuentra suscripciones que se pagan y no están en la lista.
10. **Reporte.** `ver_panel` muestra dentro del chat un reporte interactivo: el gasto del mes, el ritmo contra el mes anterior, categorías que se expanden, un gráfico por día y una tabla con búsqueda. El reporte pide sus datos con `datos_panel`, una herramienta que el modelo no ve, y Claude solo recibe un resumen corto.
11. **Resaltado.** Si el usuario dice "no encuentro la transferencia del alquiler", Claude llama a `ver_panel` con `resaltar`. El servidor entiende "alquiler" como un concepto de la lista de gastos fijos (o un nombre, un monto o una categoría), busca el movimiento en cualquier mes y el reporte se abre en el mes correcto con la fila resaltada.
12. Si el cliente no soporta MCP Apps, `abrir_panel` abre el mismo panel en el navegador. Solo escucha en `127.0.0.1`, exige un token secreto y es de solo lectura.
13. Los totales no incluyen impuestos ni cargos bancarios (4x1000, IVA, comisiones, cuotas de manejo), que ningún correo trae y solo aparecen en el extracto; el reporte lo aclara al pie del gráfico.
