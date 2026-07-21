import { describe, it, expect } from "vitest";
import { endpointFromChannel, normalizeMac, isValidMac } from "@/lib/ids";

describe("ids", () => {
  it("extracts the endpoint from a channel name", () =>
    expect(endpointFromChannel("PJSIP/1001-00000023")).toBe("1001"));
  it("normalizes a MAC address", () =>
    expect(normalizeMac("AA:BB:CC:11:22:33")).toBe("aabbcc112233"));
  it("validates a MAC address", () => {
    expect(isValidMac("0c:38:3e:11:22:33")).toBe(true);
    expect(isValidMac("xyz")).toBe(false);
  });
});
