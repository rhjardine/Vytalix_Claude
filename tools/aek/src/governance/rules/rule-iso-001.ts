// =============================================================================
// rule-iso-001.ts — RULE-ISO-001 · Experimental Isolation (WARNING)
//
// Production code must not depend on experimental or legacy zones.
// Uses the existing dependency graph; emits WARNING-only governance findings.
// Independent of RULE-DI-001/002/003 (does not touch them).
//
// Experimental/legacy zones: src/vertical2/, src/legacy/
// Non-production callers excluded from "production": src/demo/ (dev utility).
// =============================================================================

import type { GovernanceContext, GovernanceRule, GovernanceRuleResult, GovernanceFinding } from '../governance-types';

const EXPERIMENTAL_PREFIXES = ['src/vertical2/', 'src/legacy/'];
const NON_PRODUCTION_PREFIXES = ['src/vertical2/', 'src/legacy/', 'src/demo/'];

function isExperimental(filePath: string): boolean {
  return EXPERIMENTAL_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isProduction(filePath: string): boolean {
  return !NON_PRODUCTION_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

export const ruleIso001: GovernanceRule = {
  id: 'RULE-ISO-001',
  category: 'experimentalIsolation',
  description:
    'Production modules must not import experimental (src/vertical2/) or legacy (src/legacy/) zones. Keeps the certified baseline insulated from non-production code.',
  evaluate(context: GovernanceContext): GovernanceRuleResult {
    const findings: GovernanceFinding[] = context.dependencyGraph.edges
      .filter((edge) => isProduction(edge.from))
      .filter((edge) => isExperimental(edge.to))
      .map((edge) => ({
        ruleId: this.id,
        category: this.category,
        severity: 'warning' as const,
        message: `Production module '${edge.from}' imports non-production zone '${edge.to}'. Experimental/legacy code must remain isolated.`,
        target: edge.from,
      }));

    return { ruleId: this.id, findings };
  },
};
