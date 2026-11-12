import { parseBbva } from "./bbva.js";
import type { Parser } from "./types.js";

export interface BankParser {
  readonly bank: string;
  readonly parse: Parser;
}

const BBVA: BankParser = { bank: "bbva", parse: parseBbva };

/** Extracts the bare address from a `From` header (`Name <a@b.c>` or `a@b.c`), lowercased. */
export function senderAddress(from: string): string {
  const angle = /<([^>]+)>/.exec(from);
  return (angle?.[1] ?? from).trim().toLowerCase();
}

/** Picks the bank parser for a sender address, or null when the bank is not supported yet. */
export function parserForSender(from: string): BankParser | null {
  const domain = senderAddress(from).split("@")[1] ?? "";
  const bbvaDomains = ["bbva.com.co", "bbvanet.com.co", "bbva.com"];
  if (bbvaDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) return BBVA;
  return null;
}
