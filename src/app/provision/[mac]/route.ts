import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { normalizeMac } from "@/lib/ids";
import { verifyProvisioningToken } from "@/provisioning/secrets";
import { loadProvisioning } from "@/provisioning/context";
import { getRenderer } from "@/provisioning/registry";

export const dynamic = "force-dynamic";

// Serves a phone its per-MAC config over HTTP(S). Guarded by a per-device token so one phone
// can't fetch another's SIP credentials. Phones request "<mac>.cfg?token=…".
export async function GET(req: NextRequest, ctx: { params: Promise<{ mac: string }> }) {
  const { mac: raw } = await ctx.params;
  const mac = normalizeMac(raw.replace(/\.cfg$/i, ""));
  const token = req.nextUrl.searchParams.get("token") ?? "";

  if (!verifyProvisioningToken(mac, token)) return new Response("Forbidden", { status: 403 });

  const loaded = await loadProvisioning(mac);
  if (!loaded) return new Response("Not found", { status: 404 });

  const renderer = getRenderer(loaded.device.vendor);
  if (!renderer) return new Response("Unsupported vendor", { status: 400 });

  const cfg = renderer.render(loaded.device, loaded.ctx);
  await db.device
    .update({
      where: { mac },
      data: {
        lastProvisionedAt: new Date(),
        lastProvisionedIp: req.headers.get("x-forwarded-for") ?? "",
        lastUserAgent: req.headers.get("user-agent") ?? "",
      },
    })
    .catch(() => {});

  return new Response(new Uint8Array(cfg.body), {
    status: 200,
    headers: { "Content-Type": cfg.contentType, "X-Content-Type-Options": "nosniff" },
  });
}
