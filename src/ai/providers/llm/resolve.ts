import { globalAnthropicKey } from "@/lib/env";
import type { LlmProvider } from "./llmProvider";
import { mockLlmProvider } from "./mockLlmProvider";
import { anthropicLlmProvider } from "./anthropicLlmProvider";

export function resolveLlm(): LlmProvider {
  return globalAnthropicKey() ? anthropicLlmProvider : mockLlmProvider;
}
