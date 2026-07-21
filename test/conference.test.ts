import { describe, it, expect, vi, beforeEach } from "vitest";

const { ari, db } = vi.hoisted(() => ({
  ari: {
    answer: vi.fn().mockResolvedValue(undefined),
    createBridge: vi.fn().mockResolvedValue({ id: "cbridge" }),
    addToBridge: vi.fn().mockResolvedValue(undefined),
    destroyBridge: vi.fn().mockResolvedValue(undefined),
    startMoh: vi.fn().mockResolvedValue(undefined),
    stopMoh: vi.fn().mockResolvedValue(undefined),
    recordBridge: vi.fn().mockResolvedValue({ name: "conf-c1" }),
    setVar: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(null),
    hangup: vi.fn().mockResolvedValue(undefined),
  },
  db: { conference: { findUnique: vi.fn() } },
}));
vi.mock("@/telephony/ariClient", () => ({ ari }));
vi.mock("@/lib/db", () => ({ db }));

import { joinConference, onConferenceChannelGone, __resetConferencesForTest } from "@/telephony/conference";
import type { Conference } from "@prisma/client";

function makeConf(over: Partial<Conference> = {}): Conference {
  return { id: "c1", number: "800", name: "Room", mohWhenAlone: true, record: false, maxMembers: 20, createdAt: new Date(), updatedAt: new Date(), ...over } as Conference;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetConferencesForTest();
});

describe("conference engine", () => {
  it("first participant: creates the bridge, plays MOH-when-alone, mirrors CONF vars", async () => {
    await joinConference("chanA", makeConf(), "crA");
    expect(ari.createBridge).toHaveBeenCalledWith("mixing");
    expect(ari.addToBridge).toHaveBeenCalledWith("cbridge", "chanA");
    expect(ari.startMoh).toHaveBeenCalledWith("cbridge");
    expect(ari.setVar).toHaveBeenCalledWith("chanA", "CONF_ID", "c1");
  });

  it("second participant stops MOH and starts recording when enabled", async () => {
    const conf = makeConf({ record: true });
    await joinConference("chanA", conf, "crA");
    await joinConference("chanB", conf, "crB");
    expect(ari.stopMoh).toHaveBeenCalledWith("cbridge");
    expect(ari.recordBridge).toHaveBeenCalledWith("cbridge", "conf-c1");
  });

  it("restores MOH when back to one, destroys the bridge when empty", async () => {
    const conf = makeConf();
    await joinConference("chanA", conf, "crA");
    await joinConference("chanB", conf, "crB");
    await onConferenceChannelGone("chanB"); // back to 1 → MOH restored
    expect(ari.startMoh).toHaveBeenCalledTimes(2); // first join + restore
    await onConferenceChannelGone("chanA"); // empty → destroy
    expect(ari.destroyBridge).toHaveBeenCalledWith("cbridge");
  });

  it("rejects a caller when the room is full", async () => {
    const conf = makeConf({ maxMembers: 1 });
    await joinConference("chanA", conf, "crA");
    await joinConference("chanB", conf, "crB");
    expect(ari.play).toHaveBeenCalledWith("chanB", "sound:conf-full");
    expect(ari.hangup).toHaveBeenCalledWith("chanB");
  });
});
