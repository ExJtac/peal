import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSecrets } from "../scripts/write-secrets";
import { SECRET_KEYS, isPlaceholderValue } from "../scripts/lib/secrets";

// Mirrors the real fixtures: .env.example placeholder values + the ari.conf/manager.conf CHANGEME markers.
const ENV_FIXTURE = `# header comment
DATABASE_URL="postgresql://james@localhost:5432/pbx?schema=public"
AUTH_SECRET="generate-with: openssl rand -base64 32"
CRED_SECRET=""
APP_URL="http://localhost:3001"
ARI_PASSWORD=""
AMI_PASSWORD=""         # must equal manager.conf secret
SEED_PASSWORD=""
PROVISION_SECRET=""
E911_NOTIFY_TOKEN=""
`;
const ARI_FIXTURE = `[general]
enabled = yes
[pbx]
type = user
password = CHANGEME_ARI_PASSWORD
`;
const MANAGER_FIXTURE = `[general]
enabled = yes
port = 5038
[pbx-ctl]
secret = CHANGEME_AMI_PASSWORD
read = system,call
`;

function envVal(content: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n#]*)`, "m").exec(content);
  return m ? m[1].trim() : undefined;
}
function sectionVal(content: string, section: string, key: string): string | undefined {
  let cur = "";
  for (const raw of content.split("\n")) {
    const s = raw.trim();
    const sec = /^\[([^\]]+)\]/.exec(s);
    if (sec) {
      cur = sec[1];
      continue;
    }
    if (cur === section) {
      const m = new RegExp(`^${key}\\s*=\\s*(.*)$`).exec(s);
      if (m) return m[1].trim();
    }
  }
  return undefined;
}

describe("write-secrets", () => {
  let dir: string, envPath: string, ariPath: string, managerPath: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "peal-secrets-"));
    envPath = join(dir, ".env");
    ariPath = join(dir, "ari.conf");
    managerPath = join(dir, "manager.conf");
    writeFileSync(envPath, ENV_FIXTURE);
    writeFileSync(ariPath, ARI_FIXTURE);
    writeFileSync(managerPath, MANAGER_FIXTURE);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("fills every secret key with a real (non-placeholder) value", () => {
    const r = writeSecrets({ envPath, ariPath, managerPath });
    const env = readFileSync(envPath, "utf8");
    for (const k of SECRET_KEYS) {
      const v = envVal(env, k);
      expect(v, k).toBeTruthy();
      expect(isPlaceholderValue(v), `${k} should not be a placeholder`).toBe(false);
    }
    expect(r.generated).toEqual([...SECRET_KEYS]); // all 7 fixtures were placeholders
    expect(r.preserved).toEqual([]);
  });

  it("fans ARI/AMI passwords into the Asterisk configs so they MATCH .env", () => {
    writeSecrets({ envPath, ariPath, managerPath });
    const env = readFileSync(envPath, "utf8");
    expect(sectionVal(readFileSync(ariPath, "utf8"), "pbx", "password")).toBe(envVal(env, "ARI_PASSWORD"));
    expect(sectionVal(readFileSync(managerPath, "utf8"), "pbx-ctl", "secret")).toBe(envVal(env, "AMI_PASSWORD"));
    expect(sectionVal(readFileSync(ariPath, "utf8"), "pbx", "password")).not.toBe("CHANGEME_ARI_PASSWORD");
  });

  it("preserves an existing real secret (never rotates it)", () => {
    const strong = "K".repeat(44);
    writeFileSync(envPath, ENV_FIXTURE.replace('CRED_SECRET=""', `CRED_SECRET="${strong}"`));
    const r = writeSecrets({ envPath, ariPath, managerPath });
    expect(envVal(readFileSync(envPath, "utf8"), "CRED_SECRET")).toBe(strong);
    expect(r.preserved).toContain("CRED_SECRET");
    expect(r.generated).not.toContain("CRED_SECRET");
  });

  it("is idempotent — a second run changes nothing", () => {
    writeSecrets({ envPath, ariPath, managerPath });
    const firstEnv = readFileSync(envPath, "utf8");
    const firstAri = readFileSync(ariPath, "utf8");
    const r2 = writeSecrets({ envPath, ariPath, managerPath });
    expect(readFileSync(envPath, "utf8")).toBe(firstEnv);
    expect(readFileSync(ariPath, "utf8")).toBe(firstAri);
    expect(r2.generated).toEqual([]);
    expect(r2.preserved).toEqual([...SECRET_KEYS]);
  });

  it("reports missing conf files instead of throwing", () => {
    const r = writeSecrets({ envPath, ariPath: join(dir, "nope.conf"), managerPath });
    expect(r.skipped).toContain(join(dir, "nope.conf"));
    expect(r.fannedOut).toContain(managerPath);
  });
});
