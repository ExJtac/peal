"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/guards";
import { db } from "@/lib/db";
import { upsertExtensionPjsip } from "@/telephony/realtime/psWriter";

// Portal users can toggle their own DND. (Call-forward, greetings, etc. can follow.)
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
