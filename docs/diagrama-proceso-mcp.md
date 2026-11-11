# Diagrama de proceso: MCP de gastos

Flujo de una solicitud desde el asistente hasta la base SQLite local y de vuelta. El servidor no tiene modelo de lenguaje y nunca toca el correo: Claude (cliente) lee Gmail en modo solo lectura, interpreta cada aviso del banco y llama a las herramientas del servidor.

```mermaid
flowchart TD
    U[Usuario pide registrar o consultar gastos] --> C[Cliente MCP / Claude]
    C -->|Inicializa conexión y descubre capacidades| S[Servidor MCP expenditures-control]
    S -->|Lista las 13 herramientas| C

    C -->|Busca avisos por remitente permitido| G[Gmail - solo lectura]
    G -->|Hilos y mensajes| C
    C --> I[Claude interpreta cada mail: monto, comercio, fecha, tipo]
    I --> K{¿Es un movimiento?}
    K -->|No: login, seguridad, pagos de tarjeta| X[Se omite]
    K -->|Sí| D[filtrar_no_registrados con los ids de Gmail]
    D -->|Solo los nuevos| R[registrar_movimientos en lote]

    C -->|Selecciona herramienta y envía argumentos| S
    S --> V{¿Argumentos válidos?}
    V -->|No| E[Generar error claro]
    E --> C
    V -->|Sí| Q[Leer o escribir en la base]
    Q -->|SQL parametrizado| DB[(SQLite local)]
    DB -->|Filas o resultado| Q
    Q --> F[Formatear resultado como respuesta MCP]
    F --> C
    R --> S

    C --> A[Interpretar resultado y responder al usuario]
    A --> U
```

## Pasos

1. El cliente MCP establece la sesión con el servidor y consulta sus capacidades.
2. Claude busca en Gmail (solo lectura) los avisos de los remitentes permitidos e interpreta cada uno.
3. Los avisos que no son movimientos se omiten. Los demás se cruzan con `filtrar_no_registrados` usando el id del mensaje de Gmail, para no duplicar.
4. Los movimientos nuevos se guardan en lote con `registrar_movimientos`.
5. Para consultas (presupuesto, categorías, meses), Claude elige la herramienta y envía sus argumentos.
6. El servidor valida la solicitud, opera sobre la base SQLite local y devuelve el resultado, o un error explícito.
7. Claude interpreta la respuesta y se la comunica al usuario.
