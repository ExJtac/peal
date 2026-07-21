import { describe, it, expect, vi, beforeEach } from "vitest";

const { ari, db, enqueueAiJob, finalizeCallRecord } = vi.hoisted(() => ({
  ari: {
    answer: vi.fn().mockResolvedValue(undefined),
    getChannel: vi.fn().mockResolvedValue({ caller: { number: "+15125550123", name: "Caller" } }),
    play: vi.fn().mockResolvedValue(null), // null id → playAndWait returns immediately (no greeting wait)
    record: vi.fn().mockResolvedValue({ name: "vm-cr1" }),
    hangup: vi.fn().mockResolvedValue(undefined),
    setMwi: vi.fn().mockResolvedValue(undefined),
    continueInDialplan: vi.fn().mockResolvedValue(undefined),
  },
  db: {
    voicemailBox: { findUnique: vi.fn() },
    voicemailMessage: { create: vi.fn().mockResolvedValue({ id: "vm1" }), count: vi.fn().mockResolvedValue(1) },
  },
  enqueueAiJob: vi.fn().mockResolvedValue(undefined),
  finalizeCallRecord: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/telephony/ariClient", () => ({ ari }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/queue", () => ({ enqueueAiJob }));
vi.mock("@/telephony/callRecord", () => ({ finalizeCallRecord }));

import { startVoicemailCapture, onRecordingFinished, onVoicemailCallerGone } from "@/telephony/voicemail";
import type { Extension } from "@prisma/client";

const ext = { id: "ext1", number: "1001" } as Extension;
const BOX = { id: "box1", mailbox: "1001", greetingPath: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.voicemailBox.findUnique.mockResolvedValue(BOX);
  db.voicemailMessage.create.mockResolvedValue({ id: "vm1" });
  db.voicemailMessage.count.mockResolvedValue(1);
});

describe("voicemail capture", () => {
  it("answers + records the caller channel into a named recording", async () => {
    await startVoicemailCapture("chan1", ext, "cr1");
    expect(finalizeCallRecord).toHaveBeenCalledWith("cr1", { disposition: "VOICEMAIL" });
    expect(ari.answer).toHaveBeenCalledWith("chan1");
    expect(ari.record).toHaveBeenCalledWith("chan1", "vm-cr1", expect.objectContaining({ terminateOn: "#", beep: true }));
  });

  it("finalizes on RecordingFinished → creates the message, enqueues transcription, refreshes MWI", async () => {
    await startVoicemailCapture("chan1", ext, "cr1");
    await onRecordingFinished({ name: "vm-cr1", duration: 12 });

    expect(db.voicemailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ boxId: "box1", audioPath: "vm-cr1", durationSec: 12, folder: "INBOX", fromNumber: "+15125550123" }),
      }),
    );
    expect(enqueueAiJob).toHaveBeenCalledWith("TRANSCRIBE_VOICEMAIL", { voicemailMessageId: "vm1" });
    expect(ari.setMwi).toHaveBeenCalledWith("1001@default", expect.objectContaining({ newMessages: 1 }));
  });

  it("once-guard: a caller-hangup after RecordingFinished doesn't create a second message", async () => {
    await startVoicemailCapture("chan1", ext, "cr1");
    await onRecordingFinished({ name: "vm-cr1", duration: 12 });
    await onVoicemailCallerGone("chan1"); // same capture, already finalized
    expect(db.voicemailMessage.create).toHaveBeenCalledTimes(1);
  });

  it("discards an empty message (< 2s) — no row, no job", async () => {
    await startVoicemailCapture("chan1", ext, "cr1");
    await onRecordingFinished({ name: "vm-cr1", duration: 1 });
    expect(db.voicemailMessage.create).not.toHaveBeenCalled();
    expect(enqueueAiJob).not.toHaveBeenCalled();
    expect(ari.hangup).toHaveBeenCalledWith("chan1");
  });

  it("falls back to the native dialplan when the extension has no mailbox", async () => {
    db.voicemailBox.findUnique.mockResolvedValue(null);
    await startVoicemailCapture("chan1", ext, "cr1");
    expect(ari.record).not.toHaveBeenCalled();
    expect(ari.continueInDialplan).toHaveBeenCalledWith("chan1", "vmdirect", "1001", 1);
  });
});
