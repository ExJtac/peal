import { describe, it, expect } from "vitest";
import { toE164, classifyDial, matchDialPattern, applyDialTransform } from "@/lib/phone";

describe("toE164", () => {
  it("passes through +E.164", () => expect(toE164("+447911123456")).toBe("+447911123456"));
  it("adds +1 to a 10-digit NANP number", () => expect(toE164("5125551234")).toBe("+15125551234"));
  it("handles 1 + 10 digits", () => expect(toE164("15125551234")).toBe("+15125551234"));
  it("converts 011 international prefix", () => expect(toE164("01144123")).toBe("+44123"));
  it("returns null for an internal extension", () => expect(toE164("1001")).toBeNull());
});

describe("classifyDial", () => {
  it("emergency", () => expect(classifyDial("911")).toBe("EMERGENCY"));
  it("internal extension", () => expect(classifyDial("1001")).toBe("INTERNAL"));
  it("toll-free", () => expect(classifyDial("18005551234")).toBe("TOLLFREE"));
  it("national (1+10)", () => expect(classifyDial("15125551234")).toBe("NATIONAL"));
  it("international via 011", () => expect(classifyDial("01144123456")).toBe("INTERNATIONAL"));
  it("international via +", () => expect(classifyDial("+441234")).toBe("INTERNATIONAL"));
  it("local 7-digit", () => expect(classifyDial("5551234")).toBe("LOCAL"));
});

describe("matchDialPattern", () => {
  it("matches N/X tokens with a leading underscore", () => {
    expect(matchDialPattern("_1NXXNXXXXXX", "15125551234")).toBe(true);
    expect(matchDialPattern("_1NXXNXXXXXX", "10125551234")).toBe(false); // N=2-9 fails on '0'
  });
  it("matches the dot wildcard", () => expect(matchDialPattern("9.", "9123")).toBe(true));
  it("matches a plain 10-digit pattern", () => expect(matchDialPattern("NXXNXXXXXX", "5125551234")).toBe(true));
  it("supports character classes", () => {
    expect(matchDialPattern("[2-4]XX", "301")).toBe(true);
    expect(matchDialPattern("[2-4]XX", "101")).toBe(false);
  });
});

describe("applyDialTransform", () => {
  it("strips leading digits then prepends", () =>
    expect(applyDialTransform("95125551234", 1, "1")).toBe("15125551234"));
});
