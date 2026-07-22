import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, tryDecryptSecret } from "@/lib/crypto-vault";

// test/setup.ts sets CRED_SECRET globally; snapshot + restore so these mutations don't leak.
let savedCur: string | undefined;
let savedOld: string | undefined;

beforeEach(() => {
  savedCur = process.env.CRED_SECRET;
  savedOld = process.env.CRED_SECRET_OLD;
});
afterEach(() => {
  if (savedCur === undefined) delete process.env.CRED_SECRET;
  else process.env.CRED_SECRET = savedCur;
  if (savedOld === undefined) delete process.env.CRED_SECRET_OLD;
  else process.env.CRED_SECRET_OLD = savedOld;
});

describe("crypto-vault round-trip", () => {
  it("encrypts + decrypts, with a random IV each time", () => {
    process.env.CRED_SECRET = "key-A";
    delete process.env.CRED_SECRET_OLD;
    const a = encryptSecret("s3cret");
    const b = encryptSecret("s3cret");
    expect(a).not.toBe(b); // random IV
    expect(decryptSecret(a)).toBe("s3cret");
  });

  it("throws / returns null on malformed input", () => {
    process.env.CRED_SECRET = "key-A";
    expect(() => decryptSecret("garbage")).toThrow();
    expect(() => decryptSecret("v1:only:three")).toThrow();
    expect(tryDecryptSecret("garbage")).toBeNull();
  });
});

describe("crypto-vault key rotation", () => {
  it("decrypts old ciphertext via a fallback, then re-encrypts under the new primary", () => {
    // encrypt under the OLD key
    process.env.CRED_SECRET = "OLDKEY";
    delete process.env.CRED_SECRET_OLD;
    const ctOld = encryptSecret("pw");

    // rotate: new primary + old as fallback → still decryptable, via the fallback
    process.env.CRED_SECRET = "NEWKEY";
    process.env.CRED_SECRET_OLD = "OLDKEY";
    expect(decryptSecret(ctOld)).toBe("pw");
    expect(tryDecryptSecret(ctOld)?.keyId).toBe(0); // fallback index 0

    // re-encrypt (what the rotation script does) → now under the primary key
    const ctNew = encryptSecret("pw");
    expect(tryDecryptSecret(ctNew)?.keyId).toBe("primary");

    // drop the old key: new ciphertext still works, old ciphertext no longer decrypts
    delete process.env.CRED_SECRET_OLD;
    expect(decryptSecret(ctNew)).toBe("pw");
    expect(tryDecryptSecret(ctOld)).toBeNull();
    expect(() => decryptSecret(ctOld)).toThrow();
  });

  it("supports a comma-separated list of old keys", () => {
    process.env.CRED_SECRET = "k1";
    delete process.env.CRED_SECRET_OLD;
    const c1 = encryptSecret("one");
    process.env.CRED_SECRET = "k2";
    const c2 = encryptSecret("two");

    process.env.CRED_SECRET = "k3";
    process.env.CRED_SECRET_OLD = "k1, k2";
    expect(decryptSecret(c1)).toBe("one");
    expect(decryptSecret(c2)).toBe("two");
  });

  it("returns null / throws for a wrong key with no matching fallback", () => {
    process.env.CRED_SECRET = "A";
    delete process.env.CRED_SECRET_OLD;
    const ct = encryptSecret("x");
    process.env.CRED_SECRET = "B";
    delete process.env.CRED_SECRET_OLD;
    expect(tryDecryptSecret(ct)).toBeNull();
    expect(() => decryptSecret(ct)).toThrow();
  });
});
