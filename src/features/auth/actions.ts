"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/auth";
import { homeForRole } from "@/lib/roles";
import { checkLock, recordFailure, recordSuccess } from "@/lib/loginThrottle";

export type AuthState = { error?: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { email, password } = parsed.data;
  const lock = checkLock(email, Date.now());
  if (lock.locked) {
    return { error: `Too many failed attempts. Try again in ${lock.retryAfterSec}s.` };
  }
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailure(email, Date.now());
    return { error: "Wrong email or password." };
  }
  recordSuccess(email);
  await createSession(user.id);
  redirect(homeForRole(user.role));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
