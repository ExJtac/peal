import type { AiJob, AiJobKind } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { db } from "./db";

// DB-backed job queue for ASYNC AI work (voicemail/call transcription + summaries).
// Server Actions + the ARI daemon enqueue; the AI worker claims and processes. Worker-safe.
// Mirrors the video-to-story queue: SELECT … FOR UPDATE SKIP LOCKED so multiple workers
// never grab the same job.

const STALE_LOCK_MS = 5 * 60 * 1000;

export async function enqueueAiJob(kind: AiJobKind, payload: Record<string, unknown>): Promise<AiJob> {
  return db.aiJob.create({ data: { kind, payload: payload as Prisma.InputJsonValue, status: "QUEUED" } });
}

export async function claimAiJob(workerId: string): Promise<AiJob | null> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "AiJob" AS j
    SET status = 'RUNNING',
        "lockedBy" = ${workerId},
        "lockedAt" = now(),
        attempts = j.attempts + 1,
        "startedAt" = COALESCE(j."startedAt", now()),
        "updatedAt" = now()
    WHERE j.id = (
      SELECT c.id FROM "AiJob" AS c
      WHERE c.status = 'QUEUED'
         OR (c.status = 'RUNNING' AND c."lockedAt" < ${staleBefore})
      ORDER BY c."createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j.id;
  `;
  if (rows.length === 0) return null;
  return db.aiJob.findUnique({ where: { id: rows[0].id } });
}

export async function heartbeatAiJob(id: string, workerId: string): Promise<void> {
  await db.aiJob.updateMany({ where: { id, lockedBy: workerId }, data: { lockedAt: new Date() } });
}

export async function completeAiJob(id: string): Promise<void> {
  await db.aiJob.update({
    where: { id },
    data: { status: "DONE", progress: 100, finishedAt: new Date(), lockedBy: null },
  });
}

export async function failAiJob(id: string, error: string): Promise<void> {
  await db.aiJob.update({
    where: { id },
    data: { status: "FAILED", lastError: error.slice(0, 2000), finishedAt: new Date(), lockedBy: null },
  });
}
