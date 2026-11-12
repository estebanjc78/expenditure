import type { GoogleClientConfig } from "./oauth.js";

/**
 * Google OAuth client shipped with this package, so end users only click "Allow" and never touch Google Cloud.
 *
 * The maintainer creates ONE "Desktop app" OAuth client once (see docs/gmail-setup.md, "For the maintainer") and
 * pastes its values here before building the npm package / .mcpb bundle. For Desktop-app clients Google does not
 * treat the client secret as confidential, but keep it out of git history if you prefer: inject it at build time.
 *
 * While this is null, users can still bring their own client (google-client.json or GASTOS_GOOGLE_CLIENT_ID).
 */
export const BUNDLED_CLIENT: GoogleClientConfig | null = null;
