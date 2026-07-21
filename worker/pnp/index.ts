import "dotenv/config";
import dgram from "node:dgram";
import os from "node:os";
import { db } from "@/lib/db";
import { parseSipRequest, macFromUserAgent, build200Ok, buildProfileNotify } from "@/provisioning/sipPnp";
import { provisioningToken } from "@/provisioning/secrets";
import { appUrl } from "@/lib/env";
import { normalizeMac } from "@/lib/ids";

// SIP-PnP responder: answers phones' boot-time multicast SUBSCRIBE (Event: ua-profile) with
// their per-MAC provisioning URL → zero-touch on-LAN. Best-effort; manual URL provisioning is
// the reliable fallback.
const MCAST = "224.0.1.75";
const PORT = 5060;

function localIp(): string {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs ?? []) if (i.family === "IPv4" && !i.internal) return i.address;
  }
  return "127.0.0.1";
}

const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
sock.on("error", (e) => console.error("[pnp] socket error:", e.message));
sock.on("listening", () => {
  try {
    sock.addMembership(MCAST);
  } catch (e) {
    console.error("[pnp] failed to join multicast group:", (e as Error).message);
  }
  console.log(`[pnp] listening for ua-profile SUBSCRIBE on ${MCAST}:${PORT}`);
});
sock.on("message", async (buf, rinfo) => {
  const req = parseSipRequest(buf.toString());
  if (!req || req.method !== "SUBSCRIBE") return;
  if (!(req.headers["event"] ?? "").includes("ua-profile")) return;

  const raw = macFromUserAgent(req.headers["user-agent"]) ?? /([0-9a-fA-F]{12})/.exec(req.uri)?.[1] ?? null;
  if (!raw) return;
  const mac = normalizeMac(raw);
  const dev = await db.device.findUnique({ where: { mac } }).catch(() => null);
  if (!dev) return;

  const url = `${appUrl()}/provision/${mac}?token=${provisioningToken(mac)}`;
  const contact = `${localIp()}:${PORT}`;
  sock.send(build200Ok(req), rinfo.port, rinfo.address);
  sock.send(buildProfileNotify(req, url, contact), rinfo.port, rinfo.address);
  console.log(`[pnp] offered ${mac} → ${url}`);
});
sock.bind(PORT);

process.on("SIGINT", () => {
  sock.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  sock.close();
  process.exit(0);
});
