import "dotenv/config";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { encryptSecret } from "@/lib/crypto-vault";

// Seeds a single-tenant PBX: an admin login, company + guardrail + status singletons, two demo
// extensions with voicemail boxes, and a disabled Telnyx trunk + national outbound route
// template (ready to fill in). Idempotent.
async function main() {
  const adminEmail = "admin@pbx.local";
  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, name: "Administrator", role: "ADMIN", passwordHash: await hashPassword("password123") },
  });

  await db.companySettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", companyName: "My Company", timezone: "America/Chicago", sipDomain: "pbx.local" },
  });

  await db.guardrailPolicy.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", internationalEnabled: false, maxConcurrentOutbound: 4, allowedCountryCodes: [], blockedPrefixes: ["1900"] },
  });

  await db.systemStatus.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });

  for (const [number, displayName, permission] of [
    ["1001", "Front Desk", "national"],
    ["1002", "Sales", "national"],
  ] as const) {
    await db.extension.upsert({
      where: { number },
      update: {},
      create: {
        number,
        displayName,
        outboundPermission: permission,
        sipPasswordEnc: encryptSecret(`sip-${number}-devpass`),
        callerIdName: displayName,
        mailbox: { create: { mailbox: number, email: adminEmail } },
      },
    });
  }

  // A WebRTC (browser softphone) extension + the portal user bound to it, plus a manager login.
  const webExt = await db.extension.upsert({
    where: { number: "2001" },
    update: { webrtc: true },
    create: {
      number: "2001",
      displayName: "Web User",
      webrtc: true,
      outboundPermission: "national",
      callerIdName: "Web User",
      sipPasswordEnc: encryptSecret("sip-2001-devpass"),
      mailbox: { create: { mailbox: "2001", email: "user@pbx.local" } },
    },
  });
  await db.user.upsert({
    where: { email: "manager@pbx.local" },
    update: { role: "MANAGER" },
    create: { email: "manager@pbx.local", name: "Manager", role: "MANAGER", passwordHash: await hashPassword("password123") },
  });
  await db.user.upsert({
    where: { email: "user@pbx.local" },
    update: { role: "USER", extensionId: webExt.id },
    create: { email: "user@pbx.local", name: "Web User", role: "USER", extensionId: webExt.id, passwordHash: await hashPassword("password123") },
  });

  const telnyx = await db.trunk.upsert({
    where: { name: "telnyx" },
    update: {},
    create: {
      name: "telnyx",
      provider: "TELNYX",
      // REGISTER (credentials) is the NAT-friendly default — the dev VM is double-NAT'd, so an
      // IP_AUTH trunk could never receive inbound PSTN here. Add your SIP username/password +
      // registerEnabled, then enable. See TRUNK-SETUP.md.
      authMode: "REGISTER",
      sipServer: "sip.telnyx.com",
      port: 5060,
      authIps: ["192.76.120.10", "64.16.250.10"],
      enabled: false, // fill in your Telnyx SIP credentials, tick registerEnabled, then enable
    },
  });

  await db.outboundRoute.upsert({
    where: { id: "seed-national" },
    update: {},
    create: {
      id: "seed-national",
      name: "US National",
      priority: 100,
      matchPattern: "_1NXXNXXXXXX",
      trunkId: telnyx.id,
      permissionTag: "national",
      enabled: false,
    },
  });

  console.log("Seed complete. Logins (all password123):");
  console.log("  admin@pbx.local   (ADMIN)");
  console.log("  manager@pbx.local (MANAGER)");
  console.log("  user@pbx.local    (USER, ext 2001 WebRTC → portal)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
