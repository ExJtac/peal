import { basename } from "node:path";
import type { SttProvider } from "./sttProvider";

// Deterministic, offline. Default whenever no STT key is configured, so the pipeline (and
// `npm test`) runs with zero cost.
export const mockSttProvider: SttProvider = {
  name: "mock",
  async transcribe(audioPath: string) {
    return {
      text: `[mock transcript for ${basename(audioPath)}] Hi, this is a test message, please call me back.`,
      engine: "mock",
    };
  },
};
