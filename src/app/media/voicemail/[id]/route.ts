import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ari } from "@/telephony/ariClient";

export const dynamic = "force-dynamic";

// Streams a voicemail recording (downloaded from Asterisk via ARI). Allowed for a Manager/Admin,
// or the portal user who owns the mailbox.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  const vm = await db.voicemailMessage.findUnique({ where: { id }, include: { box: true } });
  if (!vm) return new Response("Not found", { status: 404 });

  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const isOwner = !!user.extensionId && user.extensionId === vm.box.extensionId;
  if (!isManager && !isOwner) return new Response("Forbidden", { status: 403 });

  const buf = await ari.getStoredRecordingFile(vm.audioPath).catch(() => null);
  if (!buf) return new Response("Recording unavailable", { status: 404 });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { "Content-Type": "audio/wav", "X-Content-Type-Options": "nosniff" },
  });
}
