"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { hashPassword } from "@/lib/password";

// User administration is ADMIN-only (Managers manage telephony config, not logins).
const schema = z.object({
  id: z.string().optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  name: z.string().trim().optional().or(z.literal("")),
  role: z.enum(["ADMIN", "MANAGER", "USER"]),
  extensionId: z.string().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
});

export async function saveUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const data = schema.parse(Object.fromEntries(formData));
  const id = data.id || null;

  const base = {
    email: data.email,
    name: data.name || null,
    role: data.role,
    extensionId: data.extensionId || null,
  };

  if (id) {
    const patch: Record<string, unknown> = { ...base };
    if (data.password && data.password.length >= 8) patch.passwordHash = await hashPassword(data.password);
    await db.user.update({ where: { id }, data: patch });
  } else {
    const pw = data.password && data.password.length >= 8 ? data.password : randomBytes(9).toString("base64url");
    await db.user.create({ data: { ...base, passwordHash: await hashPassword(pw) } });
  }

  revalidatePath("/users");
  redirect("/users");
}

export async function deleteUser(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id === admin.id) throw new Error("You can't delete your own account.");
  await db.user.delete({ where: { id } }).catch(() => {});
  revalidatePath("/users");
}
