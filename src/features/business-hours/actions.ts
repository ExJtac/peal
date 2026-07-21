"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/guards";

const destination = z.enum(["EXTENSION", "RING_GROUP", "QUEUE", "IVR", "VOICEMAIL", "TIME_CONDITION", "HANGUP", "EXTERNAL", "AI_AGENT"]);
const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const commaList = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  day1: bool,
  day2: bool,
  day3: bool,
  day4: bool,
  day5: bool,
  day6: bool,
  day7: bool,
  openTime: z.string().trim().optional().or(z.literal("")),
  closeTime: z.string().trim().optional().or(z.literal("")),
  holidays: z.string().optional().or(z.literal("")),
  inType: destination,
  inId: z.string().trim().optional().or(z.literal("")),
  elseType: destination,
  elseId: z.string().trim().optional().or(z.literal("")),
});

export async function saveBusinessHours(formData: FormData): Promise<void> {
  await requireManager();
  const data = schema.parse(Object.fromEntries(formData));

  const dayFlags = [data.day1, data.day2, data.day3, data.day4, data.day5, data.day6, data.day7];
  const days = dayFlags.map((on, i) => (on ? i + 1 : 0)).filter((d) => d > 0);

  const id = data.id || null;
  const base = {
    name: data.name,
    timezone: data.timezone,
    rules: [{ days, start: data.openTime || "09:00", end: data.closeTime || "17:00" }],
    holidays: commaList(data.holidays),
    inType: data.inType,
    inId: data.inId || null,
    elseType: data.elseType,
    elseId: data.elseId || null,
  };

  if (id) {
    await db.businessHours.update({ where: { id }, data: base });
  } else {
    await db.businessHours.create({ data: base });
  }

  revalidatePath("/business-hours");
  redirect("/business-hours");
}

export async function deleteBusinessHours(formData: FormData): Promise<void> {
  await requireManager();
  const id = String(formData.get("id") ?? "");
  const bh = await db.businessHours.findUnique({ where: { id } });
  if (bh) await db.businessHours.delete({ where: { id } });
  revalidatePath("/business-hours");
}
