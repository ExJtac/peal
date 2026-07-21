// Real conversational brain via Claude (streaming + tool use). Opt-in: ANTHROPIC_API_KEY set.
// Default model Haiku 4.5 (fast + cheap — right for a latency-critical phone receptionist; the
// house default, per CLAUDE.md). No `thinking` (lowest latency). Streams text so the orchestrator
// can start TTS on the first sentence while Claude writes the next; emits at most one action per
// turn (`disable_parallel_tool_use`). The AbortSignal is wired to the stream so barge-in/teardown
// stops generation (and billing) immediately. Worker-safe; never loaded without a key.
import Anthropic from "@anthropic-ai/sdk";
import { globalAnthropicKey } from "@/lib/env";
import type {
  AgentToolName,
  BrainEvent,
  BrainTurn,
  RealtimeLlmProvider,
  RealtimeRespondOpts,
} from "./realtimeLlmProvider";

const MAX_TOKENS = 400; // spoken replies are short

function splitCompleteSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  const re = /[^.!?]*[.!?]+(?:\s+|$)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(buffer)) !== null) {
    const s = m[0].trim();
    if (s) sentences.push(s);
    lastIndex = re.lastIndex;
  }
  return { sentences, rest: buffer.slice(lastIndex) };
}

export const anthropicRealtimeLlmProvider: RealtimeLlmProvider = {
  name: "anthropic",
  async *respond(transcript: string, history: BrainTurn[], opts: RealtimeRespondOpts): AsyncIterable<BrainEvent> {
    const key = globalAnthropicKey();
    if (!key) throw new Error("ANTHROPIC_API_KEY not set");
    const client = new Anthropic({ apiKey: key });

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
      { role: "user", content: transcript },
    ];

    const stream = client.messages.stream(
      {
        model: opts.model,
        max_tokens: MAX_TOKENS,
        system: opts.systemPrompt,
        messages,
        tools: opts.tools as unknown as Anthropic.Tool[],
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
      },
      { signal: opts.signal },
    );

    let textBuffer = "";
    let toolName: AgentToolName | null = null;
    let toolJson = "";

    try {
      for await (const event of stream) {
        if (opts.signal.aborted) return;
        if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          toolName = event.content_block.name as AgentToolName;
          toolJson = "";
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            textBuffer += event.delta.text;
            const { sentences, rest } = splitCompleteSentences(textBuffer);
            for (const s of sentences) yield { kind: "say", sentence: s };
            textBuffer = rest;
          } else if (event.delta.type === "input_json_delta") {
            toolJson += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && toolName) {
          let input: Record<string, unknown> = {};
          try {
            input = toolJson ? JSON.parse(toolJson) : {};
          } catch {
            input = {};
          }
          yield { kind: "action", tool: toolName, input };
          toolName = null;
        }
      }
      // flush any trailing partial sentence as a final chunk
      const tail = textBuffer.trim();
      if (tail && !opts.signal.aborted) yield { kind: "say", sentence: tail };
    } catch (err) {
      if (opts.signal.aborted) return; // abort is expected on barge-in/teardown
      throw err;
    }
  },
};
