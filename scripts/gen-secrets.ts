import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

// Prints strong secrets to paste into .env. Never writes .env (so it can't clobber a live config).
// Each value is 32 random bytes base64 — the `openssl rand -base64 32` convention used in .env.example.
const KEYS = ["AUTH_SECRET", "CRED_SECRET", "ARI_PASSWORD", "AMI_PASSWORD", "SEED_PASSWORD", "PROVISION_SECRET", "E911_NOTIFY_TOKEN"];

function gen(): string {
  return randomBytes(32).toString("base64");
}

function envPopulated(): boolean {
  if (!existsSync(".env")) return false;
  // "populated" = a non-empty CRED_SECRET or AUTH_SECRET line (ignores commented lines).
  return /^\s*(CRED_SECRET|AUTH_SECRET)\s*=\s*["']?[^"'\s#]/m.test(readFileSync(".env", "utf8"));
}

console.log("# Strong secrets — paste the ones you need into .env:\n");
for (const k of KEYS) console.log(`${k}="${gen()}"`);
if (envPopulated()) {
  console.log("\n# ⚠ .env already has CRED_SECRET/AUTH_SECRET set — this script does NOT modify .env.");
  console.log("# Copy only what you intend to change. Rotating CRED_SECRET? Use `npm run rotate:cred-secret`.");
  console.log("# ARI_PASSWORD/AMI_PASSWORD must also be set in the VM's ari.conf / manager.conf to match.");
}
