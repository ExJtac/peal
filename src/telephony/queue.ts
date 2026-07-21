// Call queue / ACD engine over ARI. Unlike originate.ts (fire-and-forget: ring all, first wins,
// done), a queue holds a persistent WAITING LIST of callers on music-on-hold and re-dials agents
// as they free up, by strategy. It re-implements ACD in our Node/ARI code — the same choice made
// for IVR (ivrInterpreter.ts), voicemail (voicemail.ts), and ring groups (destinations.dialRingGroup) —
// over the trivial Stasis dialplan, NOT via native app_queue.
//
// Durability: the caller's MOH is generated inside Asterisk, so a held caller keeps hearing music
// even while THIS daemon is restarting; only announcements + agent-dialing pause. The per-call
// truth is mirrored to channel vars (QUEUE_*) so recoverQueues() (stateRecovery.ts) can re-adopt
// held callers after a restart. This module's maps are just the hot in-memory working set.
//
// Collision-avoidance: the queue keeps its OWN pendingAgentDials + playback-waiter maps (not
// callSession.pendingDials, not voicemail's), so originate.ts / voicemail.ts handlers never touch
// queue channels and vice-versa. Every dispatcher handler here is idempotent + scoped to its maps.
import { ari } from "./ariClient";
import { db } from "@/lib/db";
import { markAnswered } from "./callRecord";
import { recordingEnabled, startBridgeRecording } from "./recording";
import { getSession, updateSession } from "./callSession";
import type { Queue, QueueMember, Extension } from "@prisma/client";

type QueueWithMembers = Queue & { members: (QueueMember & { extension: Extension | null })[] };

// AgentRuntime.status tracks CALL state; `eligible` (loggedIn && !paused && enabled && !dnd) comes
// from the DB each service pass. An agent is dialable iff status==="AVAILABLE" && eligible.
type AgentStatus = "AVAILABLE" | "RINGING" | "ON_CALL" | "WRAPUP";

interface AgentRuntime {
  extNumber: string;
  extensionId: string;
  penalty: number;
  order: number;
  eligible: boolean;
  status: AgentStatus;
  ringingFor?: string; // callerChannelId this agent is currently ringing for
  ringingChannelId?: string; // the originated agent channel id
  ringTimer?: ReturnType<typeof setTimeout>;
  wrapTimer?: ReturnType<typeof setTimeout>;
  lastCallEndedAt: number;
  callsToday: number;
}

interface WaitingCaller {
  callerChannelId: string;
  callRecordId: string;
  callLogId: string;
  holdBridgeId: string;
  joinedAt: number;
  joinPosition: number; // how many were ahead at join time (for the log)
  callerNumber?: string;
  ringingAgents: Set<string>; // agent extNumbers currently ringing for this caller
  triedAgents: Set<string>; // agents already rung this rotation (single-agent strategies) — avoids
  // re-ringing the same non-answering agent; cleared once every dialable agent has been tried
  announceTimer?: ReturnType<typeof setTimeout>;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

interface QueueRuntime {
  queueId: string;
  cfg: Queue;
  waiting: WaitingCaller[];
  agents: Map<string, AgentRuntime>; // by extNumber
  servicing: boolean;
  dirty: boolean; // a service was requested while one was in-flight → re-run
}

interface ActiveCall {
  queueId: string;
  callerChannelId: string;
  agentChannelId: string;
  agentExtNumber: string;
  bridgeId: string;
  callLogId: string;
  answeredAt: number;
}

const runtimes = new Map<string, QueueRuntime>();
const pendingAgentDials = new Map<string, { queueId: string; extNumber: string; callerChannelId: string }>();
const activeCalls = new Map<string, ActiveCall>(); // by callerChannelId
const playWaiters = new Map<string, () => void>(); // playbackId -> resolver (queue's own)

// --- playback (announcements): play on the caller channel + wait for PlaybackFinished ------------

async function playAndWait(channelId: string, media: string, timeoutMs = 8_000): Promise<void> {
  let pb: { id: string } | null = null;
  try {
    pb = await ari.play(channelId, media);
  } catch {
    return;
  }
  if (!pb?.id) return;
  const id = pb.id;
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      playWaiters.delete(id);
      resolve();
    }, timeoutMs);
    playWaiters.set(id, () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Called by the dispatcher on PlaybackFinished (alongside voicemail's — playback ids are unique). */
export function onQueuePlaybackFinished(playbackId: string): void {
  const w = playWaiters.get(playbackId);
  if (w) {
    playWaiters.delete(playbackId);
    w();
  }
}

// --- entry point ---------------------------------------------------------------------------------

/** A call routed to a QUEUE destination. Puts the caller on hold + starts serving agents. */
export async function dialQueue(callerChannelId: string, queue: QueueWithMembers, callRecordId: string): Promise<void> {
  const rt = getOrCreateRuntime(queue);

  const anyEligible = [...rt.agents.values()].some((a) => a.eligible);
  if (!anyEligible && !queue.joinEmpty) {
    return failoverCaller(callerChannelId, callRecordId, queue.failoverType, queue.failoverId);
  }

  await ari.answer(callerChannelId).catch(() => {});
  const bridge = await ari.createBridge("mixing");
  await ari.addToBridge(bridge.id, callerChannelId).catch(() => {});
  await ari.startMoh(bridge.id, queue.mohClass || undefined).catch(() => {});

  // Durable state for recoverQueues() (CALLREC_ID is already set upstream by routeInbound).
  const joinedAt = Date.now();
  await ari.setVar(callerChannelId, "QUEUE_ACTIVE", "1").catch(() => {});
  await ari.setVar(callerChannelId, "QUEUE_ID", queue.id).catch(() => {});
  await ari.setVar(callerChannelId, "QUEUE_BRIDGE", bridge.id).catch(() => {});
  await ari.setVar(callerChannelId, "QUEUE_JOINED_AT", String(joinedAt)).catch(() => {});
  updateSession(callerChannelId, { bridgeId: bridge.id });

  const ch = await ari.getChannel(callerChannelId).catch(() => null);
  const callerNumber = ch?.caller?.number || undefined;

  const log = await db.queueCallLog
    .create({ data: { queueId: queue.id, callRecordId, callerNumber } })
    .catch(() => null);

  const caller: WaitingCaller = {
    callerChannelId,
    callRecordId,
    callLogId: log?.id ?? "",
    holdBridgeId: bridge.id,
    joinedAt,
    joinPosition: rt.waiting.length + 1,
    callerNumber,
    ringingAgents: new Set(),
    triedAgents: new Set(),
  };
  rt.waiting.push(caller);
  armAnnounce(rt, caller);
  armTimeout(rt, caller);
  void serviceQueue(queue.id);

  // Fast-hangup race: if the caller vanished during setup (their ChannelDestroyed fired before they
  // were in the waiting list), close out the just-created log + bridge now instead of orphaning them.
  const alive = await ari.getChannel(callerChannelId).catch(() => null);
  if (!alive) await onQueueCallerEnded(callerChannelId);
}

// --- agent answered (routing.ts "queued" branch) -------------------------------------------------

export async function onAgentAnswered(agentChannelId: string): Promise<void> {
  const pd = pendingAgentDials.get(agentChannelId);
  pendingAgentDials.delete(agentChannelId);
  if (!pd) return void ari.hangup(agentChannelId).catch(() => {}); // orphan / post-restart

  const rt = runtimes.get(pd.queueId);
  const agent = rt?.agents.get(pd.extNumber);
  const caller = rt?.waiting.find((c) => c.callerChannelId === pd.callerChannelId);
  if (!rt || !agent || !caller) {
    // Caller already left (abandoned/timeout) or state gone → drop this leg, free the agent, re-serve.
    if (agent) freeAgent(agent);
    if (rt) void serviceQueue(rt.queueId);
    return void ari.hangup(agentChannelId).catch(() => {});
  }

  // This agent wins the caller. Cancel the other legs ringing for the same caller (RINGALL).
  if (agent.ringTimer) clearTimeout(agent.ringTimer);
  for (const otherNum of caller.ringingAgents) {
    if (otherNum === agent.extNumber) continue;
    const oa = rt.agents.get(otherNum);
    if (oa?.ringingChannelId) {
      pendingAgentDials.delete(oa.ringingChannelId);
      void ari.hangup(oa.ringingChannelId).catch(() => {});
    }
    if (oa) freeAgent(oa);
  }
  caller.ringingAgents.clear();

  // Connect: stop hold audio, bridge the agent in with the (already-bridged) caller.
  clearCallerTimers(caller);
  await ari.stopMoh(caller.holdBridgeId).catch(() => {});
  await ari.addToBridge(caller.holdBridgeId, agentChannelId).catch(() => {});
  // No longer waiting → recoverQueues must not re-adopt this (now connected) caller after a restart.
  await ari.setVar(caller.callerChannelId, "QUEUE_ACTIVE", "0").catch(() => {});

  const answeredAt = Date.now();
  const waitSec = Math.round((answeredAt - caller.joinedAt) / 1000);
  await markAnswered(caller.callRecordId);
  const s = getSession(caller.callerChannelId);
  if (s && (await recordingEnabled())) {
    const name = await startBridgeRecording(caller.holdBridgeId, caller.callRecordId);
    if (name) updateSession(s.channelId, { recordingName: name });
  }
  if (caller.callLogId) {
    await db.queueCallLog
      .update({
        where: { id: caller.callLogId },
        data: { answeredAt: new Date(answeredAt), waitSec, agentExtensionId: agent.extensionId, position: caller.joinPosition, outcome: "ANSWERED" },
      })
      .catch(() => {});
  }

  agent.status = "ON_CALL";
  agent.ringingFor = undefined;
  agent.ringingChannelId = undefined;
  agent.callsToday += 1;
  activeCalls.set(caller.callerChannelId, {
    queueId: rt.queueId,
    callerChannelId: caller.callerChannelId,
    agentChannelId,
    agentExtNumber: agent.extNumber,
    bridgeId: caller.holdBridgeId,
    callLogId: caller.callLogId,
    answeredAt,
  });

  rt.waiting = rt.waiting.filter((c) => c !== caller);
  void serviceQueue(rt.queueId);
}

// --- teardown (dispatcher ChannelDestroyed) ------------------------------------------------------

/** A channel went away — figure out if it was a waiting/connected queue CALLER and clean up. */
export async function onQueueCallerEnded(channelId: string): Promise<void> {
  // (A) waiting caller abandoned while on hold
  for (const rt of runtimes.values()) {
    const caller = rt.waiting.find((c) => c.callerChannelId === channelId);
    if (!caller) continue;
    rt.waiting = rt.waiting.filter((c) => c !== caller);
    clearCallerTimers(caller);
    // Cancel any agent legs ringing for this now-gone caller.
    for (const num of caller.ringingAgents) {
      const a = rt.agents.get(num);
      if (a?.ringingChannelId) {
        pendingAgentDials.delete(a.ringingChannelId);
        void ari.hangup(a.ringingChannelId).catch(() => {});
      }
      if (a) freeAgent(a);
    }
    await ari.destroyBridge(caller.holdBridgeId).catch(() => {});
    if (caller.callLogId) {
      const waitSec = Math.round((Date.now() - caller.joinedAt) / 1000);
      await db.queueCallLog.update({ where: { id: caller.callLogId }, data: { endedAt: new Date(), waitSec, outcome: "ABANDONED" } }).catch(() => {});
    }
    void serviceQueue(rt.queueId);
    return;
  }
  // (B) connected caller hung up → end the agent leg + tear down
  const ac = activeCalls.get(channelId);
  if (ac) {
    activeCalls.delete(channelId);
    await endActiveCall(ac);
  }
}

/** A channel went away — figure out if it was a ringing or connected queue AGENT leg. */
export async function onQueueAgentEnded(channelId: string): Promise<void> {
  // (A) a RINGING agent leg ended (no-answer / busy / reject / cancelled)
  const pd = pendingAgentDials.get(channelId);
  if (pd) {
    pendingAgentDials.delete(channelId);
    const rt = runtimes.get(pd.queueId);
    const agent = rt?.agents.get(pd.extNumber);
    if (rt && agent && agent.ringingChannelId === channelId) {
      const caller = rt.waiting.find((c) => c.callerChannelId === pd.callerChannelId);
      caller?.ringingAgents.delete(pd.extNumber);
      freeAgent(agent);
      void serviceQueue(rt.queueId); // try the next agent
    }
    return;
  }
  // (B) a CONNECTED agent hung up → end the caller
  for (const ac of activeCalls.values()) {
    if (ac.agentChannelId !== channelId) continue;
    activeCalls.delete(ac.callerChannelId);
    await ari.hangup(ac.callerChannelId).catch(() => {}); // caller's CallRecord is finalized by the dispatcher
    await endActiveCall(ac);
    return;
  }
}

/** Common teardown for a connected queue call (bridge destroy + log talkSec + agent wrap-up). */
async function endActiveCall(ac: ActiveCall): Promise<void> {
  await ari.destroyBridge(ac.bridgeId).catch(() => {});
  if (ac.callLogId) {
    const talkSec = Math.round((Date.now() - ac.answeredAt) / 1000);
    await db.queueCallLog.update({ where: { id: ac.callLogId }, data: { endedAt: new Date(), talkSec } }).catch(() => {});
  }
  const rt = runtimes.get(ac.queueId);
  const agent = rt?.agents.get(ac.agentExtNumber);
  if (agent) wrapUp(rt!, agent);
  if (rt) void serviceQueue(rt.queueId);
}

// --- the matcher ---------------------------------------------------------------------------------

async function serviceQueue(queueId: string): Promise<void> {
  const rt = runtimes.get(queueId);
  if (!rt) return;
  if (rt.servicing) {
    rt.dirty = true; // don't lose a wakeup that arrives mid-pass
    return;
  }
  rt.servicing = true;
  try {
    // Reload cfg + members each pass so portal pause/login (DB-only, cross-process) is picked up.
    const q = await db.queue.findUnique({ where: { id: queueId }, include: { members: { include: { extension: true } } } });
    if (!q) return;
    rt.cfg = q;
    syncAgents(rt, q.members);

    if (rt.waiting.length === 0) return;
    const avail = dialableAgents(rt);
    if (avail.length === 0) return;

    if (rt.cfg.strategy === "RINGALL") {
      const head = rt.waiting[0];
      if (head && head.ringingAgents.size === 0) {
        for (const a of avail) await ringAgent(rt, head, a);
      }
    } else {
      // One agent per waiting caller (FIFO), so multiple callers can be served concurrently.
      // `working` is consumed as agents are assigned so two callers never get the same agent in
      // one pass; triedAgents advances past a non-answering agent to the next in strategy order.
      const working = [...avail];
      for (const caller of rt.waiting) {
        if (caller.ringingAgents.size > 0) continue;
        if (working.length === 0) break;
        let idx = working.findIndex((a) => !caller.triedAgents.has(a.extNumber));
        if (idx < 0) {
          caller.triedAgents.clear(); // tried them all → start the rotation over
          idx = 0;
        }
        const a = working.splice(idx, 1)[0];
        caller.triedAgents.add(a.extNumber);
        await ringAgent(rt, caller, a);
      }
    }
  } finally {
    rt.servicing = false;
    scheduleSnapshot(queueId); // every service pass reflects the latest waiting/agent state
    if (rt.dirty) {
      rt.dirty = false;
      void serviceQueue(queueId);
    }
  }
}

async function ringAgent(rt: QueueRuntime, caller: WaitingCaller, agent: AgentRuntime): Promise<void> {
  // Flip status synchronously BEFORE awaiting so a re-entrant pass can't pick this agent twice.
  agent.status = "RINGING";
  agent.ringingFor = caller.callerChannelId;
  caller.ringingAgents.add(agent.extNumber);
  try {
    const ch = await ari.originate({
      endpoint: `PJSIP/${agent.extNumber}`,
      timeout: rt.cfg.agentRingSeconds,
      appArgs: `queued,${caller.callerChannelId},${rt.queueId}`,
    });
    agent.ringingChannelId = ch.id;
    pendingAgentDials.set(ch.id, { queueId: rt.queueId, extNumber: agent.extNumber, callerChannelId: caller.callerChannelId });
    agent.ringTimer = setTimeout(() => onAgentRingTimeout(rt.queueId, agent.extNumber), (rt.cfg.agentRingSeconds + 1) * 1000);
  } catch {
    // Endpoint offline / unreachable → revert and let the next pass try another agent.
    caller.ringingAgents.delete(agent.extNumber);
    freeAgent(agent);
  }
}

function onAgentRingTimeout(queueId: string, extNumber: string): void {
  const rt = runtimes.get(queueId);
  const agent = rt?.agents.get(extNumber);
  if (agent?.status === "RINGING" && agent.ringingChannelId) {
    // Hang up the ringing leg → its ChannelDestroyed runs onQueueAgentEnded (frees + advances).
    void ari.hangup(agent.ringingChannelId).catch(() => {});
  }
}

// --- announcements + max-wait --------------------------------------------------------------------

function armAnnounce(rt: QueueRuntime, caller: WaitingCaller): void {
  if (!rt.cfg.announcePosition && !rt.cfg.announceHoldTime) return;
  const every = Math.max(10, rt.cfg.announceFrequency || 30) * 1000;
  caller.announceTimer = setTimeout(() => void playAnnouncement(rt, caller), every);
}

async function playAnnouncement(rt: QueueRuntime, caller: WaitingCaller): Promise<void> {
  const pos = rt.waiting.indexOf(caller) + 1;
  // Skip if the caller left or is currently being rung (avoid talking over a connect).
  if (pos === 0 || caller.ringingAgents.size > 0) {
    if (pos > 0) armAnnounce(rt, caller);
    return;
  }
  await ari.stopMoh(caller.holdBridgeId).catch(() => {});
  if (rt.cfg.announcePosition) {
    if (pos === 1) {
      await playAndWait(caller.callerChannelId, "sound:queue-youarenext");
    } else {
      await playAndWait(caller.callerChannelId, "sound:queue-thereare");
      await playAndWait(caller.callerChannelId, `digits:${pos}`);
      await playAndWait(caller.callerChannelId, "sound:queue-callswaiting");
    }
  }
  await ari.startMoh(caller.holdBridgeId, rt.cfg.mohClass || undefined).catch(() => {});
  if (rt.waiting.indexOf(caller) >= 0) armAnnounce(rt, caller); // re-arm if still waiting
}

function armTimeout(rt: QueueRuntime, caller: WaitingCaller): void {
  if (!rt.cfg.maxWaitSeconds || rt.cfg.maxWaitSeconds <= 0) return;
  caller.timeoutTimer = setTimeout(() => void onCallerTimeout(rt.queueId, caller), rt.cfg.maxWaitSeconds * 1000);
}

async function onCallerTimeout(queueId: string, caller: WaitingCaller): Promise<void> {
  const rt = runtimes.get(queueId);
  if (!rt || rt.waiting.indexOf(caller) < 0) return;
  rt.waiting = rt.waiting.filter((c) => c !== caller);
  clearCallerTimers(caller);
  for (const num of caller.ringingAgents) {
    const a = rt.agents.get(num);
    if (a?.ringingChannelId) {
      pendingAgentDials.delete(a.ringingChannelId);
      void ari.hangup(a.ringingChannelId).catch(() => {});
    }
    if (a) freeAgent(a);
  }
  if (caller.callLogId) {
    const waitSec = Math.round((Date.now() - caller.joinedAt) / 1000);
    await db.queueCallLog.update({ where: { id: caller.callLogId }, data: { endedAt: new Date(), waitSec, outcome: rt.cfg.timeoutType ? "TIMEOUT" : "FAILOVER" } }).catch(() => {});
  }
  // Free the caller channel from the hold bridge, then route onward.
  await ari.stopMoh(caller.holdBridgeId).catch(() => {});
  await ari.removeFromBridge(caller.holdBridgeId, caller.callerChannelId).catch(() => {});
  await ari.destroyBridge(caller.holdBridgeId).catch(() => {});
  await ari.setVar(caller.callerChannelId, "QUEUE_ACTIVE", "0").catch(() => {}); // no longer queued

  const type = rt.cfg.timeoutType ?? rt.cfg.failoverType;
  const id = rt.cfg.timeoutId ?? rt.cfg.failoverId;
  await failoverCaller(caller.callerChannelId, caller.callRecordId, type, id);
  void serviceQueue(queueId); // freed agents can now serve remaining waiting callers
}

async function failoverCaller(callerChannelId: string, callRecordId: string, type: Queue["failoverType"], id: string | null): Promise<void> {
  if (type) {
    const { resolveDestination } = await import("./destinations");
    await resolveDestination(type, id, callerChannelId, callRecordId).catch(() => {});
  } else {
    await ari.hangup(callerChannelId).catch(() => {});
  }
}

// --- agent-state helpers -------------------------------------------------------------------------

function getOrCreateRuntime(queue: QueueWithMembers): QueueRuntime {
  let rt = runtimes.get(queue.id);
  if (!rt) {
    rt = { queueId: queue.id, cfg: queue, waiting: [], agents: new Map(), servicing: false, dirty: false };
    runtimes.set(queue.id, rt);
  }
  rt.cfg = queue;
  syncAgents(rt, queue.members);
  return rt;
}

function syncAgents(rt: QueueRuntime, members: QueueWithMembers["members"]): void {
  const seen = new Set<string>();
  for (const m of members) {
    const ext = m.extension;
    if (!ext) continue;
    seen.add(ext.number);
    const eligible = m.loggedIn && !m.paused && ext.enabled && !ext.dnd;
    const existing = rt.agents.get(ext.number);
    if (existing) {
      existing.penalty = m.penalty;
      existing.order = m.order;
      existing.eligible = eligible;
      existing.extensionId = ext.id;
    } else {
      rt.agents.set(ext.number, {
        extNumber: ext.number,
        extensionId: ext.id,
        penalty: m.penalty,
        order: m.order,
        eligible,
        status: "AVAILABLE",
        lastCallEndedAt: 0,
        callsToday: 0,
      });
    }
  }
  // Drop members that are no longer in the queue AND aren't mid-call.
  for (const [num, a] of rt.agents) {
    if (!seen.has(num) && a.status === "AVAILABLE") rt.agents.delete(num);
  }
}

function dialableAgents(rt: QueueRuntime): AgentRuntime[] {
  const list = [...rt.agents.values()].filter((a) => a.status === "AVAILABLE" && a.eligible);
  switch (rt.cfg.strategy) {
    case "LINEAR":
      return list.sort((a, b) => a.penalty - b.penalty || a.order - b.order);
    case "FEWEST_CALLS":
      return list.sort((a, b) => a.penalty - b.penalty || a.callsToday - b.callsToday);
    case "LEAST_RECENT":
      return list.sort((a, b) => a.penalty - b.penalty || a.lastCallEndedAt - b.lastCallEndedAt);
    case "RANDOM":
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    case "RINGALL":
    default:
      return list;
  }
}

function freeAgent(agent: AgentRuntime): void {
  if (agent.ringTimer) clearTimeout(agent.ringTimer);
  agent.ringTimer = undefined;
  agent.ringingChannelId = undefined;
  agent.ringingFor = undefined;
  agent.status = "AVAILABLE";
}

function wrapUp(rt: QueueRuntime, agent: AgentRuntime): void {
  if (agent.ringTimer) clearTimeout(agent.ringTimer);
  agent.ringTimer = undefined;
  agent.ringingChannelId = undefined;
  agent.ringingFor = undefined;
  agent.lastCallEndedAt = Date.now();
  const wrap = rt.cfg.wrapUpSeconds || 0;
  if (wrap > 0) {
    agent.status = "WRAPUP";
    agent.wrapTimer = setTimeout(() => {
      agent.status = "AVAILABLE";
      void serviceQueue(rt.queueId);
    }, wrap * 1000);
  } else {
    agent.status = "AVAILABLE";
  }
}

function clearCallerTimers(caller: WaitingCaller): void {
  if (caller.announceTimer) clearTimeout(caller.announceTimer);
  if (caller.timeoutTimer) clearTimeout(caller.timeoutTimer);
  caller.announceTimer = undefined;
  caller.timeoutTimer = undefined;
}

// --- live wallboard snapshot (daemon writes QueueStatus; the wallboard UI polls it) -------------

const snapshotState = new Map<string, { lastAt: number; timer?: ReturnType<typeof setTimeout> }>();

/** Throttled to ~1/sec per queue, always with a trailing write so the final state lands. */
function scheduleSnapshot(queueId: string): void {
  const st = snapshotState.get(queueId) ?? { lastAt: 0 };
  snapshotState.set(queueId, st);
  const since = Date.now() - st.lastAt;
  if (since >= 1000) {
    st.lastAt = Date.now();
    void writeQueueSnapshot(queueId);
  } else if (!st.timer) {
    st.timer = setTimeout(() => {
      st.timer = undefined;
      st.lastAt = Date.now();
      void writeQueueSnapshot(queueId);
    }, 1000 - since);
  }
}

/** Fully defensive — a wallboard write must never break call handling (or an under-mocked test). */
async function writeQueueSnapshot(queueId: string): Promise<void> {
  try {
    const rt = runtimes.get(queueId);
    if (!rt) return;
    const now = Date.now();
    const waiting = rt.waiting.length;
    const longestWaitSec = waiting ? Math.round((now - Math.min(...rt.waiting.map((c) => c.joinedAt))) / 1000) : 0;
    let agentsAvailable = 0;
    let agentsOnCall = 0;
    let agentsPaused = 0;
    for (const a of rt.agents.values()) {
      if (!a.eligible) agentsPaused++;
      else if (a.status === "ON_CALL") agentsOnCall++;
      else if (a.status === "AVAILABLE") agentsAvailable++;
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [answeredToday, abandonedToday, agg] = await Promise.all([
      db.queueCallLog.count({ where: { queueId, enteredAt: { gte: startOfDay }, outcome: "ANSWERED" } }),
      db.queueCallLog.count({ where: { queueId, enteredAt: { gte: startOfDay }, outcome: "ABANDONED" } }),
      db.queueCallLog.aggregate({ _avg: { waitSec: true }, where: { queueId, enteredAt: { gte: startOfDay }, outcome: "ANSWERED" } }),
    ]);
    const data = { waiting, longestWaitSec, agentsAvailable, agentsOnCall, agentsPaused, answeredToday, abandonedToday, avgWaitSec: Math.round(agg._avg.waitSec ?? 0) };
    await db.queueStatus.upsert({ where: { queueId }, update: data, create: { queueId, ...data } });
  } catch {
    /* best-effort */
  }
}

// --- daemon-restart recovery (called from stateRecovery.recoverState) ----------------------------

function isCallerTracked(channelId: string): boolean {
  for (const rt of runtimes.values()) if (rt.waiting.some((c) => c.callerChannelId === channelId)) return true;
  return activeCalls.has(channelId);
}

/**
 * Re-adopt callers who were WAITING on hold when the daemon restarted. Their MOH keeps playing
 * (Asterisk-side) through the outage, and QUEUE_* channel vars carry the durable truth, so we
 * rebuild the runtime + waiting list and resume serving them. A pre-restart ringing agent leg that
 * later answers has no in-memory pending entry → onAgentAnswered drops it as an orphan and the
 * re-serviced caller is simply rung again, so they never lose their place. (Connected queue calls
 * carry QUEUE_ACTIVE=0 and are left alone — Asterisk keeps that bridge up.)
 */
export async function recoverQueues(channels: { id: string; name: string }[]): Promise<void> {
  for (const ch of channels) {
    if ((await ari.getVar(ch.id, "QUEUE_ACTIVE")) !== "1") continue;
    if (isCallerTracked(ch.id)) continue; // a WS blip (maps intact), not a process restart

    const queueId = await ari.getVar(ch.id, "QUEUE_ID");
    const bridgeId = await ari.getVar(ch.id, "QUEUE_BRIDGE");
    if (!queueId || !bridgeId) continue;

    const q = await db.queue
      .findUnique({ where: { id: queueId }, include: { members: { include: { extension: true } } } })
      .catch(() => null);
    if (!q) {
      await ari.hangup(ch.id).catch(() => {}); // queue deleted during the outage → drop cleanly
      continue;
    }

    const joinedAtRaw = await ari.getVar(ch.id, "QUEUE_JOINED_AT");
    const joinedAt = joinedAtRaw && Number.isFinite(Number(joinedAtRaw)) ? Number(joinedAtRaw) : Date.now();
    const callRecordId = (await ari.getVar(ch.id, "CALLREC_ID")) ?? "";
    // Reuse the still-open QueueCallLog rather than double-counting the call.
    const openLog = await db.queueCallLog.findFirst({ where: { callRecordId, endedAt: null }, orderBy: { enteredAt: "desc" } }).catch(() => null);

    const rt = getOrCreateRuntime(q);
    const caller: WaitingCaller = {
      callerChannelId: ch.id,
      callRecordId,
      callLogId: openLog?.id ?? "",
      holdBridgeId: bridgeId,
      joinedAt,
      joinPosition: rt.waiting.length + 1,
      ringingAgents: new Set(),
      triedAgents: new Set(),
    };
    rt.waiting.push(caller);
    await ari.startMoh(bridgeId, q.mohClass || undefined).catch(() => {}); // re-assert hold audio
    armAnnounce(rt, caller);
    armTimeout(rt, caller);
    void serviceQueue(queueId);
    console.log(`[ari] re-adopted queued caller ${ch.id} in "${q.name}" after restart`);
  }
}

/** Test-only: clear all in-memory queue state between cases. Never called in production. */
export function __resetQueuesForTest(): void {
  for (const st of snapshotState.values()) if (st.timer) clearTimeout(st.timer);
  runtimes.clear();
  pendingAgentDials.clear();
  activeCalls.clear();
  playWaiters.clear();
  snapshotState.clear();
}
