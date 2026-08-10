// =============================================================================
// policy-registry.ts — AEK v3.0 Policy Registry Layer (scaffolding only)
//
// Defines the available governance policies and maps baseline.mode -> strategy.
// This is architectural scaffolding for future governance expansion.
//
// IMPORTANT:
//   - Only the DEFAULT policy is ACTIVE in v3.0.
//   - STRICT / MAX_FINDINGS are RESERVED identifiers — declared, NOT implemented.
//   - The v2.2 Policy Engine (AEKPolicyEngine) is referenced, never modified.
//   - selectPolicy() always falls back to DEFAULT, guaranteeing 100% backward
//     compatibility with baselines that omit `mode`.
// =============================================================================

import type { RuleEngineResult } from '../../core/rule-engine';
import { AEKPolicyEngine, type PolicyResult } from '../aek-policy-engine';
import type { Baseline } from '../baseline-schema';

/**
 * Structural contract every policy strategy satisfies.
 * AEKPolicyEngine (v2.2) already conforms structurally — it is referenced,
 * never altered.
 */
export interface PolicyStrategy {
  evaluate(engineResult: RuleEngineResult, baseline: Baseline): PolicyResult;
}

/**
 * Governance modes. Only DEFAULT resolves to an implemented strategy in v3.0.
 * STRICT and MAX_FINDINGS are reserved for a later sprint — present here purely
 * as scaffolding so the registry shape is stable for future expansion.
 */
export const PolicyMode = {
  DEFAULT: 'default',
  STRICT: 'strict',
  MAX_FINDINGS: 'max_findings',
} as const;

export type PolicyMode = (typeof PolicyMode)[keyof typeof PolicyMode];

/**
 * Registry of IMPLEMENTED strategy factories. Future modes are intentionally
 * absent until their behavior is designed; absence triggers the DEFAULT
 * fallback in selectPolicy().
 */
const REGISTRY: Partial<Record<PolicyMode, () => PolicyStrategy>> = {
  [PolicyMode.DEFAULT]: () => new AEKPolicyEngine(),
};

/**
 * Resolve a policy strategy for the given baseline mode.
 * Unknown, future, or undefined modes fall back to DEFAULT (the stable v2.2
 * engine), so existing baselines behave exactly as before.
 */
export function selectPolicy(mode?: string): PolicyStrategy {
  const key = (mode ?? PolicyMode.DEFAULT) as PolicyMode;
  const factory = REGISTRY[key] ?? REGISTRY[PolicyMode.DEFAULT];
  // The DEFAULT factory is always registered; this assertion is safe.
  return factory!();
}
