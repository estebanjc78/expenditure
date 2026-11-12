import type { Kind } from "../domain/types.js";

export interface ParserInput {
  readonly subject: string;
  /** Mail body, HTML or plain text. */
  readonly text: string;
  /** Mail received time, epoch milliseconds. */
  readonly receivedAt: number;
}

export interface ParsedMovement {
  readonly date: string; // YYYY-MM-DD, Colombian local date
  readonly amount: number; // COP, integer
  readonly merchant: string;
  readonly kind: Kind;
}

export type ParseResult =
  | { readonly status: "movement"; readonly movement: ParsedMovement }
  /** A mail that is known not to be a movement (rejected purchase, duplicate notice). */
  | { readonly status: "skip"; readonly reason: string }
  /** A real movement the parser will not guess (foreign currency): the user decides. */
  | { readonly status: "review"; readonly reason: string }
  | { readonly status: "unrecognized" };

export type Parser = (input: ParserInput) => ParseResult;

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // Colombia is UTC-5 all year (no DST)

/** Colombian local calendar date (YYYY-MM-DD) of an instant. */
export function bogotaDate(epochMs: number): string {
  return new Date(epochMs - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}
