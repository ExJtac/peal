import { STT_PROVIDER, REALTIME_STT_PROVIDER, deepgramKey } from "@/lib/env";
import type { SttProvider } from "./sttProvider";
import { mockSttProvider } from "./mockSttProvider";
import { deepgramSttProvider } from "./deepgramSttProvider";
import type { StreamingSttProvider } from "./streamingSttProvider";
import { mockStreamingSttProvider } from "./mockStreamingStt";

/** Batch STT for post-call summaries (transcribe a finished recording). */
export function resolveStt(): SttProvider {
  if (STT_PROVIDER === "deepgram" && deepgramKey()) return deepgramSttProvider;
  return mockSttProvider;
}

/**
 * Streaming STT for the real-time voice agent. Mock-default (free/offline). The real Deepgram
 * live provider is imported lazily so its `ws` connection code never loads without a key.
 */
export function resolveStreamingStt(): StreamingSttProvider {
  if (REALTIME_STT_PROVIDER === "deepgram" && deepgramKey()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./deepgramStreamingStt") as typeof import("./deepgramStreamingStt")).deepgramStreamingSttProvider;
  }
  return mockStreamingSttProvider;
}
