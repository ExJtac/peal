// Encrypted secret vault (AES-256-GCM) for at-rest SIP/trunk/voicemail secrets.
//
// Extension SIP passwords, trunk credentials, voicemail PINs, and provisioning
// tokens are stored as ciphertext only: the plaintext never sits in the DB, never
// leaves the server, and is never logged. The ARI daemon / provisioning service
// decrypt them at call/provision time.
//
// No "server-only" here on purpose: node:crypto already keeps this out of client
// bundles, and the plain-Node workers must be able to decrypt.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Fail loud in production rather than encrypting under a public constant. Dev/test keep a
// throwaway fallback. Rotating CRED_SECRET invalidates every stored secret.
if (!process.env.CRED_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("CRED_SECRET must be set in production (it encrypts stored SIP/trunk secrets).");
}
const SECRET = process.env.CRED_SECRET ?? "dev-only-insecure-cred-secret-change-me";
const KEY = createHash("sha256").update(SECRET).digest();
const ALGO = "aes-256-gcm";
const PREFIX = "v1";

/** Encrypt a secret string → "v1:<iv>:<tag>:<ciphertext>" (each part base64). */
export function encryptSecret(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) throw new Error("Nothing to encrypt.");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Throws on tamper, wrong key, or bad format. */
export function decryptSecret(enc: string): string {
  const parts = typeof enc === "string" ? enc.split(":") : [];
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error("Malformed ciphertext.");
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Last-4 hint for a masked "•••• 1234" display. */
export function keyHint(key: string): string {
  return key.slice(-4);
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
