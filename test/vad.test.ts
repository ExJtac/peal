import { describe, it, expect } from "vitest";
import { Vad } from "@/telephony/realtime-media/vad";
import { BYTES_PER_FRAME, SAMPLES_PER_FRAME } from "@/telephony/realtime-media/rtp";

function tone(amplitude: number): Buffer {
  const b = Buffer.alloc(BYTES_PER_FRAME);
  for (let i = 0; i < SAMPLES_PER_FRAME; i++) b.writeInt16LE(amplitude, i * 2);
  return b;
}
const SILENCE = Buffer.alloc(BYTES_PER_FRAME);
const SPEECH = tone(12000); // well above the 0.02 threshold

function feed(vad: Vad, frame: Buffer, count: number): string[] {
  const events: string[] = [];
  for (let i = 0; i < count; i++) {
    const e = vad.push(frame);
    if (e) events.push(e);
  }
  return events;
}

describe("Vad", () => {
  it("emits 'start' only after the debounce window of consecutive speech", () => {
    const vad = new Vad({ energyThreshold: 0.02, speechStartMs: 120, endpointingMs: 800 });
    // 120ms / 20ms = 6 frames needed. 5 frames → no start yet.
    expect(feed(vad, SPEECH, 5)).toEqual([]);
    expect(vad.push(SPEECH)).toBe("start"); // 6th frame trips it
    expect(vad.isSpeaking).toBe(true);
  });

  it("does not start on a single-frame blip", () => {
    const vad = new Vad({ energyThreshold: 0.02, speechStartMs: 120, endpointingMs: 800 });
    expect(vad.push(SPEECH)).toBeNull();
    expect(vad.push(SILENCE)).toBeNull(); // blip reset
    expect(vad.isSpeaking).toBe(false);
  });

  it("emits 'end' after endpointing silence following speech", () => {
    const vad = new Vad({ energyThreshold: 0.02, speechStartMs: 40, endpointingMs: 200 });
    feed(vad, SPEECH, 10); // start
    expect(vad.isSpeaking).toBe(true);
    // 200ms / 20ms = 10 silent frames to end. 9 → still speaking.
    expect(feed(vad, SILENCE, 9)).toEqual([]);
    expect(vad.push(SILENCE)).toBe("end");
    expect(vad.isSpeaking).toBe(false);
  });

  it("resets the silence counter when speech resumes mid-utterance", () => {
    const vad = new Vad({ energyThreshold: 0.02, speechStartMs: 40, endpointingMs: 200 });
    feed(vad, SPEECH, 10); // start
    feed(vad, SILENCE, 8); // near endpointing but not yet
    expect(vad.push(SPEECH)).toBeNull(); // resumes → counter resets
    expect(feed(vad, SILENCE, 9)).toEqual([]); // 9 < 10 again
    expect(vad.push(SILENCE)).toBe("end");
  });

  it("produces a clean start→end cycle for one utterance", () => {
    const vad = new Vad({ energyThreshold: 0.02, speechStartMs: 40, endpointingMs: 200 });
    const events = [...feed(vad, SPEECH, 15), ...feed(vad, SILENCE, 15)];
    expect(events).toEqual(["start", "end"]);
  });
});
