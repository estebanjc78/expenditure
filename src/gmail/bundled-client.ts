import type { GoogleClientConfig } from "./oauth.js";

/** Replaced at bundle time by scripts/build-mcpb.mjs; undefined in plain tsc/vitest builds. */
declare const __BUNDLED_CLIENT__: GoogleClientConfig | undefined;

/**
 * Google OAuth client shipped inside the .mcpb bundle, so end users only click "Allow" and never touch Google Cloud.
 *
 * It is NOT written in the source: `npm run build:mcpb` reads it from `build-secrets/google-client.json` (gitignored,
 * the JSON downloaded from Google Cloud) or from GASTOS_BUNDLED_CLIENT_ID / GASTOS_BUNDLED_CLIENT_SECRET, and injects it.
 * See docs/gmail-setup.md, "For the maintainer". Without it this is null and users fall back to their own client
 * (google-client.json or GASTOS_GOOGLE_CLIENT_ID) or to Claude's own Gmail connector.
 */
export const BUNDLED_CLIENT: GoogleClientConfig | null =
  typeof __BUNDLED_CLIENT__ === "undefined" ? null : __BUNDLED_CLIENT__;
