"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const schema = z.object({ boxId: z.string().trim().min(1) });

export async function toggleTranscribe(formData: FormData): Promise<void> {
  await requireManager();
  const { boxId } = schema.parse(Object.fromEntries(formData));

  const box = await db.voicemailBox.findUnique({ where: { id: boxId } });
  if (box) {
    await db.voicemailBox.update({
      where: { id: boxId },
      data: { transcribeEnabled: !box.transcribeEnabled },
    });
  }

  revalidatePath("/voicemail");
}
