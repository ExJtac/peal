// Create/finalize CallRecord rows from ARI events for reporting. Worker-safe.
import { db } from "@/lib/db";
import type { CallDirection, CallDisposition, CallClass, GuardrailAction } from "@prisma/client";

export interface NewCallRecord {
  uniqueId?: string;
  linkedId?: string;
  direction: CallDirection;
  fromNumber?: string;
  toNumber?: string;
  fromExtensionId?: string;
  toExtensionId?: string;
  didId?: string;
  trunkId?: string;
  callClass?: CallClass;
}

export async function createCallRecord(input: NewCallRecord): Promise<string> {
  const r = await db.callRecord.create({
    data: {
      uniqueId: input.uniqueId,
      linkedId: input.linkedId,
      direction: input.direction,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      fromExtensionId: input.fromExtensionId,
      toExtensionId: input.toExtensionId,
      didId: input.didId,
      trunkId: input.trunkId,
      callClass: input.callClass,
    },
    select: { id: true },
  });
  return r.id;
}

export async function markAnswered(id: string): Promise<void> {
  await db.callRecord.update({ where: { id }, data: { answeredAt: new Date() } }).catch(() => {});
}

export async function finalizeCallRecord(
  id: string,
  patch: {
    disposition?: CallDisposition;
    hangupCause?: string;
    recordingPath?: string;
    guardrailAction?: GuardrailAction;
    guardrailReason?: string;
  },
): Promise<void> {
  const rec = await db.callRecord.findUnique({ where: { id }, select: { startedAt: true, answeredAt: true } });
  const now = new Date();
  const durationSec = rec ? Math.max(0, Math.round((now.getTime() - rec.startedAt.getTime()) / 1000)) : 0;
  const billSec = rec?.answeredAt ? Math.max(0, Math.round((now.getTime() - rec.answeredAt.getTime()) / 1000)) : 0;
  const disposition = patch.disposition ?? (rec?.answeredAt ? "ANSWERED" : "NO_ANSWER");
  await db.callRecord
    .update({
      where: { id },
      data: { endedAt: now, durationSec, billSec, ...patch, disposition },
    })
    .catch(() => {});
}
