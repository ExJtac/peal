// SystemStatus singleton writer — the ARI daemon's heartbeat, read by the admin UI so an
// operator can see at a glance whether the call engine is connected and how many calls are live.
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function setStatus(patch: Prisma.SystemStatusUncheckedUpdateInput): Promise<void> {
  await db.systemStatus
    .upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...(patch as Prisma.SystemStatusUncheckedCreateInput) },
      update: patch,
    })
    .catch(() => {});
}
