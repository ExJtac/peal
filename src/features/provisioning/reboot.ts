"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";
import { pjsipNotify, type NotifyMode } from "@/telephony/ami";

export interface RebootResult {
  ok: boolean;
  message: string;
}

/**
 * Push a check-sync NOTIFY to one phone. `resync` = re-read config (force provision, no reboot);
 * `reboot` = reboot the phone (it re-provisions on boot). The NOTIFY targets the device's assigned
 * extension endpoint (ps_endpoints.id = ext.number).
 */
export async function rebootDevice(deviceId: string, mode: NotifyMode): Promise<RebootResult> {
  await requireManager();
  const device = await db.device.findUnique({ where: { id: deviceId }, include: { extension: true } });
  if (!device) return { ok: false, message: "Device not found." };
  if (!device.extension) return { ok: false, message: "Assign an extension to this phone first." };

  const result = await pjsipNotify(device.extension.number, mode);
  revalidatePath("/provisioning");
  return result;
}

/** Push the NOTIFY to every enabled phone with an assigned extension. */
export async function rebootAll(mode: NotifyMode): Promise<RebootResult> {
  await requireManager();
  const devices = await db.device.findMany({
    where: { enabled: true, extensionId: { not: null } },
    include: { extension: true },
  });
  if (devices.length === 0) return { ok: false, message: "No enabled phones with an assigned extension." };

  const results = await Promise.allSettled(
    devices.map((d) =>
      d.extension ? pjsipNotify(d.extension.number, mode) : Promise.resolve<RebootResult>({ ok: false, message: "no extension" }),
    ),
  );
  const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  revalidatePath("/provisioning");
  return {
    ok: sent > 0,
    message: `${mode === "reboot" ? "Rebooted" : "Re-provisioned"} ${sent}/${devices.length} phone(s).`,
  };
}
