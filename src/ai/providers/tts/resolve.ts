// TTS resolver for the real-time agent. Mock-default (free); real providers load lazily only
// when selected + keyed, so their network code never bundles without a key. Worker-safe.
import { REALTIME_TTS_PROVIDER, deepgramKey, elevenLabsKey } from "@/lib/env";
import type { TtsProvider } from "./ttsProvider";
import { mockTtsProvider } from "./mockTts";

export function resolveTts(): TtsProvider {
  if (REALTIME_TTS_PROVIDER === "deepgram" && deepgramKey()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./deepgramAuraTts") as typeof import("./deepgramAuraTts")).deepgramAuraTtsProvider;
  }
  if (REALTIME_TTS_PROVIDER === "elevenlabs" && elevenLabsKey()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./elevenLabsTts") as typeof import("./elevenLabsTts")).elevenLabsTtsProvider;
  }
  return mockTtsProvider;
}
