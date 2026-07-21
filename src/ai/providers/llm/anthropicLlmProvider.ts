import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, CallSummary } from "./llmProvider";
import { globalAnthropicKey, CLAUDE_SUMMARY_MODEL } from "@/lib/env";
import { voicemailSummaryPrompt, callSummaryPrompt } from "../../prompts/callSummary";

// Claude summarization (default Haiku 4.5 — fast + cheap for this async task). Asks for strict
// JSON and parses it defensively.
const SYSTEM =
  "You summarize business phone calls/voicemails. Respond with ONLY minified JSON matching " +
  '{"summary":string,"actionItems":string[],"sentiment":"positive"|"neutral"|"negative","urgency":"low"|"normal"|"high"}. No prose.';

export const anthropicLlmProvider: LlmProvider = {
  name: "anthropic",
  async summarize(transcript: string, kind: "voicemail" | "call"): Promise<CallSummary> {
    const key = globalAnthropicKey();
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    const client = new Anthropic({ apiKey: key });
    const prompt = kind === "voicemail" ? voicemailSummaryPrompt(transcript) : callSummaryPrompt(transcript);

    const msg = await client.messages.create({
      model: CLAUDE_SUMMARY_MODEL,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : {};
    return {
      summary: typeof json.summary === "string" ? json.summary : "",
      actionItems: Array.isArray(json.actionItems) ? json.actionItems.map(String) : [],
      sentiment: ["positive", "neutral", "negative"].includes(json.sentiment) ? json.sentiment : "neutral",
      urgency: ["low", "normal", "high"].includes(json.urgency) ? json.urgency : "normal",
    };
  },
};
