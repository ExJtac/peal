import "dotenv/config";
import { ari } from "@/telephony/ariClient";
import { resolveLlm } from "@/ai/providers/llm/resolve";
import { resolveStt } from "@/ai/providers/stt/resolve";

// Opt-in live smoke: exercises the real ARI + STT/LLM paths (uses credits/engine). Safe to run
// with no keys — providers fall back to mocks and it still passes.
async function main() {
  console.log("ARI reachable:", await ari.ping());

  const stt = resolveStt();
  const llm = resolveLlm();
  console.log(`STT provider: ${stt.name} | LLM provider: ${llm.name}`);

  const summary = await llm.summarize(
    "Hi, this is Jane from Acme Plumbing, please call me back about the invoice for job 42, it's urgent.",
    "voicemail",
  );
  console.log("Summary:", summary.summary);
  console.log("Urgency:", summary.urgency, "| Sentiment:", summary.sentiment);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
