import "dotenv/config";
import { startAriConnection } from "@/telephony/connection";
import { ari } from "@/telephony/ariClient";
import { setStatus } from "@/telephony/status";
import { drainAgents } from "@/telephony/realtime-media/agentRegistry";

// The call-control daemon. Connects to Asterisk's ARI, streams events into the dispatcher, and
// drives every call. Run EXACTLY ONE (tsx restart orphans children — pkill -f "worker/ari" first).
console.log("[ari] starting call-control daemon…");
const stop = startAriConnection();

const HEARTBEAT_MS = 10_000;
const timer = setInterval(async () => {
  await setStatus({ asteriskReachable: await ari.ping() });
}, HEARTBEAT_MS);

function shutdown() {
  console.log("[ari] shutting down…");
  clearInterval(timer);
  // Best-effort: reroute any live AI-receptionist calls to their fallback before we drop the WS.
  void drainAgents()
    .catch(() => {})
    .finally(() => {
      stop();
      void setStatus({ ariConnected: false }).finally(() => process.exit(0));
    });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
