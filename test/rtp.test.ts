import { describe, it, expect } from "vitest";
import {
  parseRtp,
  RtpFramer,
  toFrames,
  frameEnergy,
  BYTES_PER_FRAME,
  SAMPLES_PER_FRAME,
} from "@/telephony/realtime-media/rtp";

describe("parseRtp", () => {
  it("parses a well-formed slin16 packet built by RtpFramer (round-trip)", () => {
    const framer = new RtpFramer(0xdeadbeef, 118, 7, 1000);
    const payload = Buffer.alloc(BYTES_PER_FRAME, 0x11);
    const pkt = framer.frame(payload, true);
    const parsed = parseRtp(pkt)!;
    expect(parsed).not.toBeNull();
    expect(parsed.version).toBe(2);
    expect(parsed.marker).toBe(true);
    expect(parsed.payloadType).toBe(118);
    expect(parsed.seq).toBe(7);
    expect(parsed.timestamp).toBe(1000);
    expect(parsed.ssrc).toBe(0xdeadbeef);
    expect(parsed.payload.equals(payload)).toBe(true);
  });

  it("returns null for a runt packet (< 12 bytes)", () => {
    expect(parseRtp(Buffer.alloc(8))).toBeNull();
  });

  it("honors the CSRC count when locating the payload", () => {
    // version 2, CSRC count = 2 → header is 12 + 8 = 20 bytes.
    const buf = Buffer.alloc(20 + 4);
    buf[0] = 0x82; // v2, cc=2
    buf.writeUInt8(0x03, 12 + 8 - 0); // filler; payload starts at 20
    buf.writeUInt32BE(0xcafe, 20);
    const parsed = parseRtp(buf)!;
    expect(parsed.payload.length).toBe(4);
  });
});

describe("RtpFramer", () => {
  it("increments sequence by 1 and timestamp by SAMPLES_PER_FRAME per frame", () => {
    const framer = new RtpFramer(1, 118, 100, 5000);
    const a = parseRtp(framer.frame(Buffer.alloc(BYTES_PER_FRAME)))!;
    const b = parseRtp(framer.frame(Buffer.alloc(BYTES_PER_FRAME)))!;
    expect(b.seq).toBe(a.seq + 1);
    expect(b.timestamp).toBe(a.timestamp + SAMPLES_PER_FRAME);
  });

  it("wraps the 16-bit sequence number", () => {
    const framer = new RtpFramer(1, 118, 0xffff, 0);
    const first = parseRtp(framer.frame(Buffer.alloc(BYTES_PER_FRAME)))!;
    const second = parseRtp(framer.frame(Buffer.alloc(BYTES_PER_FRAME)))!;
    expect(first.seq).toBe(0xffff);
    expect(second.seq).toBe(0); // wrapped
  });
});

describe("toFrames", () => {
  it("splits an exact multiple into whole frames", () => {
    const frames = toFrames(Buffer.alloc(BYTES_PER_FRAME * 3));
    expect(frames).toHaveLength(3);
    expect(frames.every((f) => f.length === BYTES_PER_FRAME)).toBe(true);
  });

  it("zero-pads a short trailing frame to a full 20 ms frame", () => {
    const frames = toFrames(Buffer.alloc(BYTES_PER_FRAME + 100, 0x7f));
    expect(frames).toHaveLength(2);
    expect(frames[1].length).toBe(BYTES_PER_FRAME);
    // first 100 bytes carried over, remainder is silence (0)
    expect(frames[1][99]).toBe(0x7f);
    expect(frames[1][100]).toBe(0x00);
  });

  it("returns nothing for empty input", () => {
    expect(toFrames(Buffer.alloc(0))).toHaveLength(0);
  });
});

describe("frameEnergy", () => {
  it("is ~0 for silence", () => {
    expect(frameEnergy(Buffer.alloc(BYTES_PER_FRAME))).toBeCloseTo(0, 5);
  });

  it("is high for a full-scale tone and orders below a louder frame", () => {
    const quiet = Buffer.alloc(BYTES_PER_FRAME);
    const loud = Buffer.alloc(BYTES_PER_FRAME);
    for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
      quiet.writeInt16LE(2000, i * 2);
      loud.writeInt16LE(30000, i * 2);
    }
    expect(frameEnergy(loud)).toBeGreaterThan(frameEnergy(quiet));
    expect(frameEnergy(loud)).toBeGreaterThan(0.5);
  });
});
