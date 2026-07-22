import { existsSync, readFileSync } from "node:fs";
import { SECRET_KEYS, genSecret } from "./lib/secrets";

// Prints strong secrets to paste into .env. Never writes .env (so it can't clobber a live config).
// Each value is 32 random bytes base64 — the `openssl rand -base64 32` convention used in .env.example.
// (To WRITE these into .env + the Asterisk configs automatically, use `npm run secrets:write`.)

function envPopulated(): boolean {
  if (!existsSync(".env")) return false;
  // "populated" = a non-empty CRED_SECRET or AUTH_SECRET line (ignores commented lines).
  return /^\s*(CRED_SECRET|AUTH_SECRET)\s*=\s*["']?[^"'\s#]/m.test(readFileSync(".env", "utf8"));
}

console.log("# Strong secrets — paste the ones you need into .env:\n");
for (const k of SECRET_KEYS) console.log(`${k}="${genSecret()}"`);
if (envPopulated()) {
  console.log("\n# ⚠ .env already has CRED_SECRET/AUTH_SECRET set — this script does NOT modify .env.");
  console.log("# Copy only what you intend to change. Rotating CRED_SECRET? Use `npm run rotate:cred-secret`.");
  console.log("# ARI_PASSWORD/AMI_PASSWORD must also be set in the VM's ari.conf / manager.conf to match.");
}
