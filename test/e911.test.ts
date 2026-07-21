import { describe, it, expect } from "vitest";
import { isEmergencyNumber, e911GoLiveErrors, e911IsGoLiveReady } from "@/lib/e911";

describe("isEmergencyNumber", () => {
  it("recognizes 911 and 933 (test number), with separators", () => {
    expect(isEmergencyNumber("911")).toBe(true);
    expect(isEmergencyNumber("9-1-1")).toBe(true);
    expect(isEmergencyNumber("933")).toBe(true);
    expect(isEmergencyNumber("912")).toBe(false);
  });
});

describe("e911 go-live gate", () => {
  it("reports errors when no location or incomplete/unvalidated", () => {
    expect(e911GoLiveErrors(null).length).toBeGreaterThan(0);
    expect(
      e911IsGoLiveReady({ street: "1 Main", city: "Austin", state: "TX", postal: "78701", callbackNumber: "+15125551234", validated: false }),
    ).toBe(false);
  });
  it("is ready when complete and validated", () => {
    expect(
      e911IsGoLiveReady({ street: "1 Main", city: "Austin", state: "TX", postal: "78701", callbackNumber: "+15125551234", validated: true }),
    ).toBe(true);
  });
});
