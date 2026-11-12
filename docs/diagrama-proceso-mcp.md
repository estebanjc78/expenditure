# Diagrama de proceso: MCP de gastos

Flujo de una solicitud desde el asistente hasta la base SQLite local y de vuelta. El servidor no tiene modelo de lenguaje: lee Gmail por su cuenta (solo lectura, con el permiso que das una vez), extrae los datos con reglas por banco y le devuelve a Claude solo un resumen. Claude clasifica los comercios y responde las preguntas.

```mermaid
flowchart TD
    U[Usuario pide sincronizar o consultar gastos] --> C[Cliente MCP / Claude]
    C -->|Inicializa conexión y descubre capacidades| S[Servidor MCP expenditures-control]
    S -->|Lista las 18 herramientas| C

    C -->|conectar_gmail, una sola vez| O[Google: pantalla Permitir, solo lectura]
    O -->|Token guardado en el computador del usuario| S

    C -->|sincronizar_gmail con rango de fechas| S
    S --> V{¿Argumentos válidos y Gmail conectado?}
    V -->|No| E[Generar error claro]
    E --> C
    V -->|Sí| G[API de Gmail: correos de los remitentes autorizados]
    G -->|Solo los correos aún no procesados| P[Parser por banco: expresiones regulares sobre Detalles de la operación]
    P --> K{¿Es un movimiento?}
    K -->|No: rechazado, aviso duplicado| X[Se omite y se recuerda]
    K -->|Divisa extranjera| R[Se reporta para revisión]
    K -->|Formato desconocido| Y[Se lista como no reconocido]
    K -->|Sí| DB[(SQLite local)]
    DB --> F[Resumen: registrados, omitidos, para revisar, comercios sin categoría]
    X --> F
    R --> F
    Y --> F
    F --> C

    C -->|clasificar_comercios con su criterio| S
    S --> DB
    C -->|consultar_movimientos, estado_presupuesto| S
    S --> DB

    C --> A[Interpretar resultado y responder al usuario]
    A --> U
```

## Pasos

1. El cliente MCP establece la sesión con el servidor y consulta sus capacidades.
2. Una sola vez, `conectar_gmail` abre la pantalla de Google; el usuario toca Permitir (solo lectura) y el token queda guardado localmente.
3. `sincronizar_gmail(desde, hasta)`: el servidor busca en Gmail los correos de los remitentes autorizados, descarta los ya procesados y extrae los datos del bloque "Detalles de la operación" con reglas por banco. Ningún correo pasa por el contexto de Claude.
4. Los movimientos nuevos se guardan en SQLite. Los avisos rechazados o duplicados se omiten, las divisas extranjeras y los formatos desconocidos se reportan.
5. El servidor devuelve un resumen. Si quedan correos, Claude vuelve a llamar a la herramienta con las mismas fechas.
6. Claude clasifica los comercios nuevos con `clasificar_comercios` y le muestra la lista al usuario para que corrija lo que haga falta.
7. Para consultas (presupuesto, categorías, meses), Claude elige la herramienta, el servidor valida, consulta la base y devuelve el resultado.
8. Claude interpreta la respuesta y se la comunica al usuario.
