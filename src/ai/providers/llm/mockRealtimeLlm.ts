// Offline rule-based brain. Keyword-routes the caller transcript to a canned reply + at most one
// action, covering every branch (answer / transfer / take message / end). Deterministic and free;
// it makes the whole voice pipeline demoable and drives the state-machine tests. Pairs with
// MOCK_SCRIPT in mockStreamingStt. Worker-safe.
import type { BrainEvent, BrainTurn, RealtimeLlmProvider, RealtimeRespondOpts } from "./realtimeLlmProvider";

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

export const mockRealtimeLlmProvider: RealtimeLlmProvider = {
  name: "mock",
  async *respond(transcript: string, _history: BrainTurn[], opts: RealtimeRespondOpts): AsyncIterable<BrainEvent> {
    const t = transcript.toLowerCase();
    const yieldSay = async function* (text: string): AsyncIterable<BrainEvent> {
      for (const sentence of splitSentences(text)) {
        if (opts.signal.aborted) return;
        yield { kind: "say", sentence };
        await Promise.resolve();
      }
    };

    if (has(t, "goodbye", "bye", "that's all", "nothing else", "no thanks", "hang up")) {
      yield* yieldSay("Thanks for calling. Goodbye!");
      if (!opts.signal.aborted) yield { kind: "action", tool: "end_call", input: {} };
      return;
    }
    if (has(t, "person", "someone", "human", "representative", "agent", "speak to", "talk to")) {
      yield* yieldSay("Sure — connecting you to someone now.");
      if (!opts.signal.aborted) yield { kind: "action", tool: "transfer_to_human", input: { reason: "caller requested a person" } };
      return;
    }
    if (has(t, "message", "leave a", "take a message", "call me back", "voicemail")) {
      yield* yieldSay("I can take a message. Please say your name, number, and reason after the tone.");
      if (!opts.signal.aborted) yield { kind: "action", tool: "take_message", input: {} };
      return;
    }
    if (has(t, "hours", "open", "close", "when are you")) {
      yield* yieldSay("We're open Monday through Friday, nine to five. Is there anything else I can help with?");
      if (!opts.signal.aborted) yield { kind: "action", tool: "answer_question", input: {} };
      return;
    }
    if (has(t, "plumb", "hvac", "heating", "cooling", "service", "do you")) {
      yield* yieldSay("Yes, we handle both plumbing and HVAC. Would you like to book a visit or speak to someone?");
      if (!opts.signal.aborted) yield { kind: "action", tool: "answer_question", input: {} };
      return;
    }
    // default: acknowledge and keep the conversation open
    yield* yieldSay("Thanks. Could you tell me a bit more about what you need?");
    if (!opts.signal.aborted) yield { kind: "action", tool: "answer_question", input: {} };
  },
};
