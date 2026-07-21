// Call parking over ARI. Dialing (or blind-transferring a call to) the park ORBIT number parks the
// caller on hold in the lowest free slot and announces the slot number to them (so in an attended
// transfer the parker hears the slot before completing). Anyone dialing that SLOT number retrieves
// the parked call. A parked call that isn't picked up within PARK_RETURN_SECONDS is dropped.
//
// Numbers are env-configurable and default clear of the seed extensions/queues/conferences. Same
// ARI mixing-bridge + MOH + channel-var recovery pattern as the queue/conference engines.
import { ari } from "./ariClient";

const ORBIT = process.env.PARK_ORBIT ?? "7000";
const SLOT_START = Number(process.env.PARK_SLOT_START ?? "7001");
const SLOT_END = Number(process.env.PARK_SLOT_END ?? "7010");
const RETURN_SECONDS = Number(process.env.PARK_RETURN_SECONDS ?? "120");

interface ParkedCall {
  slot: number;
  bridgeId: string;
  members: Set<string>; // parked caller, then + retriever once picked up
  parkedAt: number;
  timer?: ReturnType<typeof setTimeout>;
}

const bySlot = new Map<number, ParkedCall>();
const byChannel = new Map<string, number>(); // channel id -> slot

export function isParkOrbit(dialed: string): boolean {
  return dialed === ORBIT;
}
export function parkedSlot(dialed: string): number | null {
  const n = Number(dialed);
  return Number.isInteger(n) && bySlot.has(n) ? n : null;
}

/** Park the caller in the next free slot and announce the slot number to them. */
export async function park(callerChannelId: string): Promise<void> {
  let slot = -1;
  for (let s = SLOT_START; s <= SLOT_END; s++) {
    if (!bySlot.has(s)) {
      slot = s;
      break;
    }
  }
  if (slot < 0) {
    await ari.answer(callerChannelId).catch(() => {});
    await ari.play(callerChannelId, "sound:pbx-invalid").catch(() => {}); // all slots full
    await ari.hangup(callerChannelId).catch(() => {});
    return;
  }

  await ari.answer(callerChannelId).catch(() => {});
  const bridge = await ari.createBridge("mixing");
  await ari.addToBridge(bridge.id, callerChannelId).catch(() => {});
  await ari.setVar(callerChannelId, "PARK_ACTIVE", "1").catch(() => {});
  await ari.setVar(callerChannelId, "PARK_SLOT", String(slot)).catch(() => {});
  await ari.setVar(callerChannelId, "PARK_BRIDGE", bridge.id).catch(() => {});

  const pc: ParkedCall = { slot, bridgeId: bridge.id, members: new Set([callerChannelId]), parkedAt: Date.now() };
  bySlot.set(slot, pc);
  byChannel.set(callerChannelId, slot);

  await ari.play(callerChannelId, `digits:${slot}`).catch(() => {}); // announce the slot
  await ari.startMoh(bridge.id).catch(() => {});
  pc.timer = setTimeout(() => void onParkTimeout(slot), RETURN_SECONDS * 1000);
  console.log(`[park] parked ${callerChannelId} at slot ${slot}`);
}

/** Retrieve the call parked in `slot` by bridging the retriever into its hold bridge. */
export async function retrieve(slot: number, retrieverChannelId: string): Promise<void> {
  const pc = bySlot.get(slot);
  if (!pc) {
    await ari.answer(retrieverChannelId).catch(() => {});
    await ari.play(retrieverChannelId, "sound:pbx-invalid").catch(() => {}); // nothing parked there
    await ari.hangup(retrieverChannelId).catch(() => {});
    return;
  }
  if (pc.timer) clearTimeout(pc.timer);
  await ari.answer(retrieverChannelId).catch(() => {});
  await ari.stopMoh(pc.bridgeId).catch(() => {});
  await ari.addToBridge(pc.bridgeId, retrieverChannelId).catch(() => {});
  pc.members.add(retrieverChannelId);
  byChannel.set(retrieverChannelId, slot);
  // Slot is now a live 2-party call in the (former) hold bridge; free the slot for reuse.
  bySlot.delete(slot);
  console.log(`[park] slot ${slot} retrieved by ${retrieverChannelId}`);
}

/** A channel left — clean up a parked call / connected retrieval; destroy the bridge when empty. */
export async function onParkChannelGone(channelId: string): Promise<void> {
  const slot = byChannel.get(channelId);
  if (slot === undefined) return;
  byChannel.delete(channelId);
  const pc = bySlot.get(slot) ?? findByBridgeMember(channelId);
  if (!pc) return;
  pc.members.delete(channelId);
  if (pc.members.size === 0) {
    if (pc.timer) clearTimeout(pc.timer);
    bySlot.delete(pc.slot);
    await ari.destroyBridge(pc.bridgeId).catch(() => {});
  }
}

// After retrieve() removes the slot from bySlot, the ParkedCall still lives via its members' byChannel
// entries; find it when the last member hangs up.
function findByBridgeMember(channelId: string): ParkedCall | undefined {
  for (const pc of bySlot.values()) if (pc.members.has(channelId)) return pc;
  return undefined;
}

async function onParkTimeout(slot: number): Promise<void> {
  const pc = bySlot.get(slot);
  if (!pc) return;
  bySlot.delete(slot);
  for (const ch of pc.members) byChannel.delete(ch);
  await ari.destroyBridge(pc.bridgeId).catch(() => {});
  for (const ch of pc.members) await ari.hangup(ch).catch(() => {}); // return-to-parker is a follow-up
  console.log(`[park] slot ${slot} timed out (unretrieved)`);
}

/** Re-adopt parked calls after a daemon restart (the hold bridge + MOH survive Asterisk-side). */
export async function recoverParking(channels: { id: string; name: string }[]): Promise<void> {
  for (const ch of channels) {
    if (byChannel.has(ch.id)) continue;
    if ((await ari.getVar(ch.id, "PARK_ACTIVE")) !== "1") continue;
    const slotRaw = await ari.getVar(ch.id, "PARK_SLOT");
    const bridgeId = await ari.getVar(ch.id, "PARK_BRIDGE");
    const slot = Number(slotRaw);
    if (!bridgeId || !Number.isInteger(slot)) continue;
    let pc = bySlot.get(slot);
    if (!pc) {
      pc = { slot, bridgeId, members: new Set(), parkedAt: Date.now() };
      pc.timer = setTimeout(() => void onParkTimeout(slot), RETURN_SECONDS * 1000);
      bySlot.set(slot, pc);
    }
    pc.members.add(ch.id);
    byChannel.set(ch.id, slot);
    console.log(`[park] re-adopted parked call at slot ${slot} after restart`);
  }
}

/** Test-only: clear in-memory parking state. */
export function __resetParkingForTest(): void {
  for (const pc of bySlot.values()) if (pc.timer) clearTimeout(pc.timer);
  bySlot.clear();
  byChannel.clear();
}
