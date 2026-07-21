import { STT_PROVIDER, deepgramKey } from "@/lib/env";
import type { SttProvider } from "./sttProvider";
import { mockSttProvider } from "./mockSttProvider";
import { deepgramSttProvider } from "./deepgramSttProvider";

export function resolveStt(): SttProvider {
  if (STT_PROVIDER === "deepgram" && deepgramKey()) return deepgramSttProvider;
  return mockSttProvider;
}
