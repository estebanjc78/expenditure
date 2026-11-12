import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { addSender, removeSender, listSenders, gmailSenderQuery } from "../src/domain/senders.js";

describe("remitentes", () => {
  it("normaliza (trim + minúsculas) y re-agregar no es error", () => {
    const db = openDb(":memory:");
    expect(addSender(db, "  BBVA@BbvaNet.com.co ", "BBVA")).toEqual({ address: "bbva@bbvanet.com.co", added: true });
    expect(addSender(db, "bbva@bbvanet.com.co")).toEqual({ address: "bbva@bbvanet.com.co", added: false });
  });

  it("rechaza direcciones sin @", () => {
    const db = openDb(":memory:");
    expect(() => addSender(db, "bbva.com")).toThrow(/@/);
    expect(() => addSender(db, "   ")).toThrow(/@/);
  });

  it("quita y lista ordenado por dirección", () => {
    const db = openDb(":memory:");
    addSender(db, "b@y.com", "Banco B");
    addSender(db, "a@x.com");
    expect(listSenders(db)).toEqual([
      { address: "a@x.com", label: null },
      { address: "b@y.com", label: "Banco B" },
    ]);
    expect(removeSender(db, " A@X.com ")).toEqual({ removed: true });
    expect(removeSender(db, "a@x.com")).toEqual({ removed: false });
    expect(listSenders(db)).toHaveLength(1);
  });

  it("gmailSenderQuery con 0, 1 y 2 remitentes", () => {
    expect(gmailSenderQuery([])).toBe("");
    expect(gmailSenderQuery([{ address: "a@x.com", label: null }])).toBe("from:(a@x.com)");
    expect(
      gmailSenderQuery([
        { address: "a@x.com", label: null },
        { address: "b@y.com", label: "B" },
      ]),
    ).toBe("from:(a@x.com OR b@y.com)");
  });
});
