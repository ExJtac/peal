import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "@/lib/db";
import { evaluateControlPlaneHealth, DEFAULT_STALE_MS } from "@/lib/health";
import { resolveEmail } from "@/ai/providers/email/resolve";
import { EMAIL_FROM, appUrl } from "@/lib/env";

// Control-plane health probe (run by pbx-health.timer every ~2 min). Reads the SystemStatus
// heartbeat the ARI daemon writes; if call control is down or its heartbeat is stale it emails an
// alert via the existing email seam (mock/log default, real SMTP behind SMTP_*). A marker file
// tracks the last alerted state so we send ONE alert on failure + ONE on recovery, not a stream.
//
// Note: this is in-box monitoring — if the whole host is down, nothing runs it. Pair with an
// external uptime check against /api/health for that case (documented in NEXT-STEPS).

const MARKER = process.env.HEALTH_MARKER ?? "/var/lib/pbx/health-alert.state";
const STALE_MS = Number(process.env.HEALTH_STALE_MS ?? DEFAULT_STALE_MS);

function readMarker(): "unhealthy" | null {
  try {
    return readFileSync(MARKER, "utf8").trim() === "unhealthy" ? "unhealthy" : null;
  } catch {
    return null;
  }
}
function setMarker(): void {
  try {
    mkdirSync(dirname(MARKER), { recursive: true });
    writeFileSync(MARKER, "unhealthy\n");
  } catch {
    /* best-effort; if we can't persist, we may re-alert next run — acceptable */
  }
}
function clearMarker(): void {
  try {
    rmSync(MARKER, { force: true });
  } catch {
    /* ignore */
  }
}

async function alertRecipient(): Promise<string | null> {
  if (process.env.ALERT_EMAIL) return process.env.ALERT_EMAIL;
  const admin = await db.user
    .findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } })
    .catch(() => null);
  return admin?.email ?? (EMAIL_FROM || null);
}

async function main(): Promise<void> {
  const status = await db.systemStatus.findUnique({ where: { id: "singleton" } }).catch(() => null);
  const verdict = evaluateControlPlaneHealth(status, Date.now(), STALE_MS);
  const alreadyAlerted = readMarker() === "unhealthy";

  if (!verdict.healthy) {
    console.log(`[health] UNHEALTHY: ${verdict.reasons.join("; ")}`);
    if (alreadyAlerted) {
      console.log("[health] already alerted for this outage — not resending");
      return;
    }
    const to = await alertRecipient();
    if (!to) {
      console.warn("[health] no ALERT_EMAIL / admin email — cannot send alert");
      setMarker();
      return;
    }
    await resolveEmail().send({
      to,
      subject: "[PBX ALERT] Phone system control plane is DOWN",
      text:
        `The PBX control plane failed a health check:\n\n` +
        verdict.reasons.map((r) => `  • ${r}`).join("\n") +
        `\n\nCalls may be degraded (native fallback only — no PSTN/IVR/AI).\n` +
        `Health: ${appUrl()}/api/health\n\n` +
        `On the host: journalctl -u pbx-ari -n 100 ; systemctl status pbx-ari`,
    });
    setMarker();
    console.log(`[health] alert emailed to ${to}`);
    return;
  }

  console.log("[health] OK: ARI connected, Asterisk reachable, heartbeat fresh");
  if (alreadyAlerted) {
    const to = await alertRecipient();
    if (to) {
      await resolveEmail().send({
        to,
        subject: "[PBX RECOVERED] Phone system control plane is back up",
        text: `The PBX control plane passed a health check again.\nHealth: ${appUrl()}/api/health`,
      });
      console.log(`[health] recovery emailed to ${to}`);
    }
    clearMarker();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[health] check failed:", e);
    process.exit(1);
  });
