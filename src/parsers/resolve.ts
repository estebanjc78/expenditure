import type { DatabaseSync } from "node:sqlite";
import { findProfile } from "../domain/profiles.js";
import { runProfile } from "./engine.js";
import { parserForSender, senderAddress } from "./index.js";
import type { BankParser } from "./index.js";

/** Rules to read a sender's notices: the ones learned from the user's own examples win over the built-in ones. */
export function resolveParser(db: DatabaseSync, from: string): BankParser | null {
  const stored = findProfile(db, senderAddress(from));
  if (stored) return { bank: stored.profile.bank, parse: (input) => runProfile(stored.profile, input) };
  return parserForSender(from);
}
