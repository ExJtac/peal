import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: { voicemailMessage: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/lib/db", () => ({ db }));

import { transcribeVoicemail } from "@/ai/stages/transcribeVoicemail";
import { mockEmailProvider } from "@/ai/providers/email/mockEmailProvider";

const box = (over: Record<string, unknown> = {}) => ({
  id: "box1",
  mailbox: "1001",
  email: "user@example.com",
  attachAudio: true,
  transcribeEnabled: true,
  ...over,
});
const vm = (boxOver: Record<string, unknown> = {}) => ({
  id: "vm1",
  audioPath: "vm-cr1",
  fromNumber: "+15125550123",
  fromName: null,
  durationSec: 12,
  box: box(boxOver),
});

beforeEach(() => vi.clearAllMocks());

describe("transcribeVoicemail", () => {
  it("transcribes, summarizes, and emails the transcript when the box has an email", async () => {
    db.voicemailMessage.findUnique.mockResolvedValue(vm());
    const send = vi.spyOn(mockEmailProvider, "send").mockResolvedValue();

    await transcribeVoicemail("vm1");

    expect(db.voicemailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vm1" },
        data: expect.objectContaining({ aiSummary: expect.any(String), urgency: expect.anything(), transcript: expect.anything() }),
      }),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.to).toBe("user@example.com");
    expect(msg.subject).toContain("New voicemail from +15125550123");
    expect(msg.text).toContain("Transcript:");
    // mock email → no audio attachment fetched
    expect(msg.attachments).toEqual([]);
    send.mockRestore();
  });

  it("skips email when the box has no email address", async () => {
    db.voicemailMessage.findUnique.mockResolvedValue(vm({ email: null }));
    const send = vi.spyOn(mockEmailProvider, "send").mockResolvedValue();
    await transcribeVoicemail("vm1");
    expect(db.voicemailMessage.update).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });

  it("does nothing when transcription is disabled for the box", async () => {
    db.voicemailMessage.findUnique.mockResolvedValue(vm({ transcribeEnabled: false }));
    const send = vi.spyOn(mockEmailProvider, "send").mockResolvedValue();
    await transcribeVoicemail("vm1");
    expect(db.voicemailMessage.update).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    send.mockRestore();
  });
});
