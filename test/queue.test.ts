import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Offline ACD engine test — mocks ari/db/recording/callRecord/destinations, drives the queue state
// machine, and asserts the ARI calls + QueueCallLog writes. Fake timers keep ring/announce/timeout
// deterministic. Originate returns a deterministic leg id per endpoint ("PJSIP/1001" -> "leg-1001").
const { ari, db, recording, callRecord, destinations } = vi.hoisted(() => ({
  ari: {
    answer: vi.fn().mockResolvedValue(undefined),
    createBridge: vi.fn().mockResolvedValue({ id: "bridge1" }),
    addToBridge: vi.fn().mockResolvedValue(undefined),
    removeFromBridge: vi.fn().mockResolvedValue(undefined),
    destroyBridge: vi.fn().mockResolvedValue(undefined),
    startMoh: vi.fn().mockResolvedValue(undefined),
    stopMoh: vi.fn().mockResolvedValue(undefined),
    setVar: vi.fn().mockResolvedValue(undefined),
    getChannel: vi.fn().mockResolvedValue({ caller: { number: "+15125550000" } }),
    originate: vi.fn().mockImplementation((o: { endpoint: string }) => Promise.resolve({ id: `leg-${o.endpoint.replace("PJSIP/", "")}` })),
    hangup: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(null),
  },
  db: {
    queue: { findUnique: vi.fn() },
    queueCallLog: { create: vi.fn().mockResolvedValue({ id: "log1" }), update: vi.fn().mockResolvedValue({}) },
  },
  recording: { recordingEnabled: vi.fn().mockResolvedValue(false), startBridgeRecording: vi.fn().mockResolvedValue(null) },
  callRecord: { markAnswered: vi.fn().mockResolvedValue(undefined) },
  destinations: { resolveDestination: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@/telephony/ariClient", () => ({ ari }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/telephony/recording", () => recording);
vi.mock("@/telephony/callRecord", () => callRecord);
vi.mock("@/telephony/destinations", () => destinations);

import { dialQueue, onAgentAnswered, onQueueCallerEnded, onQueueAgentEnded, __resetQueuesForTest } from "@/telephony/queue";
import type { Queue, QueueMember, Extension } from "@prisma/client";

function ext(number: string, over: Partial<Extension> = {}): Extension {
  return { id: `ext-${number}`, number, enabled: true, dnd: false, ...over } as Extension;
}
type M = QueueMember & { extension: Extension };
function member(number: string, over: Partial<QueueMember> = {}): M {
  return { id: `m-${number}`, queueId: "q1", extensionId: `ext-${number}`, penalty: 0, order: 0, paused: false, loggedIn: true, extension: ext(number), ...over } as M;
}
function makeQueue(over: Partial<Queue> = {}, members: M[] = [member("1001")]): Queue & { members: M[] } {
  return {
    id: "q1", number: "700", name: "Sales", strategy: "RINGALL", mohClass: "default",
    joinEmpty: true, leaveWhenEmpty: false, agentRingSeconds: 15, wrapUpSeconds: 0,
    maxWaitSeconds: 0, announcePosition: false, announceHoldTime: false, announceFrequency: 30,
    timeoutType: null, timeoutId: null, failoverType: null, failoverId: null,
    createdAt: new Date(), updatedAt: new Date(), members, ...over,
  } as Queue & { members: M[] };
}

// Flush the fire-and-forget serviceQueue() microtask chain (+ any 0ms timers) under fake timers.
const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetQueuesForTest();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("queue engine", () => {
  it("puts the caller on hold, logs the call, and rings the agent (RINGALL)", async () => {
    const q = makeQueue();
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();

    expect(ari.answer).toHaveBeenCalledWith("caller1");
    expect(ari.createBridge).toHaveBeenCalledWith("mixing");
    expect(ari.addToBridge).toHaveBeenCalledWith("bridge1", "caller1");
    expect(ari.startMoh).toHaveBeenCalledWith("bridge1", "default");
    expect(ari.setVar).toHaveBeenCalledWith("caller1", "QUEUE_ACTIVE", "1");
    expect(db.queueCallLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ queueId: "q1", callRecordId: "cr1" }) }));
    expect(ari.originate).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "PJSIP/1001", appArgs: "queued,caller1,q1" }));
  });

  it("RINGALL: first agent to answer wins, the other ringing leg is cancelled, log = ANSWERED", async () => {
    const q = makeQueue({}, [member("1001"), member("1002")]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();
    expect(ari.originate).toHaveBeenCalledTimes(2);

    await onAgentAnswered("leg-1001");
    expect(ari.stopMoh).toHaveBeenCalledWith("bridge1");
    expect(ari.addToBridge).toHaveBeenCalledWith("bridge1", "leg-1001");
    expect(callRecord.markAnswered).toHaveBeenCalledWith("cr1");
    expect(ari.hangup).toHaveBeenCalledWith("leg-1002"); // loser cancelled
    expect(db.queueCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log1" }, data: expect.objectContaining({ outcome: "ANSWERED", agentExtensionId: "ext-1001" }) }),
    );
  });

  it("LINEAR rings the lowest-order agent first (one at a time)", async () => {
    const q = makeQueue({ strategy: "LINEAR" }, [member("1002", { order: 1 }), member("1001", { order: 0 })]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();
    expect(ari.originate).toHaveBeenCalledTimes(1);
    expect(ari.originate).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "PJSIP/1001" }));
  });

  it("advances to the next agent when the first doesn't answer (LINEAR)", async () => {
    const q = makeQueue({ strategy: "LINEAR", agentRingSeconds: 15 }, [member("1001", { order: 0 }), member("1002", { order: 1 })]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();
    expect(ari.originate).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: "PJSIP/1001" }));

    await vi.advanceTimersByTimeAsync(16_000); // past agentRingSeconds+1 → ring timeout hangs up leg-1001
    expect(ari.hangup).toHaveBeenCalledWith("leg-1001");
    await onQueueAgentEnded("leg-1001"); // its ChannelDestroyed → free + advance
    await flush();
    expect(ari.originate).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: "PJSIP/1002" }));
  });

  it("caller abandons while waiting → bridge destroyed, ringing agent cancelled, log = ABANDONED", async () => {
    const q = makeQueue({}, [member("1001")]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();

    await onQueueCallerEnded("caller1");
    expect(ari.destroyBridge).toHaveBeenCalledWith("bridge1");
    expect(ari.hangup).toHaveBeenCalledWith("leg-1001"); // cancel the ringing agent
    expect(db.queueCallLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outcome: "ABANDONED" }) }));
  });

  it("max-wait timeout routes the caller to the failover destination (log = FAILOVER)", async () => {
    const q = makeQueue({ maxWaitSeconds: 30, failoverType: "VOICEMAIL", failoverId: "ext-vm" }, [member("1001")]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();

    await vi.advanceTimersByTimeAsync(31_000);
    expect(destinations.resolveDestination).toHaveBeenCalledWith("VOICEMAIL", "ext-vm", "caller1", "cr1");
    expect(ari.destroyBridge).toHaveBeenCalledWith("bridge1");
    expect(db.queueCallLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ outcome: "FAILOVER" }) }));
  });

  it("does not ring a paused agent (portal pause → engine skips) but still holds the caller", async () => {
    const q = makeQueue({}, [member("1001", { paused: true })]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();
    expect(ari.createBridge).toHaveBeenCalled(); // caller joins (joinEmpty default true)
    expect(ari.originate).not.toHaveBeenCalled(); // the paused agent is not dialed
  });

  it("join-empty=false with no eligible agents fails over immediately (never held)", async () => {
    const q = makeQueue({ joinEmpty: false, failoverType: "EXTENSION", failoverId: "ext-mgr" }, [member("1001", { loggedIn: false })]);
    db.queue.findUnique.mockResolvedValue(q);
    await dialQueue("caller1", q, "cr1");
    await flush();

    expect(destinations.resolveDestination).toHaveBeenCalledWith("EXTENSION", "ext-mgr", "caller1", "cr1");
    expect(ari.createBridge).not.toHaveBeenCalled();
    expect(ari.originate).not.toHaveBeenCalled();
  });
});
