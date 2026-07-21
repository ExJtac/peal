import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the boundaries dialExtension/forwardToMobile reach out to, so we can assert WHICH path a
// call takes (ring desk / forward to mobile / voicemail) without a live ARI/DB. vi.hoisted keeps
// the mock objects available to the (hoisted) vi.mock factories.
const { dialEndpoints, ari, db, startVoicemailCapture } = vi.hoisted(() => ({
  dialEndpoints: vi.fn().mockResolvedValue(undefined),
  ari: {
    continueInDialplan: vi.fn().mockResolvedValue(undefined),
    hangup: vi.fn().mockResolvedValue(undefined),
    answer: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    setVar: vi.fn().mockResolvedValue(undefined),
  },
  db: {
    guardrailPolicy: { findUnique: vi.fn() },
    outboundRoute: { findMany: vi.fn() },
    trunk: { findUnique: vi.fn() },
  },
  startVoicemailCapture: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/telephony/originate", () => ({ dialEndpoints, onDialedAnswered: vi.fn() }));
vi.mock("@/telephony/ariClient", () => ({ ari }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/telephony/voicemail", () => ({ startVoicemailCapture, onRecordingFinished: vi.fn(), onVoicemailCallerGone: vi.fn(), onPlaybackFinished: vi.fn() }));
vi.mock("@/telephony/callRecord", () => ({
  finalizeCallRecord: vi.fn().mockResolvedValue(undefined),
  createCallRecord: vi.fn().mockResolvedValue("cr1"),
}));
vi.mock("@/telephony/callSession", () => ({ activeOutboundCount: () => 0, putSession: vi.fn() }));

import { dialExtension } from "@/telephony/destinations";
import type { Extension } from "@prisma/client";

function ext(over: Partial<Extension> = {}): Extension {
  return {
    id: "ext1",
    number: "1001",
    displayName: "Desk",
    dnd: false,
    ringSeconds: 20,
    callForward: null,
    outboundPermission: "national",
    callerIdNumber: null,
    ...over,
  } as Extension;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.guardrailPolicy.findUnique.mockResolvedValue({
    internationalEnabled: false,
    internationalPinEnc: null,
    maxConcurrentOutbound: 4,
    allowedCountryCodes: [],
    blockedPrefixes: [],
  });
  db.outboundRoute.findMany.mockResolvedValue([
    { matchPattern: "_X.", permissionTag: "national", trunkId: "t1", stripDigits: 0, prependDigits: "", callerIdNumber: "+15125550000" },
  ]);
  db.trunk.findUnique.mockResolvedValue({ id: "t1", enabled: true, name: "telnyx" });
});

const lastDial = () => dialEndpoints.mock.calls.at(-1)!;

describe("dialExtension call-forwarding branches", () => {
  it("forward-always → dials the mobile out the trunk, not the desk", async () => {
    await dialExtension("chan1", ext({ callForward: { mode: "always", number: "+15125550123" } }), "cr1");
    expect(dialEndpoints).toHaveBeenCalledTimes(1);
    const [, targets, opts] = lastDial();
    expect(targets).toEqual([{ endpoint: "PJSIP/15125550123@telnyx" }]);
    expect(opts.callerId).toBe("+15125550000"); // route DID
    expect(ari.continueInDialplan).not.toHaveBeenCalled();
  });

  it("forward-always beats DND", async () => {
    await dialExtension("chan1", ext({ dnd: true, callForward: { mode: "always", number: "+15125550123" } }), "cr1");
    expect(lastDial()[1]).toEqual([{ endpoint: "PJSIP/15125550123@telnyx" }]);
  });

  it("no forward + DND → straight to voicemail, no dial", async () => {
    await dialExtension("chan1", ext({ dnd: true }), "cr1");
    expect(dialEndpoints).not.toHaveBeenCalled();
    expect(startVoicemailCapture).toHaveBeenCalledWith("chan1", expect.objectContaining({ number: "1001" }), "cr1");
  });

  it("no forward → rings the desk, then voicemail on no-answer", async () => {
    await dialExtension("chan1", ext(), "cr1");
    const [, targets, opts] = lastDial();
    expect(targets).toEqual([{ endpoint: "PJSIP/1001" }]);
    await opts.onNoAnswer(); // simulate desk not answering
    expect(startVoicemailCapture).toHaveBeenCalledWith("chan1", expect.objectContaining({ number: "1001" }), "cr1");
  });

  it("forward-on-no-answer → rings the desk, then the mobile, then voicemail", async () => {
    await dialExtension("chan1", ext({ callForward: { mode: "no_answer", number: "+15125550123" } }), "cr1");
    // first dial = desk
    expect(dialEndpoints.mock.calls[0][1]).toEqual([{ endpoint: "PJSIP/1001" }]);
    // desk doesn't answer → forwards to the mobile
    await dialEndpoints.mock.calls[0][2].onNoAnswer();
    expect(dialEndpoints.mock.calls[1][1]).toEqual([{ endpoint: "PJSIP/15125550123@telnyx" }]);
    // mobile doesn't answer → voicemail
    await dialEndpoints.mock.calls[1][2].onNoAnswer();
    expect(startVoicemailCapture).toHaveBeenCalledWith("chan1", expect.objectContaining({ number: "1001" }), "cr1");
  });
});
