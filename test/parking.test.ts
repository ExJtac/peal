import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { ari } = vi.hoisted(() => ({
  ari: {
    answer: vi.fn().mockResolvedValue(undefined),
    createBridge: vi.fn().mockResolvedValue({ id: "pbridge" }),
    addToBridge: vi.fn().mockResolvedValue(undefined),
    destroyBridge: vi.fn().mockResolvedValue(undefined),
    startMoh: vi.fn().mockResolvedValue(undefined),
    stopMoh: vi.fn().mockResolvedValue(undefined),
    setVar: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(null),
    hangup: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/telephony/ariClient", () => ({ ari }));

import { park, retrieve, onParkChannelGone, isParkOrbit, parkedSlot, __resetParkingForTest } from "@/telephony/parking";

let bridgeN = 0;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetParkingForTest();
  bridgeN = 0;
  ari.createBridge.mockImplementation(() => Promise.resolve({ id: `pbridge-${++bridgeN}` }));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("call parking", () => {
  it("recognizes the orbit number (default 7000)", () => {
    expect(isParkOrbit("7000")).toBe(true);
    expect(isParkOrbit("1001")).toBe(false);
  });

  it("parks in the lowest free slot, holds on MOH, and announces the slot", async () => {
    await park("callerA");
    expect(ari.addToBridge).toHaveBeenCalledWith("pbridge-1", "callerA");
    expect(ari.setVar).toHaveBeenCalledWith("callerA", "PARK_SLOT", "7001");
    expect(ari.play).toHaveBeenCalledWith("callerA", "digits:7001");
    expect(ari.startMoh).toHaveBeenCalledWith("pbridge-1");
    expect(parkedSlot("7001")).toBe(7001);
  });

  it("uses the next free slot for a second park", async () => {
    await park("callerA");
    await park("callerB");
    expect(ari.setVar).toHaveBeenCalledWith("callerB", "PARK_SLOT", "7002");
  });

  it("retrieve bridges the retriever into the parked call's bridge and frees the slot", async () => {
    await park("callerA");
    await retrieve(7001, "callerC");
    expect(ari.stopMoh).toHaveBeenCalledWith("pbridge-1");
    expect(ari.addToBridge).toHaveBeenCalledWith("pbridge-1", "callerC");
    expect(parkedSlot("7001")).toBe(null); // slot freed for reuse
  });

  it("rejects a retrieve of an empty slot", async () => {
    await retrieve(7005, "callerC");
    expect(ari.hangup).toHaveBeenCalledWith("callerC");
  });

  it("destroys the bridge when the parked caller hangs up", async () => {
    await park("callerA");
    await onParkChannelGone("callerA");
    expect(ari.destroyBridge).toHaveBeenCalledWith("pbridge-1");
  });
});
