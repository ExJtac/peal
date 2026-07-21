import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RtpPacer } from "@/telephony/realtime-media/rtpPacer";
import { parseRtp, BYTES_PER_FRAME, SAMPLES_PER_FRAME } from "@/telephony/realtime-media/rtp";

function speechFrame(v = 5000): Buffer {
  const b = Buffer.alloc(BYTES_PER_FRAME);
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) b.writeInt16LE(v, i * 2);
  return b;
}
const isSilent = (payload: Buffer) => payload.every((byte) => byte === 0);

describe("RtpPacer", () => {
  let sent: Buffer[];
  let transport: { send: (b: Buffer) => void; payloadType: number };
  let pacer: RtpPacer;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    sent = [];
    transport = { send: (b) => sent.push(b), payloadType: 118 };
    pacer = new RtpPacer(transport, 0x1234);
  });
  afterEach(() => vi.useRealTimers());

  it("sends real frames then comfort silence, monotonic seq/ts, and fires onDrained once", async () => {
    let drained = 0;
    pacer.onDrained(() => drained++);
    pacer.start();
    pacer.enqueue(Buffer.concat([speechFrame(), speechFrame(), speechFrame()])); // 3 frames → primes
    pacer.finish();

    await vi.advanceTimersByTimeAsync(200); // ~10 ticks

    expect(sent.length).toBeGreaterThanOrEqual(5);
    const pkts = sent.map((b) => parseRtp(b)!);
    // seq +1 and ts +320 across every packet (real or silence)
    for (let i = 1; i < pkts.length; i++) {
      expect(pkts[i].seq).toBe((pkts[i - 1].seq + 1) & 0xffff);
      expect(pkts[i].timestamp).toBe((pkts[i - 1].timestamp + SAMPLES_PER_FRAME) >>> 0);
    }
    // exactly 3 real (non-silent) frames were sent, the first carrying the marker bit
    const real = pkts.filter((p) => !isSilent(p.payload));
    expect(real).toHaveLength(3);
    expect(real[0].marker).toBe(true);
    // and the rest are comfort silence
    expect(pkts.some((p) => isSilent(p.payload))).toBe(true);
    expect(drained).toBe(1);
    expect(transport.payloadType).toBe(118);
    expect(pkts[0].payloadType).toBe(118);
  });

  it("keeps the clock alive on underrun (comfort silence), never stalling", async () => {
    pacer.start();
    await vi.advanceTimersByTimeAsync(100); // nothing queued the whole time
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent.every((b) => isSilent(parseRtp(b)!.payload))).toBe(true);
  });

  it("flush() drops the queued utterance but the clock keeps running", async () => {
    pacer.start();
    pacer.enqueue(Buffer.concat([speechFrame(), speechFrame(), speechFrame(), speechFrame()]));
    pacer.flush();
    expect(pacer.queued).toBe(0);
    await vi.advanceTimersByTimeAsync(60);
    expect(sent.every((b) => isSilent(parseRtp(b)!.payload))).toBe(true); // only silence
  });

  it("stop() halts the clock and clears all timers (idempotent)", async () => {
    pacer.start();
    pacer.enqueue(speechFrame());
    await vi.advanceTimersByTimeAsync(40);
    const before = sent.length;
    pacer.stop();
    pacer.stop(); // idempotent
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(sent.length).toBe(before); // nothing sent after stop
  });

  it("enqueue after stop is ignored", () => {
    pacer.start();
    pacer.stop();
    pacer.enqueue(speechFrame());
    expect(pacer.queued).toBe(0);
  });
});
