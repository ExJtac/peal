// Dialing primitive: bridge a caller to one or more endpoints, first-answer-wins. This is the
// ARI equivalent of Dial() — used for internal calls, ring groups, and outbound-to-trunk.
//
// Flow: answer caller → create a mixing bridge → add caller → originate each endpoint into our
// Stasis app. When a dialed leg answers it re-enters Stasis (args "dialed") and the dispatcher
// calls onDialedAnswered → we add it to the bridge and hang up the losing legs. If every leg
// fails/times out we invoke onNoAnswer (usually voicemail).
import { ari } from "./ariClient";
import { putPendingDial, takePendingDial, getSession, updateSession } from "./callSession";
import { markAnswered } from "./callRecord";
import { recordingEnabled, startBridgeRecording } from "./recording";

interface DialGroup {
  callerChannelId: string;
  bridgeId: string;
  outstanding: Set<string>;
  answered: boolean;
  timer?: ReturnType<typeof setTimeout>;
  onNoAnswer?: () => Promise<void>;
}

const groups = new Map<string, DialGroup>();

export interface DialTarget {
  endpoint: string;
}

export async function dialEndpoints(
  callerChannelId: string,
  targets: DialTarget[],
  opts: { callerId?: string; ringSeconds: number; onNoAnswer?: () => Promise<void> },
): Promise<void> {
  await ari.answer(callerChannelId).catch(() => {});
  const bridge = await ari.createBridge("mixing");
  await ari.addToBridge(bridge.id, callerChannelId).catch(() => {});

  const group: DialGroup = {
    callerChannelId,
    bridgeId: bridge.id,
    outstanding: new Set(),
    answered: false,
    onNoAnswer: opts.onNoAnswer,
  };
  groups.set(callerChannelId, group);

  for (const t of targets) {
    try {
      const ch = await ari.originate({
        endpoint: t.endpoint,
        callerId: opts.callerId,
        timeout: opts.ringSeconds,
        appArgs: `dialed,${callerChannelId}`,
      });
      group.outstanding.add(ch.id);
      putPendingDial(ch.id, { callerChannelId, bridgeId: bridge.id });
    } catch {
      // endpoint offline / unreachable — skip
    }
  }

  if (group.outstanding.size === 0) {
    await failGroup(callerChannelId);
    return;
  }
  group.timer = setTimeout(() => {
    if (!group.answered) void failGroup(callerChannelId);
  }, (opts.ringSeconds + 2) * 1000);
}

/** A dialed leg answered and re-entered Stasis (args "dialed"). */
export async function onDialedAnswered(dialedChannelId: string): Promise<void> {
  const pd = takePendingDial(dialedChannelId);
  if (!pd) {
    await ari.hangup(dialedChannelId).catch(() => {});
    return;
  }
  const group = groups.get(pd.callerChannelId);
  if (!group || group.answered) {
    await ari.hangup(dialedChannelId).catch(() => {}); // lost the first-answer race
    return;
  }
  group.answered = true;
  if (group.timer) clearTimeout(group.timer);
  await ari.addToBridge(group.bridgeId, dialedChannelId).catch(() => {});

  const s = getSession(pd.callerChannelId);
  if (s) {
    await markAnswered(s.callRecordId);
    if (await recordingEnabled()) {
      const name = await startBridgeRecording(group.bridgeId, s.callRecordId);
      if (name) updateSession(s.channelId, { recordingName: name });
    }
  }

  for (const other of group.outstanding) {
    if (other !== dialedChannelId) ari.hangup(other).catch(() => {});
  }
  group.outstanding.clear();
  group.outstanding.add(dialedChannelId);
}

/** A dialed leg was destroyed (busy/no-answer/rejected). */
export async function onDialedEnded(dialedChannelId: string): Promise<void> {
  takePendingDial(dialedChannelId);
  for (const [caller, group] of groups) {
    if (!group.outstanding.has(dialedChannelId)) continue;
    group.outstanding.delete(dialedChannelId);
    if (group.answered) {
      // The connected party hung up → end the caller + tear down the bridge.
      groups.delete(caller);
      if (group.timer) clearTimeout(group.timer);
      await ari.hangup(caller).catch(() => {});
      await ari.destroyBridge(group.bridgeId).catch(() => {});
    } else if (group.outstanding.size === 0) {
      await failGroup(caller);
    }
    return;
  }
}

async function failGroup(callerChannelId: string): Promise<void> {
  const group = groups.get(callerChannelId);
  if (!group) return;
  groups.delete(callerChannelId);
  if (group.timer) clearTimeout(group.timer);
  if (group.onNoAnswer) await group.onNoAnswer().catch(() => {});
  else await ari.hangup(callerChannelId).catch(() => {});
}

/** The caller hung up — tear down the group + any ringing legs. */
export async function onCallerEnded(callerChannelId: string): Promise<void> {
  const group = groups.get(callerChannelId);
  if (!group) return;
  groups.delete(callerChannelId);
  if (group.timer) clearTimeout(group.timer);
  for (const other of group.outstanding) ari.hangup(other).catch(() => {});
  ari.destroyBridge(group.bridgeId).catch(() => {});
}
