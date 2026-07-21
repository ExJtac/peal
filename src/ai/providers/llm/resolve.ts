import { globalAnthropicKey } from "@/lib/env";
import type { LlmProvider } from "./llmProvider";
import { mockLlmProvider } from "./mockLlmProvider";
import { anthropicLlmProvider } from "./anthropicLlmProvider";
import type { RealtimeLlmProvider } from "./realtimeLlmProvider";
import { mockRealtimeLlmProvider } from "./mockRealtimeLlm";

/** Batch LLM for post-call summaries. */
export function resolveLlm(): LlmProvider {
  return globalAnthropicKey() ? anthropicLlmProvider : mockLlmProvider;
}

/**
 * Streaming conversational brain for the real-time voice agent. Mock-default (free/offline); the
 * real Anthropic provider loads lazily only when a key is present.
 */
export function resolveRealtimeLlm(): RealtimeLlmProvider {
  if (globalAnthropicKey()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("./anthropicRealtimeLlm") as typeof import("./anthropicRealtimeLlm")).anthropicRealtimeLlmProvider;
  }
  return mockRealtimeLlmProvider;
}
