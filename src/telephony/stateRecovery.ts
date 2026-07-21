// On (re)connect, re-adopt in-flight channels so a daemon restart doesn't orphan live calls.
// The durable per-call truth is stashed in Asterisk channel variables (CALLREC_ID), so we can
// rebuild our working set by reading them back. Full re-bridging / IVR-resume is a Phase-1.1
// enhancement; re-registering known channels here means they are cleaned up correctly on hangup.
import { ari } from "./ariClient";
import { getSession, putSession } from "./callSession";
import { agentByCaller, agentByEm } from "./realtime-media/agentRegistry";
import type { CallDirection, DestinationType } from "@prisma/client";

export async function recoverState(): Promise<void> {
  let channels;
  try {
    channels = await ari.listChannels();
  } catch {
    return;
  }
  let readopted = 0;
  for (const ch of channels) {
    if (getSession(ch.id)) continue;
    const recId = await ari.getVar(ch.id, "CALLREC_ID");
    if (recId) {
      putSession({
        channelId: ch.id,
        callRecordId: recId,
        direction: "INBOUND" as CallDirection,
        retries: 0,
        createdAt: Date.now(),
      });
      readopted++;
    }
  }
  if (readopted) console.log(`[ari] re-adopted ${readopted} in-flight channel(s) after reconnect`);
  await recoverAgents(channels).catch((e) => console.error("[ari] agent recovery error:", e));
}

/**
 * The in-memory media session (UDP socket, RTP clock, STT/TTS streams) cannot survive a daemon
 * restart — so never try to resume it. Instead: reclaim leaked externalMedia RTP ports, and drop
 * any stranded AI caller to their fallback so no one sits in a dead, silent bridge.
 */
async function recoverAgents(channels: { id: string; name: string }[]): Promise<void> {
  // 1) Orphaned externalMedia legs (their peer socket died with the old process) → hang up to
  //    free the RTP port. Skip any still owned in memory (a WS blip, not a process restart).
  for (const ch of channels) {
    if (ch.name?.startsWith("UnicastRTP/") && !agentByEm(ch.id)) {
      await ari.hangup(ch.id).catch(() => {});
    }
  }

  // 2) Callers mid-AI-call with no in-memory session → reroute to fallback (never rebuild media).
  for (const ch of channels) {
    if (ch.name?.startsWith("UnicastRTP/") || agentByCaller(ch.id)) continue;
    if ((await ari.getVar(ch.id, "AGENT_ACTIVE")) !== "1") continue;

    await ari.setVar(ch.id, "AGENT_ACTIVE", "0").catch(() => {}); // idempotent across reconnects
    const emId = await ari.getVar(ch.id, "AGENT_EM_CHANNEL");
    const bridgeId = await ari.getVar(ch.id, "AGENT_BRIDGE");
    if (emId) await ari.hangup(emId).catch(() => {});
    if (bridgeId) await ari.destroyBridge(bridgeId).catch(() => {});

    const fbType = (await ari.getVar(ch.id, "AGENT_FALLBACK_TYPE")) as DestinationType | "" | null;
    const fbId = await ari.getVar(ch.id, "AGENT_FALLBACK_ID");
    const recId = (await ari.getVar(ch.id, "CALLREC_ID")) ?? "";
    if (fbType) {
      const { resolveDestination } = await import("./destinations");
      await resolveDestination(fbType, fbId || null, ch.id, recId).catch(() => {});
    } else {
      // No fallback configured / vars unreadable → drop to native voicemail-safe dialplan or hang up.
      await ari.continueInDialplan(ch.id, "vmdirect", "0", 1).catch(() => ari.hangup(ch.id).catch(() => {}));
    }
    console.log(`[ari] rerouted stranded AI caller ${ch.id} to fallback after restart`);
  }
}
