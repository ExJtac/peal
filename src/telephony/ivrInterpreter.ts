// Interprets an IVR flow directly from the DB model (IvrFlow/IvrNode/IvrOption) as a state
// machine over ARI — play prompt, collect a DTMF digit, branch. NO generated dialplan. DTMF
// arrives via the dispatcher (feedDtmf); the current node is mirrored to a channel variable so
// a mid-IVR daemon reconnect can resume.
import { ari } from "./ariClient";
import { db } from "@/lib/db";
import { updateSession } from "./callSession";

type DtmfResolver = (digit: string) => void;
const dtmfWaiters = new Map<string, DtmfResolver>();

/** Called by the dispatcher on ChannelDtmfReceived. */
export function feedDtmf(channelId: string, digit: string): void {
  const w = dtmfWaiters.get(channelId);
  if (w) w(digit);
}

/** Clean up any pending DTMF waiter when a channel goes away. */
export function endIvr(channelId: string): void {
  dtmfWaiters.delete(channelId);
}

function waitForDigit(channelId: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      dtmfWaiters.delete(channelId);
      resolve(null);
    }, timeoutMs);
    dtmfWaiters.set(channelId, (digit) => {
      clearTimeout(timer);
      dtmfWaiters.delete(channelId);
      resolve(digit);
    });
  });
}

export async function runIvrFlow(channelId: string, flowId: string, callRecordId: string): Promise<void> {
  await ari.answer(channelId).catch(() => {});
  const flow = await db.ivrFlow.findUnique({
    where: { id: flowId },
    include: { nodes: { include: { options: true } } },
  });
  if (!flow || flow.nodes.length === 0) {
    await ari.hangup(channelId).catch(() => {});
    return;
  }

  type IvrNodeWithOptions = (typeof flow.nodes)[number];
  const byId = new Map<string, IvrNodeWithOptions>(flow.nodes.map((n) => [n.id, n]));
  let current: IvrNodeWithOptions | undefined =
    (flow.entryNodeId ? byId.get(flow.entryNodeId) : undefined) ?? flow.nodes[0];
  let retries = 0;
  const timeoutMs = (flow.timeoutSeconds || 5) * 1000;

  const toDestination = async (type: (typeof flow.nodes)[number]["destinationType"], id: string | null) => {
    const { resolveDestination } = await import("./destinations");
    await resolveDestination(type!, id, channelId, callRecordId);
  };

  while (current) {
    updateSession(channelId, { ivrFlowId: flowId, ivrNodeId: current.id });
    await ari.setVar(channelId, "IVR_NODE", current.id).catch(() => {});
    if (current.promptPath) await ari.play(channelId, `sound:${current.promptPath}`).catch(() => {});

    if (current.type === "HANGUP") {
      await ari.hangup(channelId).catch(() => {});
      return;
    }
    if (current.type === "TRANSFER" && current.destinationType) {
      await toDestination(current.destinationType, current.destinationId);
      return;
    }
    if (current.type === "PLAY") {
      const next: IvrNodeWithOptions | undefined = current.timeoutNodeId ? byId.get(current.timeoutNodeId) : undefined;
      current = next;
      continue;
    }

    // MENU / COLLECT / DIRECTORY / VOICEMAIL — wait for a digit
    const digit = await waitForDigit(channelId, timeoutMs);
    if (digit == null) {
      retries++;
      if (retries > (flow.maxRetries || 3)) {
        if (flow.invalidType) return toDestination(flow.invalidType, flow.invalidId);
        await ari.hangup(channelId).catch(() => {});
        return;
      }
      continue; // replay current node
    }

    const opt = current.options.find((o) => o.digit === digit);
    if (!opt) {
      retries++;
      if (retries > (flow.maxRetries || 3)) {
        if (flow.invalidType) return toDestination(flow.invalidType, flow.invalidId);
        await ari.hangup(channelId).catch(() => {});
        return;
      }
      continue;
    }
    retries = 0;
    if (opt.destinationType) return toDestination(opt.destinationType, opt.destinationId);
    current = opt.nextNodeId ? byId.get(opt.nextNodeId) : undefined;
  }
  await ari.hangup(channelId).catch(() => {});
}
