import vm from "node:vm";

const TIMEOUT_MS = 150;
const MAX_PATTERN_CHARS = 200;

export class UnsafeRegexError extends Error {}

/** Compiles a pattern only to check it is valid and not absurdly long (the pattern may come from a language model). */
export function assertRegexUsable(pattern: string): void {
  if (pattern.length > MAX_PATTERN_CHARS) throw new UnsafeRegexError(`regex too long (max ${MAX_PATTERN_CHARS} characters)`);
  try {
    new RegExp(pattern, "i");
  } catch (err) {
    throw new UnsafeRegexError(`invalid regex: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Runs a regex against mail text in an isolated context with a time limit, so a catastrophic pattern
 * cannot freeze the server. Returns capture group 1 (or the whole match), or null when nothing matches.
 */
export function safeMatch(pattern: string, text: string): string | null {
  assertRegexUsable(pattern);
  const context = vm.createContext({ pattern, text, result: null });
  try {
    vm.runInContext(
      'result = (function () { var m = new RegExp(pattern, "i").exec(text); return m ? (m[1] === undefined ? m[0] : m[1]) : null; })()',
      context,
      { timeout: TIMEOUT_MS },
    );
  } catch {
    throw new UnsafeRegexError(`regex took longer than ${TIMEOUT_MS} ms and was stopped (it may backtrack catastrophically)`);
  }
  return typeof context.result === "string" ? context.result : null;
}
