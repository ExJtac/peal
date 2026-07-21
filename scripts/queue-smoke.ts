// Live smoke for the call-queue (ACD) engine. Drives a REAL call through the running ARI daemon
// into a QUEUE destination and proves the live path: the caller is answered + held on a MOH bridge,
// a QueueCallLog row is created (dialQueue ran in the daemon), an agent leg is originated, and on
// caller hangup the call is logged ABANDONED (onQueueCallerEnded ran). A real agent ANSWER +
// bridge is covered by the offline suite (test/queue.test.ts) — it needs a registered phone to
// pick up, which this headless smoke can't provide. Opt-in.
//
//   npm run ari            # daemon must be running
//   npx tsx scripts/queue-smoke.ts   (or: npm run smoke:queue)
import "dotenv/config";
import WebSocket from "ws";
import { db } from "@/lib/db";

const USER = process.env.ARI_USER ?? "pbx";
const PASS = process.env.ARI_PASSWORD ?? "";
const HTTP = process.env.ARI_HTTP_URL ?? "http://127.0.0.1:8088";
const APP = "queue-smoke";
const DID = "5559200";
const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function ari<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`${HTTP}/ari${path}`, { method, headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`ARI ${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function setup(): Promise<string> {
  // A demo queue "700" with one member (ext 1001 from the seed — it won't answer headlessly, which
  // is fine: we're proving the caller reaches the queue + is held, not the agent bridge).
  const member = await db.extension.findFirst({ where: { number: "1001" } });
  const queue = await db.queue.upsert({
    where: { number: "700" },
    update: { name: "Smoke Queue", strategy: "RINGALL", joinEmpty: true, announcePosition: false },
    create: { number: "700", name: "Smoke Queue", strategy: "RINGALL", joinEmpty: true, announcePosition: false },
  });
  if (member) {
    await db.queueMember.upsert({
      where: { queueId_extensionId: { queueId: queue.id, extensionId: member.id } },
      update: {},
      create: { queueId: queue.id, extensionId: member.id, order: 0 },
    });
  }
  const route = await db.inboundRoute.upsert({
    where: { id: "queue-smoke-route" },
    update: { destinationType: "QUEUE", destinationId: queue.id },
    create: { id: "queue-smoke-route", name: "Queue smoke", destinationType: "QUEUE", destinationId: queue.id },
  });
  await db.did.upsert({
    where: { e164: DID },
    update: { inboundRouteId: route.id },
    create: { e164: DID, description: "Queue smoke", inboundRouteId: route.id },
  });
  return queue.id;
}

async function main() {
  const queueId = await setup();
  console.log(`[queue-smoke] queue ${queueId}, DID ${DID} → QUEUE`);
  const since = new Date();

  // Keep the far (PSTN-side) leg up: answer it on StasisStart so the Local channel stays connected
  // and the caller sits on hold instead of collapsing mid-setup.
  const wsUrl = `${HTTP.replace(/^http/, "ws")}/ari/events?app=${APP}&api_key=${encodeURIComponent(`${USER}:${PASS}`)}&subscribeAll=true`;
  const ws = new WebSocket(wsUrl);
  let farLeg = "";
  ws.on("message", async (d: WebSocket.RawData) => {
    const ev = JSON.parse(d.toString());
    if (ev.type === "StasisStart" && ev.channel?.id === farLeg) {
      await ari("POST", `/channels/${farLeg}/answer`).catch(() => {});
    }
  });
  await new Promise((r) => ws.once("open", r));

  // Originate a caller: the ;2 leg enters Stasis(pbx-app, inbound, DID) → daemon routes to the queue.
  const ch = await ari<{ id: string }>(
    "POST",
    `/channels${qs({ endpoint: `Local/${DID}@from-trunk`, app: APP, appArgs: "caller", timeout: "30" })}`,
  );
  farLeg = ch.id;
  console.log(`[queue-smoke] originated caller far leg ${farLeg}`);
  await sleep(3500); // let the daemon answer + hold + create the log + ring the agent

  const bridges = await ari<{ id: string; bridge_type?: string; channels: string[] }[]>("GET", "/bridges");
  const held = bridges.filter((b) => b.channels && b.channels.length > 0);
  const logDuringCall = await db.queueCallLog.findFirst({ where: { queueId, enteredAt: { gte: since } }, orderBy: { enteredAt: "desc" } });
  console.log(`[queue-smoke] during call: ${held.length} non-empty bridge(s); QueueCallLog row=${logDuringCall ? "yes" : "no"} answeredAt=${logDuringCall?.answeredAt ? "yes" : "no"}`);

  // Hang up the caller → onQueueCallerEnded → ABANDONED.
  await ari("DELETE", `/channels/${farLeg}`).catch(() => {});
  await sleep(2500);

  const logAfter = logDuringCall ? await db.queueCallLog.findUnique({ where: { id: logDuringCall.id } }) : null;
  console.log(`[queue-smoke] after hangup: outcome=${logAfter?.outcome ?? "—"} endedAt=${logAfter?.endedAt ? "yes" : "no"}`);

  const reachedQueue = !!logDuringCall; // dialQueue created the row in the live daemon
  const wasHeld = held.length >= 1; // caller sat in a (MOH) bridge
  const abandonedLogged = logAfter?.outcome === "ABANDONED"; // onQueueCallerEnded ran live
  const pass = reachedQueue && wasHeld && abandonedLogged;
  console.log(
    `\n=== ${pass ? "✅ PASS" : "❌ FAIL"} ===\n` +
      `  caller reached queue (dialQueue live):   ${reachedQueue ? "✅" : "❌"}\n` +
      `  caller held on a bridge:                 ${wasHeld ? "✅" : "❌"}\n` +
      `  abandon logged on hangup (teardown live): ${abandonedLogged ? "✅" : "❌"}`,
  );

  ws.close();
  await db.$disconnect().catch(() => {});
  process.exit(pass ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
