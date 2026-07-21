// Call recording + AI-summary orchestration. Records the bridged call when enabled, and
// enqueues a SUMMARIZE_CALL job on hangup so the async AI worker transcribes + summarizes off
// the media path (no latency impact on the call). Worker-safe.
import { db } from "@/lib/db";
import { ari } from "./ariClient";
import { enqueueAiJob } from "@/lib/queue";

let cache: { at: number; on: boolean } | null = null;

/** Global "record calls" setting, cached briefly so it isn't queried on every answer. */
export async function recordingEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < 15_000) return cache.on;
  const cs = await db.companySettings
    .findUnique({ where: { id: "singleton" }, select: { recordCalls: true } })
    .catch(() => null);
  const on = cs?.recordCalls ?? false;
  cache = { at: Date.now(), on };
  return on;
}

/** Start recording the bridge (captures both legs) and store the recording name on the call. */
export async function startBridgeRecording(bridgeId: string, callRecordId: string): Promise<string | null> {
  const name = `rec-${callRecordId}`;
  try {
    await ari.recordBridge(bridgeId, name);
    await db.callRecord.update({ where: { id: callRecordId }, data: { recordingPath: name } }).catch(() => {});
    return name;
  } catch {
    return null; // recording is best-effort; never fail the call over it
  }
}

/** Queue the async transcription + Claude summary for a finished, recorded call. */
export async function enqueueCallSummary(callRecordId: string): Promise<void> {
  await enqueueAiJob("SUMMARIZE_CALL", { callRecordId }).catch(() => {});
}
