import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { DEV_DEFAULTS } from "./lib/secrets";

// Pre-go-live secret audit. FAILs (exit 1) on unset / dev-default / too-short app secrets; WARNs on
// deployment-sync reminders. Expected to fail on a dev box that still uses the dev-default secrets.

let failed = 0;
const fail = (m: string) => {
  console.log(`  ✗ ${m}`);
  failed++;
};
const warn = (m: string) => console.log(`  ! ${m}`);
const ok = (m: string) => console.log(`  ✓ ${m}`);

function checkStrong(name: string) {
  const v = process.env[name];
  if (!v) return fail(`${name} is not set`);
  if (DEV_DEFAULTS.has(v)) return fail(`${name} is a dev/test default`);
  if (v.length < 24) return fail(`${name} is too short (< 24 chars)`);
  ok(`${name} looks strong`);
}

// Reads the [pbx] password from asterisk/etc/ari.conf (the repo template).
function ariPbxPassword(): string | null {
  const p = "asterisk/etc/ari.conf";
  if (!existsSync(p)) return null;
  let section = "";
  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const s = raw.trim();
    if (!s || s.startsWith(";")) continue;
    const sec = /^\[([^\]]+)\]/.exec(s);
    if (sec) {
      section = sec[1];
      continue;
    }
    if (section === "pbx") {
      const pw = /^password\s*=\s*(.+)$/.exec(s);
      if (pw) return pw[1].trim();
    }
  }
  return null;
}

console.log("Secret audit:");
checkStrong("AUTH_SECRET");
checkStrong("CRED_SECRET");
checkStrong("PROVISION_SECRET");
if (!process.env.ARI_PASSWORD) fail("ARI_PASSWORD is not set");
else ok("ARI_PASSWORD is set");

const ariPw = ariPbxPassword();
if (ariPw === "CHANGEME_ARI_PASSWORD")
  warn("asterisk/etc/ari.conf ships the CHANGEME placeholder — the VM's /etc/asterisk/ari.conf must be set to match ARI_PASSWORD");
else if (ariPw && process.env.ARI_PASSWORD && ariPw !== process.env.ARI_PASSWORD)
  warn("ari.conf [pbx] password != env ARI_PASSWORD (ok if the VM copy is managed separately)");

if (!process.env.AMI_PASSWORD) warn("AMI_PASSWORD is not set — the reboot / force-provision buttons won't reach AMI");
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD === "password123") warn("SEED_PASSWORD is empty or the demo default — rotate the seeded logins");
if (!process.env.E911_NOTIFY_TOKEN) warn("E911_NOTIFY_TOKEN is not set — the Kari's-Law notify POST is skipped");

console.log(failed ? `\n${failed} check(s) FAILED — set strong secrets before going live.` : "\nAll hard checks passed.");
process.exit(failed ? 1 : 0);
