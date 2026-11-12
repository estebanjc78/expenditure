import { join } from "node:path";
import { openInBrowser } from "../open-browser.js";
import { BUNDLED_CLIENT } from "./bundled-client.js";
import { GmailApiSource } from "./client.js";
import { beginAuthorization, getAccessToken, loadClientConfig, TokenStore } from "./oauth.js";
import type { GoogleClientConfig } from "./oauth.js";
import type { MailSource } from "./source.js";

const SETUP_HINT =
  "Esta instalación no trae la app de Google incluida. Opciones: usa el conector de Gmail de Claude para los correos recientes (docs/sync-guide.md), " +
  "o configura tu propia app de Google (docs/gmail-setup.md, sección 'Use your own Google app').";

export interface GmailStatus {
  readonly configured: boolean;
  readonly connected: boolean;
  readonly waitingForUser: boolean;
  readonly lastError: string | null;
}

export interface GmailService {
  status(): GmailStatus;
  connect(): Promise<{ url: string; opened: boolean }>;
  disconnect(): { disconnected: boolean };
  source(): MailSource;
}

export interface GmailServiceOptions {
  /** Folder that holds google-client.json and the token (the database folder). */
  readonly dataDir: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchFn?: typeof fetch;
  /** Opens a URL in the user's browser; returns whether it could. */
  readonly openUrl?: (url: string) => Promise<boolean>;
  /** How long to wait for the user to click Allow (tests shorten it). */
  readonly oauthTimeoutMs?: number;
  /** Client shipped with the package; defaults to BUNDLED_CLIENT. */
  readonly bundledClient?: GoogleClientConfig | null;
}

export function createGmailService(options: GmailServiceOptions): GmailService {
  const env = options.env ?? process.env;
  const store = new TokenStore(join(options.dataDir, "gmail-token.json"));
  const open = options.openUrl ?? openInBrowser;
  let pending: Promise<{ url: string }> | null = null;
  let lastError: string | null = null;

  const config = (): GoogleClientConfig | null => loadClientConfig(options.dataDir, env, options.bundledClient === undefined ? BUNDLED_CLIENT : options.bundledClient);
  const requireConfig = (): GoogleClientConfig => {
    const c = config();
    if (!c) throw new Error(SETUP_HINT);
    return c;
  };

  return {
    status: () => ({ configured: config() !== null, connected: store.read() !== null, waitingForUser: pending !== null, lastError }),

    async connect() {
      const cfg = requireConfig();
      if (pending) return { url: (await pending).url, opened: false };
      lastError = null;
      // `pending` is set synchronously, so two quick calls cannot open two listeners.
      const started = beginAuthorization(cfg, store, { fetchFn: options.fetchFn, timeoutMs: options.oauthTimeoutMs }).then(({ url, completion }) => {
        completion
          .catch((err: unknown) => {
            lastError = err instanceof Error ? err.message : String(err);
          })
          .finally(() => {
            pending = null;
          });
        return { url };
      });
      pending = started;
      started.catch(() => {
        pending = null;
      });
      const { url } = await started;
      return { url, opened: await open(url) };
    },

    disconnect() {
      const had = store.read() !== null;
      store.clear();
      return { disconnected: had };
    },

    source() {
      const cfg = requireConfig();
      if (store.read() === null) throw new Error("Gmail no está conectado: llama a conectar_gmail");
      return new GmailApiSource(() => getAccessToken(cfg, store, { fetchFn: options.fetchFn }), { fetchFn: options.fetchFn });
    },
  };
}
