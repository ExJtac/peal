// Live smoke for call parking. Dials a caller into the park orbit (7000) — it should be parked on
// MOH at slot 7001 — then dials a second caller to slot 7001 to retrieve it, and checks the two are
// bridged. Opt-in.  npm run ari  then  npm run smoke:park
import "dotenv/config";
import WebSocket from "ws";

const USER = process.env.ARI_USER ?? "pbx";
const PASS = process.env.ARI_PASSWORD ?? "";
const HTTP = process.env.ARI_HTTP_URL ?? "http://127.0.0.1:8088";
const APP = "park-smoke";
const ORBIT = process.env.PARK_ORBIT ?? "7000";
const SLOT = process.env.PARK_SLOT_START ?? "7001";
const auth = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

async function ari<T>(method: string, path: string): Promise<T> {
  const res = await fetch(`${HTTP}/ari${path}`, { method, headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`ARI ${method} ${path} -> ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}
const qs = (o: Record<string, string>) => "?" + new URLSearchParams(o).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bridges = () => ari<{ id: string; channels: string[] }[]>("GET", "/bridges");
const maxChannels = (bs: { channels: string[] }[]) => bs.reduce((m, b) => Math.max(m, b.channels?.length ?? 0), 0);

async function main() {
  const wsUrl = `${HTTP.replace(/^http/, "ws")}/ari/events?app=${APP}&api_key=${encodeURIComponent(`${USER}:${PASS}`)}&subscribeAll=true`;
  const ws = new WebSocket(wsUrl);
  const legs = new Set<string>();
  ws.on("message", async (d: WebSocket.RawData) => {
    const ev = JSON.parse(d.toString());
    if (ev.type === "StasisStart" && legs.has(ev.channel?.id)) await ari("POST", `/channels/${ev.channel.id}/answer`).catch(() => {});
  });
  await new Promise((r) => ws.once("open", r));

  // 1) park
  const a = await ari<{ id: string }>("POST", `/channels${qs({ endpoint: `Local/${ORBIT}@from-internal`, app: APP, appArgs: "park", timeout: "30" })}`);
  legs.add(a.id);
  await sleep(3000);
  const parked = maxChannels(await bridges()) >= 1;
  console.log(`[park-smoke] after dialing orbit ${ORBIT}: parked on a bridge = ${parked}`);

  // 2) retrieve
  const b = await ari<{ id: string }>("POST", `/channels${qs({ endpoint: `Local/${SLOT}@from-internal`, app: APP, appArgs: "retrieve", timeout: "30" })}`);
  legs.add(b.id);
  await sleep(3000);
  const bridged = maxChannels(await bridges()) >= 2;
  console.log(`[park-smoke] after dialing slot ${SLOT}: two parties bridged = ${bridged}`);

  // 3) teardown
  for (const id of legs) await ari("DELETE", `/channels/${id}`).catch(() => {});
  await sleep(2500);
  const cleared = maxChannels(await bridges()) === 0;
  console.log(`[park-smoke] after hangup: parking bridge cleared = ${cleared}`);

  const pass = parked && bridged && cleared;
  console.log(
    `\n=== ${pass ? "✅ PASS" : "❌ FAIL"} ===\n` +
      `  caller parked on hold:       ${parked ? "✅" : "❌"}\n` +
      `  retrieved + bridged to peer: ${bridged ? "✅" : "❌"}\n` +
      `  bridge cleared on hangup:    ${cleared ? "✅" : "❌"}`,
  );
  ws.close();
  process.exit(pass ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(2);
});
