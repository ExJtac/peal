import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./auth";

/** Require a signed-in user or redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an ADMIN (user/permission administration, sensitive config). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** Require ADMIN or MANAGER (the admin console). Plain users go to their portal. */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") redirect("/portal");
  return user;
}

/** Any authenticated user may use the portal. */
export async function requirePortalUser(): Promise<CurrentUser> {
  return requireUser();
}
