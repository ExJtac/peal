import "dotenv/config";
import { ari } from "@/telephony/ariClient";

// Phase-0 spine check. Originates a call to a SIP endpoint into our Stasis app; on answer the
// app plays a demo message (routing "spine" branch). Proves ARI ↔ our app ↔ media end-to-end.
//   tsx scripts/originate-test.ts PJSIP/1001
async function main() {
  const endpoint = process.argv[2] || "PJSIP/1001";
  const reachable = await ari.ping();
  console.log("ARI reachable:", reachable);
  if (!reachable) {
    console.error("Cannot reach ARI. Check ARI_HTTP_URL / ARI_USER / ARI_PASSWORD and that Asterisk is up.");
    process.exit(1);
  }
  const info = await ari.info();
  console.log("Asterisk version:", info.system?.version ?? "unknown");
  console.log(`Originating to ${endpoint} → Stasis(pbx-app, spine)…`);
  const ch = await ari.originate({ endpoint, appArgs: "spine", timeout: 30 });
  console.log(`Originated channel ${ch.id} (${ch.name}). Answer the phone to hear the demo message.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
