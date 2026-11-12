import { describe, expect, it } from "vitest";
import { parserForSender, senderAddress } from "../src/parsers/index.js";

describe("senderAddress", () => {
  it("extracts and lowercases the address from a From header", () => {
    expect(senderAddress("BBVA <BBVA@bbvanet.com.co>")).toBe("bbva@bbvanet.com.co");
    expect(senderAddress(" a@b.co ")).toBe("a@b.co");
  });
});

describe("parserForSender", () => {
  it.each([
    "BBVA@bbvanet.com.co",
    "notificacionesBreB@bbva.com",
    "BBVA <info@email.bbva.com.co>",
  ])("uses the BBVA parser for %s", (from) => {
    expect(parserForSender(from)?.bank).toBe("bbva");
  });

  it.each(["avisos@otrobanco.test", "x@notbbva.com", "x@bbva.com.evil.test"])("has no parser for %s", (from) => {
    expect(parserForSender(from)).toBeNull();
  });
});
