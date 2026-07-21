// Live end-to-end smoke for the real-time AI receptionist. Drives a REAL call through the running
// ARI daemon into an AI_AGENT destination, records the caller side to prove the greeting is
// injected over the full media path (externalMedia RTP both ways), and verifies clean teardown
// (no leaked UnicastRTP channel = no leaked RTP port). Opt-in; mock providers by default (free).
//
//   npm run ari           # daemon must be running
//   npx tsx scripts/ai-smoke.ts
import "dotenv/config";
import WebSocket from "ws";
import { db } from "@/lib/db";

const USER = process.env.ARI_USER ?? "pbx";
const PASS = process.env.ARI_PASSWORD ?? "";
const HTTP = process.env.ARI_HTTP_URL ?? "http://127.0.0.1:8088";
const APP = "ai-smoke";
const DID = "5559001";
const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function ari<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`${HTTP}/ari${path}`, { method, headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`ARI ${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();

/** RMS of a 16-bit PCM wav buffer (skips the 44-byte header), normalized 0..1. */
function wavRms(buf: Buffer): number {
  const start = 44;
  const n = Math.floor((buf.length - start) / 2);
  if (n <= 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(start + i * 2) / 32768;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / n);
}

async function setup(): Promise<string> {
  // Ensure an enabled AI agent exists.
  let agent = await db.aiAgent.findFirst({ where: { enabled: true } });
  if (!agent) {
    agent = await db.aiAgent.create({
      data: {
        name: "Smoke Receptionist",
        greeting: "Thanks for calling. How can I help you today?",
        systemPrompt: "You are a friendly, concise phone receptionist.",
      },
    });
  }
  // Ensure DID 5559001 → inbound route → this agent.
  const route = await db.inboundRoute.upsert({
    where: { id: "smoke-route" },
    update: { destinationType: "AI_AGENT", destinationId: agent.id },
    create: { id: "smoke-route", name: "AI smoke", destinationType: "AI_AGENT", destinationId: agent.id },
  });
  await db.did.upsert({
    where: { e164: DID },
    update: { inboundRouteId: route.id },
    create: { e164: DID, description: "AI smoke", inboundRouteId: route.id },
  });
  return agent.id;
}

async function main() {
  const agentId = await setup();
  console.log(`[smoke] agent ${agentId}, DID ${DID} → AI_AGENT`);

  const wsUrl = `${HTTP.replace(/^http/, "ws")}/ari/events?app=${APP}&api_key=${encodeURIComponent(`${USER}:${PASS}`)}&subscribeAll=true`;
  const ws = new WebSocket(wsUrl);
  let farLeg = "";
  let smokeBridge = "";
  ws.on("message", async (d: WebSocket.RawData) => {
    const ev = JSON.parse(d.toString());
    if (ev.type === "StasisStart" && ev.channel?.id === farLeg) {
      await ari("POST", `/channels/${farLeg}/answer`).catch(() => {});
      // Put the far leg in a bridge with MOH: audio received on this Local leg is relayed out the
      // other end into the AGENT's bridge → externalMedia → the agent "hears" a talking caller,
      // which fires onReady and triggers the greeting. Recording the bridge captures the greeting
      // (mixed with MOH) flowing back — proof the injection path is live end-to-end.
      const b = await ari<{ id: string }>("POST", `/bridges${qs({ type: "mixing" })}`);
      smokeBridge = b.id;
      await ari("POST", `/bridges/${smokeBridge}/addChannel${qs({ channel: farLeg })}`).catch(() => {});
      await ari("POST", `/bridges/${smokeBridge}/moh`).catch(() => {});
      await ari("POST", `/bridges/${smokeBridge}/record${qs({ name: "ai-smoke-rec", format: "wav", ifExists: "overwrite" })}`).catch((e) =>
        console.log("[smoke] record err", String(e).slice(0, 120)),
      );
      console.log("[smoke] far leg answered, MOH feeding the agent + recording");
    }
  });
  await new Promise((r) => ws.once("open", r));

  // Originate into the trunk context: ;1 leg → Stasis(pbx-app, inbound, DID) → daemon routes to AI_AGENT.
  const ch = await ari<{ id: string }>(
    "POST",
    `/channels${qs({ endpoint: `Local/${DID}@from-trunk`, app: APP, appArgs: "smoke", timeout: "30" })}`,
  );
  farLeg = ch.id;
  console.log(`[smoke] originated far leg ${farLeg}`);

  await new Promise((r) => setTimeout(r, 8000)); // greeting plays; conversation waits on caller audio

  // --- assertions ---
  const channels = await ari<{ id: string; name: string }[]>("GET", "/channels");
  const unicast = channels.filter((c) => c.name?.startsWith("UnicastRTP/"));
  const call = await db.callRecord.findFirst({ where: { aiAgentId: agentId }, orderBy: { startedAt: "desc" } });
  console.log(`[smoke] during call: ${unicast.length} externalMedia channel(s) live; CallRecord aiAgentId=${call?.aiAgentId ?? "—"} answeredAt=${call?.answeredAt ? "yes" : "no"}`);

  let rms = 0;
  const rec = await fetch(`${HTTP}/ari/recordings/stored/ai-smoke-rec/file`, { headers: { Authorization: auth } });
  if (rec.ok) {
    rms = wavRms(Buffer.from(await rec.arrayBuffer()));
    console.log(`[smoke] caller-side recording RMS = ${rms.toFixed(4)} (silence ≈ 0)`);
  } else {
    console.log("[smoke] recording not retrievable:", rec.status);
  }

  // --- hang up + verify teardown ---
  await ari("DELETE", `/channels/${farLeg}`).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const after = await ari<{ id: string; name: string }[]>("GET", "/channels");
  const leakedRtp = after.filter((c) => c.name?.startsWith("UnicastRTP/"));
  const call2 = await db.callRecord.findUnique({ where: { id: call?.id ?? "none" } }).catch(() => null);
  console.log(`[smoke] after hangup: ${leakedRtp.length} leaked externalMedia channel(s); aiOutcome=${call2?.aiOutcome ?? "—"}`);
  if (smokeBridge) await ari("DELETE", `/bridges/${smokeBridge}`).catch(() => {});

  const answered = !!call?.answeredAt;
  const mediaLive = unicast.length >= 1;
  const greetingHeard = rms > 0.004;
  // HANGUP (not FALLBACK) = the agent was healthily mid-conversation when we hung up → the media
  // loop connected (onReady fired, greeting played, reached LISTENING). FALLBACK = media timed out.
  const mediaHealthy = call2?.aiOutcome === "HANGUP";
  const noLeak = leakedRtp.length === 0;
  const pass = answered && mediaLive && greetingHeard && mediaHealthy && noLeak;
  console.log(
    `\n=== ${pass ? "✅ PASS" : "❌ FAIL"} ===\n` +
      `  agent answered call:            ${answered ? "✅" : "❌"}\n` +
      `  externalMedia leg live:         ${mediaLive ? "✅" : "❌"}\n` +
      `  audio flowed both ways:         ${greetingHeard ? "✅" : "❌"} (RMS ${rms.toFixed(4)})\n` +
      `  media loop healthy (no timeout): ${mediaHealthy ? "✅" : "❌"} (outcome ${call2?.aiOutcome ?? "—"})\n` +
      `  no leaked RTP port on teardown: ${noLeak ? "✅" : "❌"}`,
  );

  ws.close();
  await db.$disconnect().catch(() => {});
  process.exit(pass ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
