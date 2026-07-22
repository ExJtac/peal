import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { SECRET_KEYS, genSecret, isPlaceholderValue } from "./lib/secrets";

// Generate-once + fan-out of the app secrets. Unlike gen-secrets.ts (print-only, never touches
// files), this WRITES: it fills the 7 secret keys in .env and mirrors ARI_PASSWORD/AMI_PASSWORD
// into the Asterisk configs so .env ↔ ari.conf ↔ manager.conf always match. Idempotent — a value
// that's already a real (non-placeholder) secret is preserved, never rotated, so re-runs converge.
// (/etc/pbx/pbx.env inherits by copy from install-control-plane.sh, so no third write is needed.)

export interface WriteSecretsOptions {
  envPath?: string; // default .env
  ariPath?: string; // default /etc/asterisk/ari.conf — [pbx] password
  managerPath?: string; // default /etc/asterisk/manager.conf — [pbx-ctl] secret
}

export interface WriteSecretsResult {
  generated: string[]; // keys freshly generated this run
  preserved: string[]; // keys kept from an existing real value
  fannedOut: string[]; // conf files updated
  skipped: string[]; // conf files that were absent
}

// --- .env value read (first UNcommented KEY= line; strips quotes + inline comment) ---
function parseEnvValue(content: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, "m").exec(content);
  if (!m) return undefined;
  return unquote(m[1]);
}

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) return v.slice(1, v.indexOf('"', 1) === -1 ? v.length : v.indexOf('"', 1));
  if (v.startsWith("'")) return v.slice(1, v.indexOf("'", 1) === -1 ? v.length : v.indexOf("'", 1));
  const inlineComment = v.search(/\s+#/);
  return (inlineComment >= 0 ? v.slice(0, inlineComment) : v).trim();
}

// Replace the KEY= line in place (preserving comments/order), else append. Function replacer so
// base64 values (which contain + / =) are inserted literally, never treated as $-backreferences.
function upsertEnv(content: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  if (re.test(content)) return content.replace(re, () => line);
  const sep = content === "" || content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${line}\n`;
}

// Replace `key = value` within [section] of an INI-ish conf, line-level (skips ; comments).
function replaceInSection(content: string, section: string, key: string, value: string): { text: string; changed: boolean } {
  const lines = content.split("\n");
  const keyRe = new RegExp(`^(\\s*${key}\\s*=\\s*).*$`);
  let cur = "";
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const sec = /^\[([^\]]+)\]/.exec(trimmed);
    if (sec) {
      cur = sec[1];
      continue;
    }
    if (cur === section && !trimmed.startsWith(";") && keyRe.test(lines[i])) {
      lines[i] = lines[i].replace(keyRe, (_m, p1) => `${p1}${value}`);
      changed = true;
    }
  }
  return { text: lines.join("\n"), changed };
}

export function writeSecrets(opts: WriteSecretsOptions = {}): WriteSecretsResult {
  const envPath = opts.envPath ?? ".env";
  const ariPath = opts.ariPath ?? "/etc/asterisk/ari.conf";
  const managerPath = opts.managerPath ?? "/etc/asterisk/manager.conf";

  let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const generated: string[] = [];
  const preserved: string[] = [];
  const resolved: Record<string, string> = {};

  for (const key of SECRET_KEYS) {
    const current = parseEnvValue(env, key);
    if (isPlaceholderValue(current)) {
      resolved[key] = genSecret();
      generated.push(key);
    } else {
      resolved[key] = current as string;
      preserved.push(key);
    }
    env = upsertEnv(env, key, resolved[key]);
  }

  writeFileSync(envPath, env, { mode: 0o600 });
  try {
    chmodSync(envPath, 0o600); // enforce on a pre-existing file too
  } catch {
    /* best effort — non-fatal */
  }

  const fannedOut: string[] = [];
  const skipped: string[] = [];

  const fanOut = (path: string, section: string, key: string, value: string) => {
    if (!existsSync(path)) {
      skipped.push(path);
      return;
    }
    writeFileSync(path, replaceInSection(readFileSync(path, "utf8"), section, key, value).text);
    fannedOut.push(path);
  };
  fanOut(ariPath, "pbx", "password", resolved.ARI_PASSWORD);
  fanOut(managerPath, "pbx-ctl", "secret", resolved.AMI_PASSWORD);

  return { generated, preserved, fannedOut, skipped };
}

function parseArgs(argv: string[]): WriteSecretsOptions {
  const o: WriteSecretsOptions = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--env") o.envPath = argv[++i];
    else if (argv[i] === "--ari") o.ariPath = argv[++i];
    else if (argv[i] === "--manager") o.managerPath = argv[++i];
  }
  return o;
}

function main() {
  const r = writeSecrets(parseArgs(process.argv.slice(2)));
  console.log("write-secrets:");
  console.log(`  .env: ${r.generated.length} generated, ${r.preserved.length} preserved`);
  if (r.generated.length) console.log(`    generated: ${r.generated.join(", ")}`);
  if (r.preserved.length) console.log(`    preserved: ${r.preserved.join(", ")}`);
  for (const f of r.fannedOut) console.log(`  fanned out → ${f}`);
  for (const s of r.skipped) console.log(`  ⚠ not found (skipped): ${s}`);
  console.log("  (secret VALUES are never printed)");
}

// Run only when invoked directly (tsx scripts/write-secrets.ts), not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) main();
