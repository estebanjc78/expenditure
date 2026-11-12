# Conectar Gmail

[Read in English](gmail-setup.md)

Con Gmail conectado, el servidor lee por sí mismo tus correos de notificaciones del banco, extrae los datos con reglas por banco y le devuelve a Claude solo un resumen corto. Eso permite cargar semanas o meses de historial de una vez: los correos no pasan por el contexto de Claude.

> El servidor pide el permiso de **solo lectura** (`gmail.readonly`). No puede enviar, borrar ni modificar correos. El token de acceso se guarda solo en tu computador, en `~/.gastos-mcp/gmail-token.json` (permisos solo para tu usuario), junto a la base de datos.

## Para usuarios: tres clics

1. Dile a Claude: **"Conecta mi Gmail."** Se abre el navegador con la página de Google.
2. Elige tu cuenta. Google muestra una advertencia de que la app no está verificada (ver abajo). Pulsa **Avanzado** y luego **Ir a Expenditures Control (no seguro)**.
3. Pulsa **Permitir**. Listo. Pide: "Sincroniza mis correos del banco desde 2026-09-01."

Antes, agrega una sola vez tu remitente del banco: "Agrega `BBVA@bbvanet.com.co` como remitente bancario."

Sincronizar se puede repetir sin riesgo: los correos ya procesados no se vuelven a descargar. Los rangos grandes se procesan por tandas; Claude vuelve a llamar a la herramienta mientras `remaining` sea mayor que cero. Al terminar, Claude clasifica los comercios nuevos y te muestra la lista para que corrijas lo que haga falta.

### ¿Por qué la advertencia de "app no verificada"?

Google exige una revisión de seguridad (una auditoría anual de pago) antes de quitar esa pantalla en las apps que leen Gmail. Este proyecto todavía no la hizo, por eso Google muestra el aviso y permite hasta **100 usuarios** en total. El permiso es de solo lectura y el token no sale de tu computador. Si prefieres no usarla, el conector de Gmail de Claude sigue sirviendo para los correos recientes (ver [sync-guide.es.md](sync-guide.es.md)).

### Desconectar

Dile a Claude "Desconecta mi Gmail" (`desconectar_gmail`) para borrar el token local. Para revocar también el permiso en Google, ve a <https://myaccount.google.com/permissions>.

## Para el mantenedor: configuración única en Google Cloud

Los usuarios finales nunca hacen esto. Tú creas un cliente OAuth y lo incluyes en el paquete.

1. Abre <https://console.cloud.google.com/> y crea un proyecto (por ejemplo `expenditures-control`).
2. **APIs y servicios > Biblioteca**: busca **Gmail API** y **Habilítala**.
3. **APIs y servicios > Pantalla de consentimiento de OAuth** (o **Google Auth Platform**):
   - Tipo de usuario: **Externo**. Nombre de la app: `Expenditures Control`. Agrega un correo de soporte.
   - Agrega el alcance `https://www.googleapis.com/auth/gmail.readonly`.
   - Pon el estado de publicación en **En producción**. Así cualquier usuario puede conectarse (hasta el tope de 100 de las apps no verificadas) y se evita el vencimiento de 7 días del token que aplica en estado de Prueba. Sigue sin verificar.
4. **APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación de escritorio**.
   - Copia el ID de cliente y el secreto.
5. Pégalos en [src/gmail/bundled-client.ts](../src/gmail/bundled-client.ts) y vuelve a construir (`npm run build`, `npm run build:mcpb`). En clientes de escritorio Google no trata el secreto como confidencial, pero puedes inyectarlo al construir si prefieres no subirlo a git.

Para quitar la advertencia y el tope de 100 usuarios más adelante, hay que solicitar la verificación de OAuth de Google, que para lectura de Gmail incluye una evaluación de seguridad CASA que se renueva cada año. Pide cotización y plazos a un evaluador aprobado antes de comprometerte.

## Usar tu propia app de Google (avanzado)

Si un paquete no trae cliente incluido, o prefieres el tuyo, crea uno como en los pasos del mantenedor (agrégate como **Usuario de prueba** si lo dejas en estado de Prueba) y entrégaselo al servidor de cualquiera de estas formas:

- Guarda el JSON descargado como `~/.gastos-mcp/google-client.json` (o junto a tu base de datos si definiste `GASTOS_DB`).
- O define `GASTOS_GOOGLE_CLIENT_ID` y `GASTOS_GOOGLE_CLIENT_SECRET` en el `env` del servidor.

Estos tienen prioridad sobre el cliente incluido en el paquete.

## Bancos soportados

BBVA Colombia: compras, dinero recibido (Bre-B y transferencias), transferencias entre cuentas propias y transferencias a terceros. Las transferencias en moneda extranjera se reportan para tu revisión en vez de registrarse. Otros bancos necesitan un parser en `src/parsers/`.
