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
  await finalizeCallRecord(callRecordId, { disposition: "VOICEMAIL" }).catch(() => {});
  // Hand back to the native dialplan so app_voicemail records it (keeps MWI + VM-to-email).
  await ari.continueInDialplan(callerChannelId, "vmdirect", ext.number, 1).catch(async () => {
    await ari.hangup(callerChannelId).catch(() => {});
  });
}

export async function dialExtension(callerChannelId: string, ext: Extension, callRecordId: string): Promise<void> {
  if (ext.dnd) return sendToVoicemail(callerChannelId, ext, callRecordId);
  await dialEndpoints(callerChannelId, [{ endpoint: `PJSIP/${ext.number}` }], {
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
  const digits = digitsOnly(dialed);
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

  // ---- toll-fraud guardrails ----
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
      extensionPermission: fromExt?.outboundPermission ?? "local",
      concurrentOutbound: activeOutboundCount(),
      velocityCount: 0,
      velocityLimit: null,
    },
  );

  if (decision.action !== "ALLOW") {
    await db.blockEvent
      .create({ data: { toNumber: dialed, reason: decision.reason, action: decision.action, fromExtensionId: fromExt?.id } })
      .catch(() => {});
    await finalizeCallRecord(callRecordId, {
      disposition: "BLOCKED",
      guardrailAction: decision.action,
      guardrailReason: decision.reason,
    });
    return playThenHangup(callerChannelId, "ss-noservice");
  }

  // ---- pick an outbound route ----
  const routes = await db.outboundRoute.findMany({ where: { enabled: true }, orderBy: { priority: "asc" } });
  const extRank = PERMISSION_RANK[fromExt?.outboundPermission ?? "local"] ?? 1;
  const route = routes.find(
    (r) => matchDialPattern(r.matchPattern, digits) && extRank >= (PERMISSION_RANK[r.permissionTag] ?? 1),
  );
  if (!route) {
    await finalizeCallRecord(callRecordId, { disposition: "FAILED" });
    return playThenHangup(callerChannelId, "ss-noservice");
  }

  const trunk = await db.trunk.findUnique({ where: { id: route.trunkId } });
  if (!trunk?.enabled) {
    await finalizeCallRecord(callRecordId, { disposition: "FAILED" });
    return void ari.hangup(callerChannelId).catch(() => {});
  }

  const outNumber = applyDialTransform(digits, route.stripDigits, route.prependDigits);
  const callerId = route.callerIdNumber ?? fromExt?.callerIdNumber ?? undefined;
  await dialEndpoints(callerChannelId, [{ endpoint: `PJSIP/${outNumber}@${trunk.name}` }], {
    callerId,
    ringSeconds: 60,
    onNoAnswer: async () => {
      await finalizeCallRecord(callRecordId, { disposition: "NO_ANSWER" });
      await ari.hangup(callerChannelId).catch(() => {});
    },
  });
}
