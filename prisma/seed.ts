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

  const telnyx = await db.trunk.upsert({
    where: { name: "telnyx" },
    update: {},
    create: {
      name: "telnyx",
      provider: "TELNYX",
      authMode: "IP_AUTH",
      sipServer: "sip.telnyx.com",
      port: 5060,
      authIps: ["192.76.120.10", "64.16.250.10"],
      enabled: false, // fill in your Telnyx connection, then enable
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

  console.log("Seed complete. Admin login: admin@pbx.local / password123");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
