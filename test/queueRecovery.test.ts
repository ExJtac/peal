import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// recoverQueues() re-adopts callers who were on hold when the daemon restarted (their MOH survives
// Asterisk-side; QUEUE_* channel vars carry the durable truth). Mocks ari.getVar to simulate those
// vars on a channel list.
const { ari, db, recording, callRecord, destinations } = vi.hoisted(() => ({
  ari: {
    answer: vi.fn().mockResolvedValue(undefined),
    createBridge: vi.fn().mockResolvedValue({ id: "bridge1" }),
    addToBridge: vi.fn().mockResolvedValue(undefined),
    destroyBridge: vi.fn().mockResolvedValue(undefined),
    startMoh: vi.fn().mockResolvedValue(undefined),
    stopMoh: vi.fn().mockResolvedValue(undefined),
    setVar: vi.fn().mockResolvedValue(undefined),
    getVar: vi.fn().mockResolvedValue(null),
    originate: vi.fn().mockImplementation((o: { endpoint: string }) => Promise.resolve({ id: `leg-${o.endpoint.replace("PJSIP/", "")}` })),
    hangup: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(null),
  },
  db: {
    queue: { findUnique: vi.fn() },
    queueCallLog: { create: vi.fn().mockResolvedValue({ id: "log1" }), update: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue({ id: "log1" }) },
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

import { recoverQueues, __resetQueuesForTest } from "@/telephony/queue";
import type { Queue, QueueMember, Extension } from "@prisma/client";

type M = QueueMember & { extension: Extension };
function makeQueue(): Queue & { members: M[] } {
  const ext = { id: "ext-1001", number: "1001", enabled: true, dnd: false } as Extension;
  const member = { id: "m-1001", queueId: "q1", extensionId: "ext-1001", penalty: 0, order: 0, paused: false, loggedIn: true, extension: ext } as M;
  return {
    id: "q1", number: "700", name: "Sales", strategy: "RINGALL", mohClass: "default",
    joinEmpty: true, leaveWhenEmpty: false, agentRingSeconds: 15, wrapUpSeconds: 0, maxWaitSeconds: 0,
    announcePosition: false, announceHoldTime: false, announceFrequency: 30,
    timeoutType: null, timeoutId: null, failoverType: null, failoverId: null,
    createdAt: new Date(), updatedAt: new Date(), members: [member],
  } as Queue & { members: M[] };
}

// Channel vars keyed by channel id (what ari.getVar returns after a restart).
const VARS: Record<string, Record<string, string>> = {
  caller1: { QUEUE_ACTIVE: "1", QUEUE_ID: "q1", QUEUE_BRIDGE: "bridge1", QUEUE_JOINED_AT: "1700000000000", CALLREC_ID: "cr1" },
  other: {}, // a non-queue channel → no QUEUE_ACTIVE
};

const flush = async () => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetQueuesForTest();
  ari.getVar.mockImplementation((id: string, v: string) => Promise.resolve(VARS[id]?.[v] ?? null));
  db.queueCallLog.findFirst.mockResolvedValue({ id: "log1" });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("recoverQueues", () => {
  it("re-adopts a held caller (re-asserts MOH + resumes serving) and ignores non-queue channels", async () => {
    db.queue.findUnique.mockResolvedValue(makeQueue());
    await recoverQueues([{ id: "caller1", name: "PJSIP/inbound" }, { id: "other", name: "PJSIP/1001" }]);
    await flush();

    expect(ari.startMoh).toHaveBeenCalledWith("bridge1", "default"); // re-assert hold audio
    expect(ari.originate).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "PJSIP/1001" })); // resumed serving
    // the non-queue "other" channel triggered only the QUEUE_ACTIVE probe, no queue lookup
    expect(ari.getVar).toHaveBeenCalledWith("other", "QUEUE_ACTIVE");
  });

  it("hangs up the caller if the queue was deleted during the outage", async () => {
    db.queue.findUnique.mockResolvedValue(null);
    await recoverQueues([{ id: "caller1", name: "PJSIP/inbound" }]);
    expect(ari.hangup).toHaveBeenCalledWith("caller1");
  });

  it("is idempotent — a second recover doesn't re-adopt an already-tracked caller", async () => {
    db.queue.findUnique.mockResolvedValue(makeQueue());
    await recoverQueues([{ id: "caller1", name: "PJSIP/inbound" }]);
    await flush();
    await recoverQueues([{ id: "caller1", name: "PJSIP/inbound" }]); // caller1 already waiting → skipped
    expect(db.queueCallLog.findFirst).toHaveBeenCalledTimes(1);
  });
});
