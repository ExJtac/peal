import "dotenv/config";
import type { AiJob } from "@prisma/client";
import { claimAiJob, completeAiJob, failAiJob } from "@/lib/queue";
import { transcribeVoicemail } from "@/ai/stages/transcribeVoicemail";
import { summarizeCall } from "@/ai/stages/summarizeCall";
import { workerId } from "@/lib/env";

// Async-AI job worker: voicemail/call transcription + Claude summaries. DB-backed claim loop
// (FOR UPDATE SKIP LOCKED). Run EXACTLY ONE.
const WORKER_ID = workerId("ai");
const IDLE_MS = 1500;
let running = true;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
process.on("SIGINT", () => (running = false));
process.on("SIGTERM", () => (running = false));

async function run(job: AiJob): Promise<void> {
  const payload = (job.payload ?? {}) as Record<string, string>;
  if (job.kind === "TRANSCRIBE_VOICEMAIL") await transcribeVoicemail(payload.voicemailMessageId);
  else if (job.kind === "SUMMARIZE_CALL") await summarizeCall(payload.callRecordId);
}

async function main() {
  console.log(`[ai-worker ${WORKER_ID}] polling for jobs…`);
  while (running) {
    let job: AiJob | null = null;
    try {
      job = await claimAiJob(WORKER_ID);
    } catch (e) {
      console.error("[ai-worker] claim error:", e);
      await sleep(IDLE_MS);
      continue;
    }
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    console.log(`[ai-worker] job ${job.id} (${job.kind})`);
    try {
      await run(job);
      await completeAiJob(job.id);
    } catch (e) {
      console.error("[ai-worker] job failed:", e);
      await failAiJob(job.id, (e as Error).message);
    }
  }
  console.log("[ai-worker] stopped.");
  process.exit(0);
}
void main();
