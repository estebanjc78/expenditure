import { afterEach, describe, expect, it } from "vitest";
import { openInBrowser } from "../src/open-browser.js";

describe("openInBrowser", () => {
  const original = process.env.GASTOS_NO_BROWSER;
  afterEach(() => {
    if (original === undefined) delete process.env.GASTOS_NO_BROWSER;
    else process.env.GASTOS_NO_BROWSER = original;
  });

  it("does nothing when GASTOS_NO_BROWSER=1", async () => {
    process.env.GASTOS_NO_BROWSER = "1";
    expect(await openInBrowser("http://127.0.0.1:1/")).toBe(false);
  });
});
