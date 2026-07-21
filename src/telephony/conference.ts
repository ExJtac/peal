// Meet-me conferencing over ARI. A conference is a persistent named mixing bridge; callers routed
// to (or dialing) its number are added to it. Music-on-hold plays to a lone participant and stops
// once a second joins; the bridge is optionally recorded and is torn down when the last member
// leaves. Same ARI primitives + channel-var recovery as the queue engine — NOT native app_confbridge.
import { ari } from "./ariClient";
import { db } from "@/lib/db";
import type { Conference } from "@prisma/client";

interface ConfRuntime {
  confId: string;
  bridgeId: string;
  mohWhenAlone: boolean;
  members: Set<string>;
  recordingName?: string;
}

const confs = new Map<string, ConfRuntime>(); // by conference id
const byChannel = new Map<string, string>(); // channel id -> conference id (for teardown)

export async function joinConference(callerChannelId: string, conf: Conference, callRecordId: string): Promise<void> {
  await ari.answer(callerChannelId).catch(() => {});

  let rt = confs.get(conf.id);
  if (!rt) {
    const bridge = await ari.createBridge("mixing");
    rt = { confId: conf.id, bridgeId: bridge.id, mohWhenAlone: conf.mohWhenAlone, members: new Set() };
    confs.set(conf.id, rt);
  }

  if (rt.members.size >= conf.maxMembers) {
    await ari.play(callerChannelId, "sound:conf-full").catch(() => {});
    await ari.hangup(callerChannelId).catch(() => {});
    return;
  }

  await ari.addToBridge(rt.bridgeId, callerChannelId).catch(() => {});
  rt.members.add(callerChannelId);
  byChannel.set(callerChannelId, conf.id);
  // Durable state for recoverConferences after a daemon restart.
  await ari.setVar(callerChannelId, "CONF_ID", conf.id).catch(() => {});
  await ari.setVar(callerChannelId, "CONF_BRIDGE", rt.bridgeId).catch(() => {});
  await ari.play(callerChannelId, "sound:conf-onlyperson").catch(() => {}); // brief join cue (best-effort)

  if (rt.members.size === 1) {
    if (rt.mohWhenAlone) await ari.startMoh(rt.bridgeId).catch(() => {});
  } else if (rt.members.size === 2) {
    await ari.stopMoh(rt.bridgeId).catch(() => {});
    if (conf.record && !rt.recordingName) {
      const name = `conf-${conf.id}`;
      await ari.recordBridge(rt.bridgeId, name).catch(() => {});
      rt.recordingName = name;
    }
  }
  void callRecordId; // conference CallRecords are finalized generically by the dispatcher
}

/** A channel left — remove it; destroy the bridge when empty, restore MOH if one person remains. */
export async function onConferenceChannelGone(channelId: string): Promise<void> {
  const confId = byChannel.get(channelId);
  if (!confId) return;
  byChannel.delete(channelId);
  const rt = confs.get(confId);
  if (!rt) return;
  rt.members.delete(channelId);
  if (rt.members.size === 0) {
    await ari.destroyBridge(rt.bridgeId).catch(() => {});
    confs.delete(confId);
  } else if (rt.members.size === 1 && rt.mohWhenAlone) {
    await ari.startMoh(rt.bridgeId).catch(() => {});
  }
}

/** Re-adopt conference members after a daemon restart (the mixing bridge survives Asterisk-side). */
export async function recoverConferences(channels: { id: string; name: string }[]): Promise<void> {
  for (const ch of channels) {
    if (byChannel.has(ch.id)) continue;
    const confId = await ari.getVar(ch.id, "CONF_ID");
    if (!confId) continue;
    const bridgeId = await ari.getVar(ch.id, "CONF_BRIDGE");
    if (!bridgeId) continue;
    const conf = await db.conference.findUnique({ where: { id: confId } }).catch(() => null);
    let rt = confs.get(confId);
    if (!rt) {
      rt = { confId, bridgeId, mohWhenAlone: conf?.mohWhenAlone ?? true, members: new Set() };
      confs.set(confId, rt);
    }
    rt.members.add(ch.id);
    byChannel.set(ch.id, confId);
  }
}

/** Test-only: clear in-memory conference state. */
export function __resetConferencesForTest(): void {
  confs.clear();
  byChannel.clear();
}
