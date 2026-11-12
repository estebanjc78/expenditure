# Conectar Gmail (configuración única)

[Read in English](gmail-setup.md)

Con Gmail conectado, el servidor lee por sí mismo tus correos de notificaciones del banco, extrae los datos con reglas por banco y le devuelve a Claude solo un resumen corto. Eso permite cargar semanas o meses de historial de una vez: los correos no pasan por el contexto de Claude.

Esto se hace una sola vez. Después, conectar es un clic en el botón **Permitir** de Google.

> El servidor pide el permiso de **solo lectura** (`gmail.readonly`). No puede enviar, borrar ni modificar correos. El token de acceso se guarda solo en tu computador, en `~/.gastos-mcp/gmail-token.json` (permisos solo para tu usuario), junto a la base de datos.

## 1. Crear un cliente OAuth en Google Cloud

Google exige que toda app que lea Gmail esté registrada. Registras la tuya, así el acceso queda bajo tu control.

1. Abre <https://console.cloud.google.com/> y crea un proyecto (cualquier nombre, por ejemplo `expenditures-control`).
2. **APIs y servicios > Biblioteca**, busca **Gmail API** y pulsa **Habilitar**.
3. **APIs y servicios > Pantalla de consentimiento de OAuth** (o **Google Auth Platform**):
   - Tipo de usuario: **Externo**.
   - Nombre de la app y correo de soporte: lo que quieras.
   - Agrega el alcance `https://www.googleapis.com/auth/gmail.readonly`.
   - Agrega tu propio correo de Gmail en **Usuarios de prueba**.
4. **APIs y servicios > Credenciales > Crear credenciales > ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación de escritorio**.
   - Descarga el archivo JSON.
5. Guarda ese archivo como `~/.gastos-mcp/google-client.json` (o junto a tu base de datos si definiste `GASTOS_DB`).

Alternativa al archivo: define `GASTOS_GOOGLE_CLIENT_ID` y `GASTOS_GOOGLE_CLIENT_SECRET` en el `env` del servidor.

### Sobre la pantalla de "app no verificada" y el vencimiento del token

- Como la app es tuya y Google no la verificó, la pantalla de consentimiento muestra una advertencia. Pulsa **Avanzado > Ir a (nombre de tu app)**. Es lo esperado: estás autorizando tu propia app sobre tu propia cuenta.
- Mientras la pantalla de consentimiento esté en estado **Prueba**, Google puede vencer el token de renovación a los ~7 días y tendrás que volver a ejecutar `conectar_gmail`. Si te molesta, cambia el estado de publicación a **En producción** (sigue sin verificar, lo cual está bien para uso personal). Revisa la documentación vigente de Google para las reglas exactas.

## 2. Conectar

Pídele a Claude: **"Conecta mi Gmail."** Claude ejecuta `conectar_gmail`, se abre el navegador con la pantalla de Google, pulsas **Permitir** y listo. `estado_gmail` muestra si funcionó.

## 3. Sincronizar

1. Agrega tu remitente del banco una vez: "Agrega `BBVA@bbvanet.com.co` como remitente bancario."
2. Pide: "Sincroniza mis correos del banco desde 2026-09-01." Claude ejecuta `sincronizar_gmail`. Se puede repetir sin riesgo: los correos ya procesados no se vuelven a descargar. Los rangos grandes se procesan por tandas; Claude vuelve a llamarla mientras `remaining` sea mayor que cero.
3. Claude clasifica los comercios nuevos (`clasificar_comercios`) y te muestra la lista para que corrijas lo que haga falta.

## Bancos soportados

BBVA Colombia: compras, dinero recibido (Bre-B y transferencias), transferencias entre cuentas propias y transferencias a terceros. Las transferencias en moneda extranjera se reportan para tu revisión en vez de registrarse. Otros bancos necesitan un parser en `src/parsers/`.

## Desconectar

Pídele a Claude: "Desconecta mi Gmail" (`desconectar_gmail`) para borrar el token local. Para revocar también el permiso en Google, ve a <https://myaccount.google.com/permissions>.
