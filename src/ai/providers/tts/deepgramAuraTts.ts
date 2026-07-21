// Real streaming TTS via Deepgram Aura. Opt-in: REALTIME_TTS_PROVIDER=deepgram + DEEPGRAM_API_KEY.
// Streams raw linear16 @ 16 kHz (exactly our slin16), so no resampling. Worker-safe; never loaded
// without a key (resolve.ts gates it).
import type { TtsProvider } from "./ttsProvider";
import { deepgramKey, DEEPGRAM_TTS_MODEL } from "@/lib/env";

export const deepgramAuraTtsProvider: TtsProvider = {
  name: "deepgram",
  async *synthesize(text: string, opts: { signal: AbortSignal; voice?: string }): AsyncIterable<Buffer> {
    const key = deepgramKey();
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");
    const model = opts.voice || DEEPGRAM_TTS_MODEL;
    const url =
      "https://api.deepgram.com/v1/speak?" +
      new URLSearchParams({ model, encoding: "linear16", sample_rate: "16000", container: "none" }).toString();

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(`Deepgram TTS ${res.status}: ${await res.text().catch(() => "")}`);

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (opts.signal.aborted) return;
      yield Buffer.from(chunk);
    }
  },
};
