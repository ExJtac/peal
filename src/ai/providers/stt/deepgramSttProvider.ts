import { readFile } from "node:fs/promises";
import type { SttProvider } from "./sttProvider";
import { deepgramKey } from "@/lib/env";

// Deepgram prerecorded transcription (nova). Used when STT_PROVIDER=deepgram and a key is set.
export const deepgramSttProvider: SttProvider = {
  name: "deepgram",
  async transcribe(audioPath: string) {
    const key = deepgramKey();
    if (!key) throw new Error("DEEPGRAM_API_KEY not set");
    const audio = await readFile(audioPath);
    const res = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "audio/wav" },
      body: audio,
    });
    if (!res.ok) throw new Error(`Deepgram ${res.status}: ${await res.text().catch(() => "")}`);
    const j = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    const text = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
    return { text, engine: "deepgram" };
  },
};
