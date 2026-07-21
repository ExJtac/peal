import type { LlmProvider } from "./llmProvider";

export const mockLlmProvider: LlmProvider = {
  name: "mock",
  async summarize(transcript: string, kind: "voicemail" | "call") {
    const first = transcript.replace(/\s+/g, " ").trim().slice(0, 90);
    return {
      summary: `[mock ${kind} summary] ${first}`,
      actionItems: [],
      sentiment: "neutral",
      urgency: "normal",
    };
  },
};
