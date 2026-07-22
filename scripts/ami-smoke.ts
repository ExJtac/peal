import "dotenv/config";
import { pjsipNotify } from "@/telephony/ami";

// Live AMI smoke: logs into AMI and sends a check-sync NOTIFY to an endpoint. Requires the VM's
// manager.conf applied + AMI reachable at AMI_HOST:AMI_PORT (127.0.0.1:5038 via the Lima forward)
// + AMI_PASSWORD set in .env. A valid realtime endpoint returns Success even with no phone
// registered (Asterisk simply has no contact to notify). Usage:
//   npm run smoke:ami -- <extension> [resync|reboot]
async function main() {
  const ext = process.argv[2] ?? "2001";
  const mode = (process.argv[3] as "resync" | "reboot") ?? "resync";
  const host = process.env.AMI_HOST ?? "127.0.0.1";
  const port = process.env.AMI_PORT ?? "5038";
  console.log(`AMI PJSIPNotify → endpoint ${ext} (${mode}) via ${host}:${port}`);
  const r = await pjsipNotify(ext, mode);
  console.log(r.ok ? `✅ ${r.message}` : `❌ ${r.message}`);
  process.exit(r.ok ? 0 : 1);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
