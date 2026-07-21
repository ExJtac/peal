// Real-time conversational-brain seam. Distinct from the batch `LlmProvider` (post-call
// summary): here Claude runs a live turn — it reads the latest caller utterance + history and
// STREAMS its reply as sentence chunks (so TTS can start on sentence 1 while it writes sentence 2)
// plus at most one ACTION (transfer / take a message / answer / end the call). Mock-default so the
// pipeline runs free/offline. Worker-safe.

export type AgentToolName = "transfer_to_human" | "take_message" | "answer_question" | "end_call";

/** Generic tool schema (maps 1:1 to an Anthropic tool; kept provider-agnostic here). */
export interface ToolDef {
  name: AgentToolName;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export type BrainEvent =
  | { kind: "say"; sentence: string } // a spoken sentence chunk of the reply
  | { kind: "action"; tool: AgentToolName; input: Record<string, unknown> };

export interface BrainTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RealtimeRespondOpts {
  signal: AbortSignal;
  systemPrompt: string;
  tools: ToolDef[];
  model: string;
}

export interface RealtimeLlmProvider {
  name: string;
  /** Yield sentence + action events for one turn. Must observe opts.signal (barge-in/teardown). */
  respond(transcript: string, history: BrainTurn[], opts: RealtimeRespondOpts): AsyncIterable<BrainEvent>;
}
