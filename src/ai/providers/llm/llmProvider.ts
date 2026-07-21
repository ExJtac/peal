// LLM summarization seam. Claude is the text-in/text-out brain: it turns a transcript into a
// structured summary + action items + sentiment/urgency. Mock default keeps it offline/free.
export interface CallSummary {
  summary: string;
  actionItems: string[];
  sentiment: "positive" | "neutral" | "negative";
  urgency: "low" | "normal" | "high";
}

export interface LlmProvider {
  name: string;
  summarize(transcript: string, kind: "voicemail" | "call"): Promise<CallSummary>;
}
