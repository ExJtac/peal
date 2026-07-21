import { describe, it, expect } from "vitest";
import { decideGuardrail, type GuardrailContext, type GuardrailPolicyInput } from "@/lib/guardrail";

const base: GuardrailPolicyInput = {
  internationalEnabled: false,
  hasInternationalPin: false,
  maxConcurrentOutbound: 4,
  allowedCountryCodes: [],
  blockedPrefixes: [],
};

const ctx = (over: Partial<GuardrailContext>): GuardrailContext => ({
  callClass: "NATIONAL",
  dialedDigits: "15125551234",
  extensionPermission: "national",
  concurrentOutbound: 0,
  velocityCount: 0,
  velocityLimit: null,
  ...over,
});

describe("decideGuardrail", () => {
  it("blocks international when disabled", () =>
    expect(decideGuardrail(base, ctx({ callClass: "INTERNATIONAL", dialedDigits: "01144123", extensionPermission: "international" })).action).toBe("BLOCK"));

  it("allows international when enabled and permitted", () =>
    expect(decideGuardrail({ ...base, internationalEnabled: true }, ctx({ callClass: "INTERNATIONAL", dialedDigits: "01144123", extensionPermission: "international" })).action).toBe("ALLOW"));

  it("requires a PIN for international when the extension lacks permission but a PIN exists", () =>
    expect(decideGuardrail({ ...base, internationalEnabled: true, hasInternationalPin: true }, ctx({ callClass: "INTERNATIONAL", dialedDigits: "01144123", extensionPermission: "national" })).action).toBe("PIN_REQUIRED"));

  it("always allows emergency", () =>
    expect(decideGuardrail(base, ctx({ callClass: "EMERGENCY", dialedDigits: "911" })).action).toBe("ALLOW"));

  it("blocks a blocked prefix", () =>
    expect(decideGuardrail({ ...base, blockedPrefixes: ["1900"] }, ctx({ dialedDigits: "19005551234" })).action).toBe("BLOCK"));

  it("gates by extension permission (local extension dialing national)", () =>
    expect(decideGuardrail(base, ctx({ extensionPermission: "local" })).action).toBe("BLOCK"));

  it("enforces the concurrency cap", () =>
    expect(decideGuardrail(base, ctx({ concurrentOutbound: 4 })).action).toBe("BLOCK"));

  it("enforces the velocity cap", () =>
    expect(decideGuardrail(base, ctx({ velocityCount: 10, velocityLimit: 10 })).action).toBe("BLOCK"));

  it("allows a normal permitted national call", () =>
    expect(decideGuardrail(base, ctx({})).action).toBe("ALLOW"));
});
