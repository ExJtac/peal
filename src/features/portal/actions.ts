"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { upsertExtensionPjsip } from "@/telephony/realtime/psWriter";
import { serializeCallForward, callForwardFromForm } from "@/lib/callForward";

// Portal users can toggle their own DND.
export async function setDnd(formData: FormData): Promise<void> {
  const user = await requirePortalUser();
  if (!user.extensionId) return;
  const dnd = formData.get("dnd") === "on";
  const ext = await db.extension.update({ where: { id: user.extensionId }, data: { dnd } });
  try {
    await upsertExtensionPjsip(ext);
  } catch {
    /* asterisk realtime not reachable — DB is still updated; routing honors dnd */
  }
  revalidatePath("/portal");
}

// Portal users can set their own call forwarding (to a mobile). callForward isn't a ps_* column
// (routing reads it from the DB), so no Asterisk realtime sync is needed.
export async function setCallForward(formData: FormData): Promise<void> {
  const user = await requirePortalUser();
  if (!user.extensionId) return;
  const mode = String(formData.get("mode") ?? "off");
  const number = String(formData.get("number") ?? "");
  await db.extension.update({
    where: { id: user.extensionId },
    data: { callForward: serializeCallForward(callForwardFromForm(mode, number)) },
  });
  revalidatePath("/portal");
}
