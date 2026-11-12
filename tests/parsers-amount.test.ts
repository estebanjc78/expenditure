import { describe, expect, it } from "vitest";
import { parseMoney } from "../src/parsers/amount.js";

describe("parseMoney", () => {
  it.each([
    ["$207,387.00", 207387],
    ["$134,588.00", 134588],
    ["$ 1.595.000,00", 1595000],
    ["$500.000.00", 500000],
    ["$ 500000.00", 500000],
    ["$9.000.000.00", 9000000],
    ["$1.595.000", 1595000],
    ["$ 1.500", 1500],
    ["$100.00", 100],
    ["$ 8824000.00", 8824000],
  ])("reads %s as %i COP", (input, expected) => {
    expect(parseMoney(input)).toEqual({ value: expected, currency: "COP" });
  });

  it("detects a foreign currency prefix", () => {
    expect(parseMoney("USD 4,690.00")).toEqual({ value: 4690, currency: "USD" });
  });

  it("reads an explicit COP prefix", () => {
    expect(parseMoney("COP $14,665,630.00")).toEqual({ value: 14665630, currency: "COP" });
  });

  it("returns null when there is no amount", () => {
    expect(parseMoney("sin monto")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});
