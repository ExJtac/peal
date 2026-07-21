import "dotenv/config";
import { ari } from "@/telephony/ariClient";
import { db } from "@/lib/db";

// Opt-in LIVE outbound-PSTN smoke. Places a REAL call out a configured SIP trunk to a real phone
// number, so it costs a few cents of ITSP credit and requires a working trunk (registered or
// IP-authed) in the VM. It proves the trunk actually carries a call to the PSTN and the far end
// rings — the one thing the offline suite and mock ARI can never verify.
//
//   npx tsx scripts/pstn-smoke.ts +15125551234 [trunk-name]
//
// On answer the callee hears the "hello-world" demo (Stasis "spine" branch), then it hangs up.
// If no trunk name is given, the first enabled trunk is used. Caller-ID is the trunk's first DID
// (falls back to the number you dial from), so it presents a number the ITSP will accept.

const RING_TIMEOUT_S = 40;

async function main() {
  const dialed = process.argv[2];
  if (!dialed) {
    console.error("Usage: tsx scripts/pstn-smoke.ts <E.164 number> [trunk-name]\n" + "  e.g. tsx scripts/pstn-smoke.ts +15125551234 telnyx-primary");
    process.exit(2);
  }
  const trunkName = process.argv[3];

  console.log("ARI reachable:", await ari.ping());
  if (!(await ari.ping())) {
    console.error("Cannot reach ARI — is the VM up and `npm run ari` running? Check ARI_HTTP_URL / ARI_USER / ARI_PASSWORD.");
    process.exit(1);
  }

  // Resolve the trunk from our config truth.
  const trunk = trunkName
    ? await db.trunk.findUnique({ where: { name: trunkName } })
    : await db.trunk.findFirst({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  if (!trunk) {
    console.error(trunkName ? `No trunk named "${trunkName}".` : "No enabled trunk configured. Add one at /trunks first.");
    process.exit(1);
  }
  if (!trunk.enabled) {
    console.error(`Trunk "${trunk.name}" is disabled — enable it at /trunks first.`);
    process.exit(1);
  }
  const did = await db.did.findFirst({ where: { trunkId: trunk.id }, orderBy: { e164: "asc" } });
  const callerId = did?.e164 ?? undefined;

  console.log("─".repeat(64));
  console.log(`Trunk:      ${trunk.name} (${trunk.provider}, ${trunk.authMode}, ${trunk.transport} → ${trunk.sipServer}:${trunk.port})`);
  console.log(`Dialing:    ${dialed}`);
  console.log(`Caller-ID:  ${callerId ?? "(trunk default)"}`);
  console.log("─".repeat(64));

  // Reminder if this is an IP-auth trunk on the NAT'd dev VM (a common "why won't it work" trap).
  if (trunk.authMode === "IP_AUTH") {
    console.log("⚠️  IP_AUTH trunk: outbound may work, but INBOUND needs the ITSP to reach this host's");
    console.log("    public IP. On the double-NAT dev VM, prefer a REGISTER trunk. See TRUNK-SETUP.md.\n");
  }

  const ch = await ari.originate({
    endpoint: `PJSIP/${dialed}@${trunk.name}`,
    appArgs: "spine", // on answer: play hello-world demo, then hang up
    callerId,
    timeout: RING_TIMEOUT_S,
  });
  console.log(`Originated channel ${ch.id} (${ch.name}). Watching call state…\n`);

  // Poll channel state until it goes Up (answered) or disappears (hung up / rejected).
  const started = Date.now();
  let lastState = "";
  let sawRinging = false;
  let sawUp = false;
  while (Date.now() - started < (RING_TIMEOUT_S + 5) * 1000) {
    const c = await ari.getChannel(ch.id).catch(() => null);
    if (!c) {
      console.log("Channel ended.");
      break;
    }
    if (c.state !== lastState) {
      console.log(`  [${new Date().toISOString().slice(11, 19)}] state: ${c.state}`);
      lastState = c.state ?? "";
      if (/Ring/i.test(c.state ?? "")) sawRinging = true;
      if (/Up/i.test(c.state ?? "")) sawUp = true;
    }
    if (sawUp) {
      console.log("\n✅ Call ANSWERED — the trunk carried a call to the PSTN. (Callee hears the demo, then hangup.)");
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!sawUp) {
    console.log(sawRinging ? "\n📞 Far end RANG but was not answered (that still proves the trunk works)." : "\n❌ Never rang — trunk likely rejected the call. Check registration / IP-auth / dialed-number format.");
    console.log("   VM diagnostics: asterisk -rx 'pjsip show registrations' | 'pjsip set logger on' to watch SIP.");
  }
  await ari.hangup(ch.id).catch(() => {});

  console.log("\n" + "─".repeat(64));
  console.log("INBOUND test (do this next, by hand):");
  console.log("  1. Add your DID at /dids and an inbound route (DID → an extension / IVR / AI agent) at /inbound.");
  console.log("  2. From any phone, call your DID.");
  console.log("  3. It should ring the mapped destination. Watch `npm run ari` logs + /reporting.");
  console.log("  For a REGISTER trunk behind NAT this works with no port-forward; for IP_AUTH it will not.");
  console.log("─".repeat(64));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
