// Toll-fraud guardrail engine (pure decision core). The ARI outbound path gathers live
// counters (concurrency, velocity, spend) + policy from the DB and calls decideGuardrail
// BEFORE originating. A compromised extension dialing international premium numbers is the
// single biggest financial risk, so the default posture is deny-by-default for anything the
// extension isn't explicitly permitted to dial.
import type { CallClass, GuardrailAction } from "@prisma/client";

export interface GuardrailPolicyInput {
  internationalEnabled: boolean;
  hasInternationalPin: boolean;
  maxConcurrentOutbound: number;
  allowedCountryCodes: string[];
  blockedPrefixes: string[];
}

export interface GuardrailContext {
  callClass: CallClass;
  /** Digits only (no +), used for prefix/allowlist checks. */
  dialedDigits: string;
  /** Extension's outbound permission: internal | local | national | international. */
  extensionPermission: string;
  concurrentOutbound: number;
  velocityCount: number;
  velocityLimit: number | null;
}

export interface GuardrailDecision {
  action: GuardrailAction;
  reason: string;
}

const PERMISSION_RANK: Record<string, number> = {
  internal: 0,
  local: 1,
  national: 2,
  international: 3,
};

const CLASS_REQUIREMENT: Record<CallClass, number> = {
  EMERGENCY: 0,
  INTERNAL: 0,
  LOCAL: 1,
  TOLLFREE: 1,
  NATIONAL: 2,
  INTERNATIONAL: 3,
};

export function decideGuardrail(policy: GuardrailPolicyInput, ctx: GuardrailContext): GuardrailDecision {
  // Emergency is never blocked here (it is handled natively in the dialplan, never via Stasis).
  if (ctx.callClass === "EMERGENCY") return { action: "ALLOW", reason: "emergency" };

  for (const prefix of policy.blockedPrefixes) {
    if (prefix && ctx.dialedDigits.startsWith(prefix)) {
      return { action: "BLOCK", reason: `blocked prefix ${prefix}` };
    }
  }

  if (ctx.callClass === "INTERNATIONAL") {
    if (!policy.internationalEnabled) {
      return { action: "BLOCK", reason: "international dialing disabled" };
    }
    if (policy.allowedCountryCodes.length > 0) {
      const body = ctx.dialedDigits.replace(/^011/, "");
      const ok = policy.allowedCountryCodes.some((cc) => body.startsWith(cc));
      if (!ok) return { action: "BLOCK", reason: "destination country not in allowlist" };
    }
  }

  const need = CLASS_REQUIREMENT[ctx.callClass];
  const have = PERMISSION_RANK[ctx.extensionPermission] ?? PERMISSION_RANK.local;
  if (have < need) {
    if (ctx.callClass === "INTERNATIONAL" && policy.hasInternationalPin) {
      return { action: "PIN_REQUIRED", reason: "international requires PIN" };
    }
    return { action: "BLOCK", reason: `extension not permitted for ${ctx.callClass.toLowerCase()} calls` };
  }

  if (ctx.concurrentOutbound >= policy.maxConcurrentOutbound) {
    return { action: "BLOCK", reason: "max concurrent outbound reached" };
  }

  if (ctx.velocityLimit != null && ctx.velocityCount >= ctx.velocityLimit) {
    return { action: "BLOCK", reason: "destination call velocity exceeded" };
  }

  return { action: "ALLOW", reason: "ok" };
}
