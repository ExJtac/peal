import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Live wallboard feed: the QueueStatus rows the ARI daemon writes on every state change, merged
// with each queue's name/number. Polled by the wallboard client (~3s). Manager+ only.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const [queues, statuses] = await Promise.all([
    db.queue.findMany({ orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    db.queueStatus.findMany(),
  ]);
  const byId = new Map(statuses.map((s) => [s.queueId, s]));
  const rows = queues.map((q) => {
    const s = byId.get(q.id);
    return {
      id: q.id,
      number: q.number,
      name: q.name,
      waiting: s?.waiting ?? 0,
      longestWaitSec: s?.longestWaitSec ?? 0,
      agentsAvailable: s?.agentsAvailable ?? 0,
      agentsOnCall: s?.agentsOnCall ?? 0,
      agentsPaused: s?.agentsPaused ?? 0,
      answeredToday: s?.answeredToday ?? 0,
      abandonedToday: s?.abandonedToday ?? 0,
      avgWaitSec: s?.avgWaitSec ?? 0,
      updatedAt: s?.updatedAt ?? null,
    };
  });
  return Response.json({ queues: rows });
}
