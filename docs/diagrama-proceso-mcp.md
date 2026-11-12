# Diagrama de proceso: MCP de gastos

Flujo de una solicitud desde el asistente hasta la base SQLite local y de vuelta. El servidor no tiene modelo de lenguaje. Los correos del banco se pueden leer por dos caminos y los dos terminan en la misma base: Claude clasifica los comercios y responde las preguntas.

- **Camino A, Gmail conectado al servidor:** el servidor lee Gmail por su cuenta (solo lectura, con el permiso que el usuario da una vez), extrae los datos con reglas por banco y le devuelve a Claude solo un resumen. Sirve para cargar meses de historial.
- **Camino B, conector de Gmail de Claude:** no requiere configurar nada. Claude lee los correos recientes y le entrega al servidor los datos ya extraídos. Sirve para el uso diario.

```mermaid
flowchart TD
    U["Usuario pide sincronizar o consultar gastos"] --> C["Cliente MCP / Claude"]
    C -->|"Inicializa conexión y descubre capacidades"| S["Servidor MCP expenditures-control"]
    S -->|"Lista las 23 herramientas"| C

    C --> D{"¿Cómo se leen los correos?"}

    D -->|"Camino A: Gmail conectado al servidor"| A0{"¿Ya está conectado?"}
    A0 -->|"No, una sola vez"| A1["conectar_gmail: pantalla de Google, Permitir, solo lectura"]
    A1 -->|"Token guardado en el computador del usuario"| A2
    A0 -->|"Sí"| A2["sincronizar_gmail con rango de fechas"]
    A2 --> V{"¿Argumentos válidos y Gmail conectado?"}
    V -->|"No"| E["Generar error claro"]
    E --> C
    V -->|"Sí"| G["API de Gmail: correos de los remitentes autorizados"]
    G -->|"Solo los correos aún no procesados"| P["Parser por banco: expresiones regulares sobre Detalles de la operación"]
    P --> N{"¿El remitente tiene reglas?"}
    N -->|"No: banco nuevo"| L["Claude pide 3 o 4 comprobantes, el usuario los confirma, el servidor prueba las reglas contra ellos y las guarda"]
    L --> P
    N -->|"Sí: incluidas o aprendidas"| K{"¿Es un movimiento?"}
    K -->|"No: rechazado o aviso duplicado"| X["Se omite y se recuerda"]
    K -->|"Divisa extranjera"| R["Se reporta para revisión"]
    K -->|"Formato desconocido"| Y["Se lista como no reconocido"]
    K -->|"Sí"| DB[("SQLite local")]
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
    S --> DB
    C -->|"consultar_movimientos, estado_presupuesto"| S
    S --> DB

    C -->|"abrir_panel"| W["Panel web local: 127.0.0.1, token secreto, solo lectura"]
    W -->|"Lee la base y se actualiza solo"| DB
    W --> U

    C --> A["Interpretar resultado y responder al usuario"]
    A --> U
```

## Pasos

1. El cliente MCP establece la sesión con el servidor y consulta sus capacidades.
2. **Camino A.** Una sola vez, `conectar_gmail` abre la pantalla de Google; el usuario elige su cuenta, pulsa Permitir (solo lectura) y el token queda guardado localmente. La app de Google viene incluida en el paquete `.mcpb`; mientras Google no la verifique, hay un aviso de "app no verificada" y un tope de 100 usuarios.
3. **Camino A.** `sincronizar_gmail(desde, hasta)`: el servidor busca en Gmail los correos de los remitentes autorizados, descarta los ya procesados y extrae los datos del bloque "Detalles de la operación" con reglas por banco. Ningún correo pasa por el contexto de Claude.
4. Los movimientos nuevos se guardan en SQLite. Los avisos rechazados o duplicados se omiten; las divisas extranjeras y los formatos desconocidos se reportan.
5. El servidor devuelve un resumen. Si quedan correos, Claude vuelve a llamar a la herramienta con las mismas fechas.
6. **Camino B.** Sin conexión propia a Gmail, Claude usa su conector: `listar_remitentes` da la búsqueda, `filtrar_no_registrados` deja solo los correos nuevos, Claude los lee y guarda los datos con `registrar_movimientos`. Cada correo leído ocupa unos 5.000 tokens de contexto, por eso conviene para pocos correos.
7. Claude clasifica los comercios nuevos con `clasificar_comercios` y le muestra la lista al usuario para que corrija lo que haga falta.
8. Para consultas (presupuesto, categorías, meses), Claude elige la herramienta, el servidor valida, consulta la base y devuelve el resultado.
9. Claude interpreta la respuesta y se la comunica al usuario.
10. Si el usuario prefiere verlo, `abrir_panel` abre en su navegador un panel interactivo (gráficos, categorías, comparación con el mes anterior). El panel lee la misma base, solo escucha en `127.0.0.1` y se refresca solo cuando llegan movimientos nuevos.
