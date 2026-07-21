import bcrypt from "bcryptjs";

// Password hashing. Kept in its own module (no "server-only") so both the auth
// actions and the seed script can use it.
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
