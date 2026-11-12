# Connect Gmail (one-time setup)

[Leer en español](gmail-setup.es.md)

With Gmail connected, the server reads your bank notification emails itself, extracts the data with per-bank rules and returns only a short summary to Claude. This is what makes it practical to load weeks or months of history in one go: the emails never pass through Claude's context.

You need to do this once. After that, connecting is one click on Google's **Allow** button.

> The server asks for the **read-only** scope (`gmail.readonly`). It cannot send, delete or modify mail. The access token is stored only on your computer, in `~/.gastos-mcp/gmail-token.json` (owner-only permissions), next to the database.

## 1. Create a Google Cloud OAuth client

Google requires every app that reads Gmail to be registered. You register your own, so the access stays under your control.

1. Open <https://console.cloud.google.com/> and create a project (any name, for example `expenditures-control`).
2. **APIs & Services > Library**, search for **Gmail API** and click **Enable**.
3. **APIs & Services > OAuth consent screen** (or **Google Auth Platform**):
   - User type: **External**.
   - App name and support email: anything you like.
   - Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
   - Add your own Gmail address under **Test users**.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Desktop app**.
   - Download the JSON file.
5. Save that file as `~/.gastos-mcp/google-client.json` (or next to your database if you set `GASTOS_DB`).

Alternative to the file: set `GASTOS_GOOGLE_CLIENT_ID` and `GASTOS_GOOGLE_CLIENT_SECRET` in the server's `env`.

### About the "unverified app" screen and token expiry

- Because the app is yours and is not verified by Google, the consent screen shows a warning. Click **Advanced > Go to (your app name)**. This is expected: you are authorizing your own app on your own account.
- While the consent screen is in **Testing** status, Google may expire the refresh token after about 7 days, and you will need to run `conectar_gmail` again. If that bothers you, set the publishing status to **In production** (it stays unverified, which is fine for personal use). Check Google's current documentation for the exact rules.

## 2. Connect

Ask Claude: **"Connect my Gmail."** Claude runs `conectar_gmail`, your browser opens Google's consent page, you click **Allow**, and you are done. `estado_gmail` shows whether it worked.

## 3. Sync

1. Add your bank sender once: "Add `BBVA@bbvanet.com.co` as a bank sender."
2. Ask: "Sync my bank emails from 2026-09-01." Claude runs `sincronizar_gmail`. It is safe to repeat: mails already processed are not downloaded again. Large ranges are processed in chunks; Claude calls it again while `remaining` is above zero.
3. Claude classifies the new merchants (`clasificar_comercios`) and shows you the list so you can correct any.

## Supported banks

BBVA Colombia: purchases, received money (Bre-B and transfers), own-account transfers, transfers to third parties. Foreign-currency transfers are reported for your review instead of being registered. Other banks need a parser in `src/parsers/`.

## Disconnect

Ask Claude: "Disconnect my Gmail" (`desconectar_gmail`) to delete the local token. To also revoke the permission on Google's side, go to <https://myaccount.google.com/permissions>.
