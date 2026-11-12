# Connect Gmail

[Leer en español](gmail-setup.es.md)

With Gmail connected, the server reads your bank notification emails itself, extracts the data with per-bank rules and returns only a short summary to Claude. This is what makes it practical to load weeks or months of history in one go: the emails never pass through Claude's context.

> The server asks for the **read-only** scope (`gmail.readonly`). It cannot send, delete or modify mail. The access token is stored only on your computer, in `~/.gastos-mcp/gmail-token.json` (owner-only permissions), next to the database.

## For users: three clicks

1. Ask Claude: **"Connect my Gmail."** Your browser opens Google's page.
2. Choose your account. Google shows a warning that the app is not verified (see below). Click **Advanced**, then **Go to Expenditures Control (unsafe)**.
3. Click **Allow**. Done. Ask Claude "Sync my bank emails from 2026-09-01."

Add your bank sender once beforehand: "Add `BBVA@bbvanet.com.co` as a bank sender."

Sync is safe to repeat: mails already processed are not downloaded again. Large ranges are processed in chunks; Claude calls the tool again while `remaining` is above zero. After syncing, Claude classifies the new merchants and shows you the list so you can correct any.

### Why the "unverified app" warning?

Google requires a security review (a yearly paid audit) before it removes that screen for apps that read Gmail. This project has not gone through it yet, so Google shows the warning and allows up to **100 users** in total. The permission is read-only and the token never leaves your computer. If you would rather not use it, Claude's own Gmail connector still works for recent mail (see [sync-guide.md](sync-guide.md)).

### Disconnect

Ask Claude "Disconnect my Gmail" (`desconectar_gmail`) to delete the local token. To also revoke the permission on Google's side, go to <https://myaccount.google.com/permissions>.

## For the maintainer: one-time Google Cloud setup

End users never do this. You create one OAuth client and ship it in the package.

1. Open <https://console.cloud.google.com/> and create a project (for example `expenditures-control`).
2. **APIs & Services > Library**: search for **Gmail API** and **Enable** it.
3. **APIs & Services > OAuth consent screen** (or **Google Auth Platform**):
   - User type: **External**. App name: `Expenditures Control`. Add a support email.
   - Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
   - Set the publishing status to **In production**. This lets any user connect (up to the 100-user cap of unverified apps) and avoids the 7-day token expiry that applies in Testing status. It stays unverified.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Desktop app**.
   - Copy the client ID and client secret.
5. Download the JSON and save it as `build-secrets/google-client.json` (that folder is gitignored, so the secret never enters the public repo). Then run `npm run build:mcpb`: the client is injected into the `.mcpb` bundle, which is the one-click install. (The npm package does not carry it; npm users bring their own client, see below.) To try it yourself without rebuilding, also save the same JSON as `~/.gastos-mcp/google-client.json`.

To remove the warning and the 100-user cap later, apply for Google's OAuth verification, which for Gmail read access includes a CASA security assessment renewed every year. Ask an approved assessor for a quote and timeline before committing.

## Use your own Google app (advanced)

If a package does not ship a client, or you prefer your own, create one as in the maintainer steps (add yourself as a **Test user** if you keep the app in Testing status) and give it to the server in either way:

- Save the downloaded JSON as `~/.gastos-mcp/google-client.json` (or next to your database if you set `GASTOS_DB`).
- Or set `GASTOS_GOOGLE_CLIENT_ID` and `GASTOS_GOOGLE_CLIENT_SECRET` in the server's `env`.

These override the client shipped with the package.

## Supported banks

BBVA Colombia: purchases, received money (Bre-B and transfers), own-account transfers, transfers to third parties. Foreign-currency transfers are reported for your review instead of being registered. Other banks need a parser in `src/parsers/`.
