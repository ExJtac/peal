import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ari } from "@/telephony/ariClient";

export const dynamic = "force-dynamic";

// Streams a call recording (downloaded from Asterisk via ARI). Admin/Manager only.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "MANAGER")) return new Response("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  const rec = await db.callRecord.findUnique({ where: { id }, select: { recordingPath: true } });
  if (!rec?.recordingPath) return new Response("Not found", { status: 404 });

  const buf = await ari.getStoredRecordingFile(rec.recordingPath).catch(() => null);
  if (!buf) return new Response("Recording unavailable", { status: 404 });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": "audio/wav", "X-Content-Type-Options": "nosniff" },
  });
}
