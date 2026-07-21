import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";

/** Require a signed-in user or redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an ADMIN. Operators are bounced to the dashboard. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}
