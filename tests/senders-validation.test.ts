import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { addSender } from "../src/domain/senders.js";

describe("addSender validation", () => {
  const db = openDb(":memory:");

  it.each(["BBVA@bbvanet.com.co", "notificacionesBreB@bbva.com", "a.b+c@sub.domain.co"])("accepts %s", (address) => {
    expect(addSender(db, address).added).toBe(true);
  });

  it.each([
    "x@y.com) OR (in:anywhere",
    "x@y.com OR from:z@w.com",
    "x y@z.com",
    "x@y",
    "(x)@y.com",
    "x@@y.com",
    '"quoted"@y.com',
  ])("rejects %s so it cannot widen the Gmail query", (address) => {
    expect(() => addSender(db, address)).toThrow(/Invalid sender address/);
  });
});
