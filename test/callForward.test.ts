import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { parseCallForward, serializeCallForward, callForwardFromForm } from "@/lib/callForward";

describe("parseCallForward", () => {
  it("parses a valid always/no_answer forward and cleans the number", () => {
    expect(parseCallForward({ mode: "always", number: "+1 (512) 555-0123" })).toEqual({ mode: "always", number: "+15125550123" });
    expect(parseCallForward({ mode: "no_answer", number: "5125550123" })).toEqual({ mode: "no_answer", number: "5125550123" });
  });

  it("returns null for off/empty/invalid shapes", () => {
    expect(parseCallForward(null)).toBeNull();
    expect(parseCallForward(undefined)).toBeNull();
    expect(parseCallForward({})).toBeNull();
    expect(parseCallForward({ mode: "busy", number: "123" })).toBeNull(); // unsupported mode
    expect(parseCallForward({ mode: "always", number: "" })).toBeNull();
    expect(parseCallForward({ mode: "always", number: "abc" })).toBeNull(); // cleans to empty
    expect(parseCallForward("nope")).toBeNull();
  });
});

describe("serializeCallForward", () => {
  it("returns a plain object for a forward and DbNull for off", () => {
    expect(serializeCallForward({ mode: "always", number: "+15125550123" })).toEqual({ mode: "always", number: "+15125550123" });
    expect(serializeCallForward(null)).toBe(Prisma.DbNull);
    // a forward whose number cleans to empty is treated as off
    expect(serializeCallForward({ mode: "always", number: "" })).toBe(Prisma.DbNull);
  });

  it("round-trips through parse", () => {
    const cf = { mode: "no_answer" as const, number: "+15125550123" };
    expect(parseCallForward(serializeCallForward(cf))).toEqual(cf);
  });
});

describe("callForwardFromForm", () => {
  it("builds a forward only for a valid mode + number", () => {
    expect(callForwardFromForm("always", "+15125550123")).toEqual({ mode: "always", number: "+15125550123" });
    expect(callForwardFromForm("no_answer", "5125550123")).toEqual({ mode: "no_answer", number: "5125550123" });
    expect(callForwardFromForm("off", "5125550123")).toBeNull();
    expect(callForwardFromForm("always", "")).toBeNull();
    expect(callForwardFromForm("bogus", "123")).toBeNull();
  });
});
