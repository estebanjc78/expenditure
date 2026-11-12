import { describe, expect, it } from "vitest";
import { renderPage } from "../src/panel/web-page.js";

function scriptOf(html: string): string {
  const m = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(html);
  if (!m) throw new Error("no script");
  return m[1]!;
}

describe("dashboard page", () => {
  const html = renderPage("TESTNONCE");

  it("embeds a script that parses", () => {
    expect(() => new Function(scriptOf(html))).not.toThrow();
  });

  it("never builds markup from data (no innerHTML/outerHTML/document.write/eval)", () => {
    const script = scriptOf(html);
    for (const banned of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("]) {
      expect(script).not.toContain(banned);
    }
  });

  it("works under a nonce-only CSP: no inline handlers or style attributes, no external resources", () => {
    expect(html).not.toMatch(/\son[a-z]+="/i);
    expect(html).not.toMatch(/<[a-z][^>]*\sstyle="/i);
    expect(html).not.toMatch(/(?:src|href)="https?:/i);
    expect(html).not.toMatch(/url\(\s*https?:/i);
    expect(scriptOf(html)).not.toMatch(/setAttribute\("style"|\bstyle: "(?!currency")/);
  });

  it("carries the nonce on every inline script and style", () => {
    expect([...html.matchAll(/<(script|style)\b[^>]*>/g)].every((m) => m[0].includes('nonce="TESTNONCE"'))).toBe(true);
  });
});
