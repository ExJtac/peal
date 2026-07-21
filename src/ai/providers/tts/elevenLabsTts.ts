// Real streaming TTS via ElevenLabs. Opt-in: REALTIME_TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY.
// `output_format=pcm_16000` streams raw S16LE @ 16 kHz (our slin16). Worker-safe; gated by resolve.ts.
import type { TtsProvider } from "./ttsProvider";
import { elevenLabsKey, ELEVENLABS_VOICE_ID } from "@/lib/env";

export const elevenLabsTtsProvider: TtsProvider = {
  name: "elevenlabs",
  async *synthesize(text: string, opts: { signal: AbortSignal; voice?: string }): AsyncIterable<Buffer> {
    const key = elevenLabsKey();
    if (!key) throw new Error("ELEVENLABS_API_KEY not set");
    const voice = opts.voice || ELEVENLABS_VOICE_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=pcm_16000`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5" }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) throw new Error(`ElevenLabs TTS ${res.status}: ${await res.text().catch(() => "")}`);

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (opts.signal.aborted) return;
      yield Buffer.from(chunk);
    }
  },
};
