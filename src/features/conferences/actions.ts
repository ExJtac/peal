"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const checkbox = z.preprocess((v) => v === "on" || v === true, z.boolean());
const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  number: z.string().trim().min(1),
  name: z.string().trim().min(1),
  mohWhenAlone: checkbox.default(false),
  record: checkbox.default(false),
  maxMembers: z.coerce.number().int().min(2).max(100).default(20),
});

export async function saveConference(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));
  const base = { number: data.number, name: data.name, mohWhenAlone: data.mohWhenAlone, record: data.record, maxMembers: data.maxMembers };
  if (data.id) await db.conference.update({ where: { id: data.id }, data: base });
  else await db.conference.create({ data: base });
  revalidatePath("/conferences");
  redirect("/conferences");
}

export async function deleteConference(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const conf = await db.conference.findUnique({ where: { id } });
  if (conf) await db.conference.delete({ where: { id } });
  revalidatePath("/conferences");
}
