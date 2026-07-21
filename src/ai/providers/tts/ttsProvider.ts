// Text-to-speech seam for the real-time voice agent. `synthesize` streams 16 kHz mono S16LE PCM
// chunks (the same slin16 the RTP pacer injects). It MUST observe the abort signal so barge-in /
// teardown can stop generation mid-utterance (and stop metered billing). Mock-default. Worker-safe.

export interface TtsProvider {
  name: string;
  /**
   * Yield 16 kHz mono signed-linear-16 (little-endian) PCM chunks for `text`. Stop promptly when
   * `signal` aborts. Chunk size is up to the provider; the pacer re-frames to 20 ms.
   */
  synthesize(text: string, opts: { signal: AbortSignal; voice?: string }): AsyncIterable<Buffer>;
}
