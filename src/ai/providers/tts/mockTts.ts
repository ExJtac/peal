// Offline mock TTS. It can't really speak, so it emits a soft, click-free tone whose length is
// proportional to the text — the caller audibly hears "the AI is taking its turn", the RTP
// pacer/barge-in path is exercised for real, and it costs nothing. Deterministic (length is a
// pure function of the text) so the offline tests are stable. Worker-safe.
import type { TtsProvider } from "./ttsProvider";
import { SAMPLE_RATE } from "@/telephony/realtime-media/rtp";

const CHUNK_SAMPLES = 1600; // 100 ms per yielded chunk
const TONE_HZ = 330;
const AMPLITUDE = 2600; // quiet — well below full scale (32767)
const RAMP_SAMPLES = 240; // ~15 ms fade in/out to avoid clicks

function durationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  return Math.min(6000, Math.max(500, words * 260 + 300));
}

export const mockTtsProvider: TtsProvider = {
  name: "mock",
  async *synthesize(text: string, opts: { signal: AbortSignal }): AsyncIterable<Buffer> {
    const total = Math.round((durationMs(text) / 1000) * SAMPLE_RATE);
    let produced = 0;
    while (produced < total) {
      if (opts.signal.aborted) return;
      const n = Math.min(CHUNK_SAMPLES, total - produced);
      const buf = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) {
        const idx = produced + i;
        let a = AMPLITUDE;
        if (idx < RAMP_SAMPLES) a = (AMPLITUDE * idx) / RAMP_SAMPLES; // fade in
        else if (idx > total - RAMP_SAMPLES) a = (AMPLITUDE * (total - idx)) / RAMP_SAMPLES; // fade out
        const s = Math.round(a * Math.sin((2 * Math.PI * TONE_HZ * idx) / SAMPLE_RATE));
        buf.writeInt16LE(s, i * 2);
      }
      produced += n;
      yield buf;
      // let the consumer/pacer run and give abort a chance to land between chunks
      await Promise.resolve();
    }
  },
};
