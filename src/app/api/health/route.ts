import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await db.systemStatus.findUnique({ where: { id: "singleton" } }).catch(() => null);
  return Response.json({
    ok: true,
    ariConnected: status?.ariConnected ?? false,
    asteriskReachable: status?.asteriskReachable ?? false,
    activeChannels: status?.activeChannels ?? 0,
    updatedAt: status?.updatedAt ?? null,
  });
}
