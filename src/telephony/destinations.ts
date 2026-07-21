// Destination resolvers: given a (DestinationType, id) — or an inbound DID / an outbound dial
// string — drive the call to the right place over ARI. All business logic lives here (not in
// the dialplan). Circular ref with ivrInterpreter is broken by a dynamic import there.
import { ari } from "./ariClient";
import { db } from "@/lib/db";
import { dialEndpoints } from "./originate";
import { runIvrFlow } from "./ivrInterpreter";
import { createCallRecord, finalizeCallRecord } from "./callRecord";
import { putSession, activeOutboundCount } from "./callSession";
import { decideGuardrail } from "@/lib/guardrail";
import { classifyDial, digitsOnly, applyDialTransform, matchDialPattern, toE164 } from "@/lib/phone";
import { parseCallForward } from "@/lib/callForward";
import { startVoicemailCapture } from "./voicemail";
import { resolveBusinessHours, type HoursRule } from "@/lib/businessHours";
import type { DestinationType, Extension, RingGroup, BusinessHours } from "@prisma/client";

const RING_DEFAULT = 20;
const PERMISSION_RANK: Record<string, number> = { internal: 0, local: 1, national: 2, international: 3 };

// --- shared helpers ---------------------------------------------------------

async function findDid(did: string) {
  const e164 = toE164(did) ?? (did.startsWith("+") ? did : `+${digitsOnly(did)}`);
  return (
    (await db.did.findUnique({ where: { e164: did }, include: { inboundRoute: { include: { businessHours: true } } } })) ??
    (await db.did.findUnique({ where: { e164 }, include: { inboundRoute: { include: { businessHours: true } } } }))
  );
}

function bhInput(bh: BusinessHours) {
  return {
    timezone: bh.timezone,
    rules: (bh.rules as unknown as HoursRule[]) ?? [],
    holidays: (bh.holidays as unknown as string[] | null) ?? null,
    inType: bh.inType,
    inId: bh.inId,
    elseType: bh.elseType,
    elseId: bh.elseId,
  };
}

async function playThenHangup(channelId: string, sound: string): Promise<void> {
  await ari.answer(channelId).catch(() => {});
  await ari.play(channelId, `sound:${sound}`).catch(() => {});
  await ari.hangup(channelId).catch(() => {});
}

// --- voicemail / extensions -------------------------------------------------

export async function sendToVoicemail(callerChannelId: string, ext: Extension, callRecordId: string): Promise<void> {
  // App-owned capture over ARI (records → DB row → transcribe → email + portal audio). Finalizes
  // the CallRecord as VOICEMAIL itself; falls back to the native [vmdirect] dialplan on error.
  return startVoicemailCapture(callerChannelId, ext, callRecordId);
}

export async function dialExtension(callerChannelId: string, ext: Extension, callRecordId: string): Promise<void> {
  const cf = parseCallForward(ext.callForward);
  // Forward-always: straight to the mobile, BEFORE the DND check (explicit forward intent wins).
  if (cf?.mode === "always") return forwardToMobile(callerChannelId, ext, cf.number, callRecordId);
  if (ext.dnd) return sendToVoicemail(callerChannelId, ext, callRecordId);
  await dialEndpoints(callerChannelId, [{ endpoint: `PJSIP/${ext.number}` }], {
    ringSeconds: ext.ringSeconds || RING_DEFAULT,
    // Forward-on-no-answer: ring the desk first, then the mobile, then voicemail.
    onNoAnswer: async () =>
      cf?.mode === "no_answer"
        ? forwardToMobile(callerChannelId, ext, cf.number, callRecordId)
        : sendToVoicemail(callerChannelId, ext, callRecordId),
  });
}

// Forward a call to an external mobile number via an outbound trunk. Reuses the same route pick /
// guardrails / transform / caller-ID as normal outbound dialing (resolveOutboundLeg). If the
// forward can't be placed (blocked, or no route/trunk) or the mobile doesn't answer, the caller
// still lands in the extension's own voicemail.
async function forwardToMobile(callerChannelId: string, ext: Extension, number: string, callRecordId: string): Promise<void> {
  const leg = await resolveOutboundLeg(number, ext);
  if (!leg.ok) return sendToVoicemail(callerChannelId, ext, callRecordId);
  await dialEndpoints(callerChannelId, [{ endpoint: leg.endpoint }], {
    callerId: leg.callerId,
    ringSeconds: ext.ringSeconds || RING_DEFAULT,
    onNoAnswer: async () => sendToVoicemail(callerChannelId, ext, callRecordId),
  });
}

export async function dialRingGroup(
  callerChannelId: string,
  rg: RingGroup & { members: { extension: Extension | null }[] },
  callRecordId: string,
): Promise<void> {
  const targets = rg.members
    .map((m) => m.extension)
    .filter((e): e is Extension => !!e && e.enabled && !e.dnd)
    .map((e) => ({ endpoint: `PJSIP/${e.number}` }));
  if (targets.length === 0) return void ari.hangup(callerChannelId).catch(() => {});
  await dialEndpoints(callerChannelId, targets, {
    ringSeconds: rg.ringSeconds || RING_DEFAULT,
    onNoAnswer: async () => {
      if (rg.failoverType) return resolveDestination(rg.failoverType, rg.failoverId, callerChannelId, callRecordId);
      await ari.hangup(callerChannelId).catch(() => {});
    },
  });
}

// --- generic destination resolver ------------------------------------------

export async function resolveDestination(
  type: DestinationType,
  id: string | null,
  callerChannelId: string,
  callRecordId: string,
): Promise<void> {
  switch (type) {
    case "EXTENSION": {
      const ext = id ? await db.extension.findUnique({ where: { id } }) : null;
      if (ext?.enabled) return dialExtension(callerChannelId, ext, callRecordId);
      break;
    }
    case "RING_GROUP": {
      const rg = id
        ? await db.ringGroup.findUnique({ where: { id }, include: { members: { include: { extension: true }, orderBy: { order: "asc" } } } })
        : null;
      if (rg) return dialRingGroup(callerChannelId, rg, callRecordId);
      break;
    }
    case "IVR": {
      const flow = id ? await db.ivrFlow.findUnique({ where: { id } }) : null;
      if (flow) return runIvrFlow(callerChannelId, flow.id, callRecordId);
      break;
    }
    case "VOICEMAIL": {
      const ext = id ? await db.extension.findUnique({ where: { id } }) : null;
      if (ext) return sendToVoicemail(callerChannelId, ext, callRecordId);
      break;
    }
    case "TIME_CONDITION": {
      const bh = id ? await db.businessHours.findUnique({ where: { id } }) : null;
      if (bh) {
        const dest = resolveBusinessHours(bhInput(bh), new Date());
        return resolveDestination(dest.type, dest.id, callerChannelId, callRecordId);
      }
      break;
    }
    case "AI_AGENT": {
      // Real-time AI receptionist. Dynamic import breaks the destinations ↔ agentSession cycle
      // (agentSession calls resolveDestination for transfer/voicemail/fallback).
      const { startAgentSession } = await import("./realtime-media/agentSession");
      return startAgentSession(callerChannelId, id, callRecordId);
    }
    case "HANGUP":
    case "EXTERNAL":
    default:
      break;
  }
  await ari.hangup(callerChannelId).catch(() => {});
}

// --- top-level entry points (called by routing) -----------------------------

export async function routeInbound(callerChannelId: string, callerNum: string, did: string): Promise<void> {
  const didRow = await findDid(did);
  const callRecordId = await createCallRecord({
    direction: "INBOUND",
    fromNumber: callerNum,
    toNumber: did,
    uniqueId: callerChannelId,
    didId: didRow?.id,
    trunkId: didRow?.trunkId ?? undefined,
  });
  await ari.setVar(callerChannelId, "CALLREC_ID", callRecordId).catch(() => {});
  putSession({ channelId: callerChannelId, callRecordId, direction: "INBOUND", retries: 0, createdAt: Date.now() });

  const route = didRow?.inboundRoute;
  if (!route) return playThenHangup(callerChannelId, "ss-noservice");

  let type: DestinationType = route.destinationType;
  let id: string | null = route.destinationId;
  if (route.businessHours) {
    const dest = resolveBusinessHours(bhInput(route.businessHours), new Date());
    type = dest.type;
    id = dest.id;
  }
  await resolveDestination(type, id, callerChannelId, callRecordId);
}

export async function routeInternal(callerChannelId: string, callerNum: string, dialed: string): Promise<void> {
  const ext = await db.extension.findUnique({ where: { number: dialed } });
  if (ext?.enabled) {
    const callRecordId = await createCallRecord({
      direction: "INTERNAL",
      fromNumber: callerNum,
      toNumber: dialed,
      uniqueId: callerChannelId,
      toExtensionId: ext.id,
    });
    await ari.setVar(callerChannelId, "CALLREC_ID", callRecordId).catch(() => {});
    putSession({ channelId: callerChannelId, callRecordId, direction: "INTERNAL", retries: 0, createdAt: Date.now() });
    return dialExtension(callerChannelId, ext, callRecordId);
  }
  // Not an extension → treat as an external/outbound call.
  return routeOutbound(callerChannelId, callerNum, dialed);
}

export async function routeOutbound(callerChannelId: string, callerNum: string, dialed: string): Promise<void> {
  const callClass = classifyDial(dialed);
  const fromExt = callerNum ? await db.extension.findUnique({ where: { number: callerNum } }) : null;

  const callRecordId = await createCallRecord({
    direction: "OUTBOUND",
    fromNumber: callerNum,
    toNumber: dialed,
    uniqueId: callerChannelId,
    fromExtensionId: fromExt?.id,
    callClass,
  });
  await ari.setVar(callerChannelId, "CALLREC_ID", callRecordId).catch(() => {});
  putSession({ channelId: callerChannelId, callRecordId, direction: "OUTBOUND", retries: 0, createdAt: Date.now() });

  const leg = await resolveOutboundLeg(dialed, fromExt);
  if (!leg.ok) {
    if (leg.blocked) {
      await db.blockEvent
        .create({ data: { toNumber: dialed, reason: leg.reason, action: leg.action, fromExtensionId: fromExt?.id } })
        .catch(() => {});
      await finalizeCallRecord(callRecordId, { disposition: "BLOCKED", guardrailAction: leg.action, guardrailReason: leg.reason });
    } else {
      await finalizeCallRecord(callRecordId, { disposition: "FAILED" });
    }
    return playThenHangup(callerChannelId, "ss-noservice");
  }

  await dialEndpoints(callerChannelId, [{ endpoint: leg.endpoint }], {
    callerId: leg.callerId,
    ringSeconds: 60,
    onNoAnswer: async () => {
      await finalizeCallRecord(callRecordId, { disposition: "NO_ANSWER" });
      await ari.hangup(callerChannelId).catch(() => {});
    },
  });
}

// Shared outbound-leg resolver: route pick + toll-fraud guardrails + trunk + number transform +
// caller-ID. Used by routeOutbound (normal dialing) AND forwardToMobile (call forwarding), so the
// two paths can't drift. `permExt` is the extension whose outbound permission + caller-ID apply
// (the dialer for outbound; the forwarding extension for a forward).
type GuardrailAction = ReturnType<typeof decideGuardrail>["action"];
type OutboundLeg =
  | { ok: true; endpoint: string; callerId?: string }
  | { ok: false; blocked: true; reason: string; action: GuardrailAction }
  | { ok: false; blocked: false; reason: "no_route" | "no_trunk" };

async function resolveOutboundLeg(dialedNumber: string, permExt: Extension | null): Promise<OutboundLeg> {
  const digits = digitsOnly(dialedNumber);
  const callClass = classifyDial(dialedNumber);

  const policy = await db.guardrailPolicy.findUnique({ where: { id: "singleton" } });
  const decision = decideGuardrail(
    {
      internationalEnabled: policy?.internationalEnabled ?? false,
      hasInternationalPin: !!policy?.internationalPinEnc,
      maxConcurrentOutbound: policy?.maxConcurrentOutbound ?? 4,
      allowedCountryCodes: policy?.allowedCountryCodes ?? [],
      blockedPrefixes: policy?.blockedPrefixes ?? [],
    },
    {
      callClass,
      dialedDigits: digits,
      extensionPermission: permExt?.outboundPermission ?? "local",
      concurrentOutbound: activeOutboundCount(),
      velocityCount: 0,
      velocityLimit: null,
    },
  );
  if (decision.action !== "ALLOW") return { ok: false, blocked: true, reason: decision.reason, action: decision.action };

  const routes = await db.outboundRoute.findMany({ where: { enabled: true }, orderBy: { priority: "asc" } });
  const extRank = PERMISSION_RANK[permExt?.outboundPermission ?? "local"] ?? 1;
  const route = routes.find(
    (r) => matchDialPattern(r.matchPattern, digits) && extRank >= (PERMISSION_RANK[r.permissionTag] ?? 1),
  );
  if (!route) return { ok: false, blocked: false, reason: "no_route" };

  const trunk = await db.trunk.findUnique({ where: { id: route.trunkId } });
  if (!trunk?.enabled) return { ok: false, blocked: false, reason: "no_trunk" };

  const outNumber = applyDialTransform(digits, route.stripDigits, route.prependDigits);
  const callerId = route.callerIdNumber ?? permExt?.callerIdNumber ?? undefined;
  return { ok: true, endpoint: `PJSIP/${outNumber}@${trunk.name}`, callerId };
}
