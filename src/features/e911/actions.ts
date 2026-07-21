"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";

const commaList = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  name: z.string().trim().min(1),
  street: z.string().trim().min(1),
  suite: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  postal: z.string().trim().min(1),
  callbackNumber: z.string().trim().min(1),
  notifyEmails: z.string().optional().or(z.literal("")),
  validated: z.coerce.boolean(),
});

export async function saveLocation(formData: FormData): Promise<void> {
  await requireAdmin();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    name: data.name,
    street: data.street,
    suite: data.suite || null,
    city: data.city,
    state: data.state,
    postal: data.postal,
    callbackNumber: data.callbackNumber,
    notifyEmails: commaList(data.notifyEmails),
    validated: data.validated,
  };

  if (id) {
    await db.e911Location.update({ where: { id }, data: base });
  } else {
    await db.e911Location.create({ data: base });
  }

  revalidatePath("/e911");
  redirect("/e911");
}

export async function deleteLocation(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const loc = await db.e911Location.findUnique({ where: { id } });
  if (loc) await db.e911Location.delete({ where: { id } });
  revalidatePath("/e911");
}
