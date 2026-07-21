import type { Role } from "@prisma/client";

// Role model: ADMIN (everything), MANAGER (manage config + reports, no user admin), USER
// (own portal/calls/voicemail only). Pure, worker-safe.

export const ROLE_RANK: Record<Role, number> = { USER: 0, MANAGER: 1, ADMIN: 2 };

/** Where a user lands after login / when hitting a page above their role. */
export function homeForRole(role: Role): string {
  return role === "USER" ? "/portal" : "/";
}

export function atLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export function roleLabel(role: Role): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}
