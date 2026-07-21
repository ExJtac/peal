// Live smoke for conferencing. Dials TWO real callers into conference 800 (via [from-internal] →
// routeInternal → joinConference) and verifies both land in ONE mixing bridge, then that the bridge
// is torn down when they leave. Opt-in.  npm run ari  then  npm run smoke:conf
import "dotenv/config";
import WebSocket from "ws";
import { db } from "@/lib/db";

const USER = process.env.ARI_USER ?? "pbx";
const PASS = process.env.ARI_PASSWORD ?? "";
const HTTP = process.env.ARI_HTTP_URL ?? "http://127.0.0.1:8088";
const APP = "conf-smoke";
const CONF = "800";
const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function ari<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`${HTTP}/ari${path}`, { method, headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`ARI ${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await db.conference.upsert({ where: { number: CONF }, update: { name: "Smoke Conf" }, create: { number: CONF, name: "Smoke Conf" } });
  console.log(`[conf-smoke] conference ${CONF}`);

  const wsUrl = `${HTTP.replace(/^http/, "ws")}/ari/events?app=${APP}&api_key=${encodeURIComponent(`${USER}:${PASS}`)}&subscribeAll=true`;
  const ws = new WebSocket(wsUrl);
  const farLegs = new Set<string>();
  ws.on("message", async (d: WebSocket.RawData) => {
    const ev = JSON.parse(d.toString());
    if (ev.type === "StasisStart" && farLegs.has(ev.channel?.id)) {
      await ari("POST", `/channels/${ev.channel.id}/answer`).catch(() => {});
    }
  });
  await new Promise((r) => ws.once("open", r));

  for (let i = 0; i < 2; i++) {
    const ch = await ari<{ id: string }>("POST", `/channels${qs({ endpoint: `Local/${CONF}@from-internal`, app: APP, appArgs: "caller", timeout: "30" })}`);
    farLegs.add(ch.id);
    await sleep(500);
  }
  console.log(`[conf-smoke] dialed 2 callers into ${CONF}`);
  await sleep(3000);

  const bridges = await ari<{ id: string; channels: string[] }[]>("GET", "/bridges");
  const confBridge = bridges.find((b) => b.channels && b.channels.length >= 2);
  console.log(`[conf-smoke] during: mixing bridge with ${confBridge?.channels.length ?? 0} participants`);

  for (const id of farLegs) await ari("DELETE", `/channels/${id}`).catch(() => {});
  await sleep(2500);
  const after = await ari<{ id: string; channels: string[] }[]>("GET", "/bridges");
  const stillConf = after.find((b) => b.id === confBridge?.id);
  console.log(`[conf-smoke] after hangup: conference bridge ${stillConf ? "still present" : "torn down"}`);

  const joined = (confBridge?.channels.length ?? 0) >= 2;
  const tornDown = !stillConf;
  const pass = joined && tornDown;
  console.log(
    `\n=== ${pass ? "✅ PASS" : "❌ FAIL"} ===\n` +
      `  two callers joined one bridge: ${joined ? "✅" : "❌"}\n` +
      `  bridge torn down on empty:     ${tornDown ? "✅" : "❌"}`,
  );
  ws.close();
  await db.$disconnect().catch(() => {});
  process.exit(pass ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
